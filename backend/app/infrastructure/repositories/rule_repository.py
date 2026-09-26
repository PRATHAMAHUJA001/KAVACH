"""
Concrete implementation of RuleRepository using Snowflake.

Rules join their extraction candidate (severity, source quote) and the cited
paragraph in AI.REG_CHUNKS. All values are bound (`params=`).
"""
from __future__ import annotations

import io
import json
from datetime import datetime
from typing import List, Optional

from snowflake.snowpark import Session

from app.domain import policies
from app.domain.entities import Rule, RuleConflict, RuleHealthRow, UploadJob
from app.domain.repositories import RuleRepository
from app.infrastructure.repositories.dashboard_repository import _naive

UPLOAD_STAGE = "@KAVACH_DB.RAW.REG_STAGE"

_RULE_SELECT = """
    SELECT l.rule_id, l.rule_name, l.version, l.typology, l.entity, l.sql_text, l.params, l.status,
           l.source_citation, l.created_at, l.approved_by, l.rejected_by, l.rejection_reason,
           c.severity, c.circular_no, c.para_no, COALESCE(ch.text, c.source_quote) AS source_text
    FROM RULES.RULE_LIBRARY l
    LEFT JOIN RULES.RULE_CANDIDATES c ON c.rule_id = l.rule_candidate_id
    LEFT JOIN (
        SELECT circular_no, para_no, ANY_VALUE(text) AS text FROM AI.REG_CHUNKS GROUP BY 1, 2
    ) ch ON ch.circular_no = c.circular_no AND ch.para_no = c.para_no
"""


def _json(v) -> dict | None:
    if v is None or isinstance(v, dict):
        return v
    try:
        out = json.loads(v)
    except (TypeError, ValueError):
        return None
    return out if isinstance(out, dict) else None


def _to_rule(r) -> Rule:
    cite = policies.parse_citation(r['SOURCE_CITATION'])
    return Rule(
        rule_id=r['RULE_ID'], rule_name=r['RULE_NAME'], version=int(r['VERSION'] or 1), typology=r['TYPOLOGY'],
        sql_text=r['SQL_TEXT'], status=r['STATUS'], source_citation=r['SOURCE_CITATION'] or "",
        created_at=_naive(r['CREATED_AT']), entity=r['ENTITY'], params=_json(r['PARAMS']), severity=r['SEVERITY'],
        approved_by=r['APPROVED_BY'], rejected_by=r['REJECTED_BY'], rejection_reason=r['REJECTION_REASON'],
        circular_no=r['CIRCULAR_NO'] or (cite[0] if cite else None),
        para_no=str(r['PARA_NO']) if r['PARA_NO'] is not None else (cite[1] if cite else None),
        source_text=r['SOURCE_TEXT'],
    )


class SnowflakeRuleRepository(RuleRepository):
    """Snowflake implementation of RuleRepository"""

    def __init__(self, session: Session):
        self.session = session

    def list_rules(self, status: Optional[str] = None, limit: int = 20, offset: int = 0) -> tuple[List[Rule], int]:
        where, params = ("WHERE l.status = ?", [status]) if status else ("", [])
        rows = self.session.sql(
            f"SELECT * FROM ({_RULE_SELECT} {where}) ORDER BY created_at DESC, rule_name LIMIT {int(limit)} OFFSET {int(offset)}",
            params=params,
        ).collect()
        total = self.session.sql(f"SELECT COUNT(*) AS n FROM RULES.RULE_LIBRARY l {where}", params=params).collect()[0]['N']
        return [_to_rule(r) for r in rows], int(total)

    def get_rule(self, rule_id: str) -> Optional[Rule]:
        rows = self.session.sql(f"{_RULE_SELECT} WHERE l.rule_id = ?", params=[rule_id]).collect()
        return _to_rule(rows[0]) if rows else None

    def _update(self, sql: str, params: list) -> bool:
        rows = self.session.sql(sql, params=params).collect()
        return bool(rows and rows[0][0])

    def approve_rule(self, rule_id: str, user: str) -> bool:
        return self._update(
            "UPDATE RULES.RULE_LIBRARY SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP(), "
            "rejected_by = NULL, rejection_reason = NULL, rejected_at = NULL WHERE rule_id = ?",
            [user, rule_id],
        )

    def reject_rule(self, rule_id: str, user: str, reason: str) -> bool:
        return self._update(
            "UPDATE RULES.RULE_LIBRARY SET status = 'REJECTED', rejected_by = ?, rejection_reason = ?, rejected_at = CURRENT_TIMESTAMP() "
            "WHERE rule_id = ?",
            [user, reason, rule_id],
        )

    def rule_versions(self, rule_id: str) -> List[Rule]:
        """Every version in this rule's amendment line: same typology, citing the same
        circular or an amendment of it."""
        rule = self.get_rule(rule_id)
        if not rule:
            return []
        circulars = {rule.circular_no} if rule.circular_no else set()
        amended = (rule.source_citation or "").split("(amends ")
        if len(amended) > 1:
            circulars.add(amended[1].rstrip(") "))
        if not circulars:
            return [rule]
        like = " OR ".join("l.source_citation ILIKE ?" for _ in circulars)
        rows = self.session.sql(
            f"SELECT * FROM ({_RULE_SELECT} WHERE l.typology = ? AND ({like})) ORDER BY version, created_at",
            params=[rule.typology] + [f"%{c}%" for c in sorted(circulars)],
        ).collect()
        # Keep only this rule's paragraph among v1s, plus every amendment (v2+).
        return [r for r in map(_to_rule, rows) if r.rule_id == rule_id or r.version > 1 or r.para_no == rule.para_no and r.circular_no == rule.circular_no]

    def conflicts(self) -> List[RuleConflict]:
        rows = self.session.sql(
            "SELECT conflict_id, rule_id_a, rule_id_b, typology, entity, description, status, detected_at "
            "FROM RULES.RULE_CONFLICTS ORDER BY status DESC, detected_at DESC"
        ).collect()
        ids = sorted({r['RULE_ID_A'] for r in rows} | {r['RULE_ID_B'] for r in rows})
        if not ids:
            return []
        marks = ", ".join("?" * len(ids))
        rules = {r.rule_id: r for r in map(_to_rule, self.session.sql(f"{_RULE_SELECT} WHERE l.rule_id IN ({marks})", params=ids).collect())}
        return [
            RuleConflict(
                conflict_id=r['CONFLICT_ID'], typology=r['TYPOLOGY'], entity=r['ENTITY'], description=r['DESCRIPTION'],
                status=r['STATUS'], detected_at=_naive(r['DETECTED_AT']) if r['DETECTED_AT'] else None,
                rule_a=rules[r['RULE_ID_A']], rule_b=rules[r['RULE_ID_B']],
            )
            for r in rows
            if r['RULE_ID_A'] in rules and r['RULE_ID_B'] in rules
        ]

    def health_counts(self) -> tuple[dict, List[RuleHealthRow]]:
        totals = self.session.sql(
            """
            SELECT COUNT(*) AS total, COUNT_IF(status = 'APPROVED') AS active,
                   COUNT_IF(status = 'PENDING_APPROVAL') AS pending, COUNT_IF(status = 'REJECTED') AS rejected
            FROM RULES.RULE_LIBRARY
            """
        ).collect()[0]
        # "Last 30 days" is measured against the newest alert, like the rest of the app.
        rows = self.session.sql(
            """
            WITH recent AS (
                SELECT * FROM CORE.ALERTS
                WHERE created_at > DATEADD('day', -30, (SELECT MAX(created_at) FROM CORE.ALERTS))
            )
            SELECT l.rule_id, l.rule_name, l.typology,
                   COUNT(a.alert_id) AS alerts,
                   COUNT_IF(a.resolution = 'TRUE_POSITIVE') AS confirmed,
                   COUNT_IF(a.resolution = 'FALSE_POSITIVE') AS dismissed
            FROM RULES.RULE_LIBRARY l
            LEFT JOIN recent a ON a.rule_id = l.rule_id
            WHERE l.status NOT IN ('REJECTED', 'SUPERSEDED')
            GROUP BY 1, 2, 3
            ORDER BY alerts DESC, l.rule_name
            """
        ).collect()
        return (
            {k.lower(): int(totals[k] or 0) for k in ("TOTAL", "ACTIVE", "PENDING", "REJECTED")},
            [RuleHealthRow(r['RULE_ID'], r['RULE_NAME'], r['TYPOLOGY'], int(r['ALERTS']), int(r['CONFIRMED']), int(r['DISMISSED'])) for r in rows],
        )

    def evaluation(self) -> Optional[dict]:
        """Rule coverage measured against RAW.GROUND_TRUTH (the fraud the generator planted).
        Prefers ML.EVAL_* when the ML pipeline has written it."""
        try:
            cov = self.session.sql("SELECT * FROM ML.EVAL_TYPOLOGY_COVERAGE").collect()
        except Exception:
            cov = []
        if cov:
            rep = self.session.sql("SELECT * FROM ML.EVAL_REPORT LIMIT 1").collect()
            r0 = rep[0].as_dict() if rep else {}
            return {
                "coverage": [{k.lower(): v for k, v in c.as_dict().items()} for c in cov],
                "precision": float(r0.get("PRECISION") or 0), "recall": float(r0.get("RECALL") or 0),
                "test_set_size": int(r0.get("TEST_SET_SIZE") or 0), "source": "ML.EVAL_REPORT",
            }
        rows = self.session.sql(
            """
            WITH truth AS (SELECT DISTINCT entity_id AS account_id, typology FROM RAW.GROUND_TRUTH WHERE entity_type = 'ACCOUNT'),
            alerted AS (SELECT account_id, MAX(score) AS score, COUNT(*) AS n FROM CORE.ALERTS GROUP BY 1),
            top50 AS (SELECT account_id FROM alerted ORDER BY score DESC, n DESC, account_id LIMIT 50)
            SELECT t.typology, COUNT(*) AS fraud_cases,
                   COUNT(al.account_id) AS caught_by_rules,
                   COUNT(tp.account_id) AS caught_in_top_50
            FROM truth t
            LEFT JOIN alerted al ON al.account_id = t.account_id
            LEFT JOIN top50 tp ON tp.account_id = t.account_id
            GROUP BY 1 ORDER BY 2 DESC
            """
        ).collect()
        if not rows:
            return None
        pr = self.session.sql(
            """
            WITH truth AS (SELECT DISTINCT entity_id AS account_id FROM RAW.GROUND_TRUTH WHERE entity_type = 'ACCOUNT'),
            alerted AS (SELECT DISTINCT account_id FROM CORE.ALERTS)
            SELECT (SELECT COUNT(*) FROM alerted) AS alerted,
                   (SELECT COUNT(*) FROM alerted JOIN truth USING (account_id)) AS hits,
                   (SELECT COUNT(*) FROM truth) AS truth
            """
        ).collect()[0]
        return {
            "coverage": [{"typology": r['TYPOLOGY'], "fraud_cases": int(r['FRAUD_CASES']), "caught_by_rules": int(r['CAUGHT_BY_RULES']),
                          "caught_in_top_50": int(r['CAUGHT_IN_TOP_50'])} for r in rows],
            "precision": round(pr['HITS'] / pr['ALERTED'], 3) if pr['ALERTED'] else 0.0,
            "recall": round(pr['HITS'] / pr['TRUTH'], 3) if pr['TRUTH'] else 0.0,
            "test_set_size": int(pr['TRUTH']),
            "source": "RAW.GROUND_TRUTH",
        }

    # ───────── circular uploads ─────────

    def create_job(self, job_id: str, filename: str) -> None:
        self.session.sql(
            "INSERT INTO APP.UPLOAD_JOBS (job_id, filename, status, step, progress, message, rule_ids) "
            "SELECT ?, ?, 'RUNNING', 0, 5, 'Reading the circular', PARSE_JSON('[]')",
            params=[job_id, filename],
        ).collect()

    def update_job(self, job_id: str, *, status: str, step: int, progress: int, message: str,
                   circular_no: Optional[str] = None, rule_ids: Optional[list[str]] = None) -> None:
        self.session.sql(
            "UPDATE APP.UPLOAD_JOBS SET status = ?, step = ?, progress = ?, message = ?, "
            "circular_no = COALESCE(?, circular_no), rule_ids = COALESCE(PARSE_JSON(?), rule_ids), updated_at = CURRENT_TIMESTAMP() "
            "WHERE job_id = ?",
            params=[status, step, progress, message, circular_no, json.dumps(rule_ids) if rule_ids is not None else None, job_id],
        ).collect()

    def get_job(self, job_id: str) -> Optional[UploadJob]:
        rows = self.session.sql("SELECT * FROM APP.UPLOAD_JOBS WHERE job_id = ?", params=[job_id]).collect()
        if not rows:
            return None
        r = rows[0]
        ids = json.loads(r['RULE_IDS']) if isinstance(r['RULE_IDS'], str) else (r['RULE_IDS'] or [])
        return UploadJob(r['JOB_ID'], r['FILENAME'], r['STATUS'], int(r['STEP'] or 0), int(r['PROGRESS'] or 0), r['MESSAGE'] or "", r['CIRCULAR_NO'], list(ids))

    def store_upload(self, filename: str, data: bytes) -> str:
        """Puts the PDF on the circulars stage; returns its path relative to the stage."""
        rel = f"uploads/{filename}"
        self.session.file.put_stream(io.BytesIO(data), f"{UPLOAD_STAGE}/{rel}", auto_compress=False, overwrite=True)
        self.session.sql(f"ALTER STAGE {UPLOAD_STAGE[1:]} REFRESH").collect()
        return rel

    def parse_upload(self, rel_path: str) -> str:
        """AI_PARSE_DOCUMENT on one file, then re-chunk every parsed circular. Returns the
        circular number the chunker found in the new document."""
        doc_id = f"UPL-{datetime.now():%Y%m%d%H%M%S}-{abs(hash(rel_path)) % 10**6:06d}"
        self.session.sql(
            f"""
            INSERT INTO AI.REG_DOCS_PARSED (DOC_ID, FILENAME, RAW_CONTENT)
            SELECT ?, ?, AI_PARSE_DOCUMENT(TO_FILE('{UPLOAD_STAGE}', ?), {{'mode': 'LAYOUT', 'page_split': TRUE}})
            """,
            params=[doc_id, rel_path, rel_path],
        ).collect()
        self.session.sql("CALL AI.CHUNK_PARSED_DOCS()").collect()
        rows = self.session.sql("SELECT MIN(circular_no) AS c, COUNT(*) AS n FROM AI.REG_CHUNKS WHERE doc_id = ?", params=[doc_id]).collect()
        if not rows or not rows[0]['N']:
            raise ValueError("No numbered paragraphs were found in this PDF.")
        return rows[0]['C']

    def extract_obligations(self, circular_no: str) -> str:
        return str(self.session.sql("CALL RULES.EXTRACT_RULES_FROM_CHUNKS(?)", params=[circular_no]).collect()[0][0])

    def compile_checks(self, circular_no: str) -> list[str]:
        self.session.sql("CALL RULES.COMPILE_RULES()").collect()
        self.session.sql("CALL RULES.APPLY_AMENDMENTS()").collect()
        self.session.sql("CALL RULES.DETECT_CONFLICTS()").collect()
        rows = self.session.sql(
            "SELECT rule_id FROM RULES.RULE_LIBRARY WHERE source_citation ILIKE ? AND status = 'PENDING_APPROVAL' ORDER BY rule_name",
            params=[f"{circular_no}%"],
        ).collect()
        return [r['RULE_ID'] for r in rows]
