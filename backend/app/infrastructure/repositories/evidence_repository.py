"""
Concrete implementation of EvidenceRepository using Snowflake
"""
from typing import Optional
import io
import hashlib
import json
from snowflake.snowpark import Session
from app.domain.entities import Evidence
from app.domain.repositories import EvidenceRepository
from app.application.services.evidence_rendering import (
    render_evidence_html,
    render_evidence_pdf,
    parse_citation,
)


class SnowflakeEvidenceRepository(EvidenceRepository):
    """Snowflake implementation of EvidenceRepository"""
    
    def __init__(self, session: Session):
        self.session = session
    
    def get_evidence(self, alert_id: str) -> Optional[Evidence]:
        """Get evidence for an alert"""
        sql = f"""
            SELECT alert_id, evidence_json, file_path, sha256_hash,
                   html_file_path, html_sha256_hash, pdf_file_path, pdf_sha256_hash,
                   created_by, created_at
            FROM AUDIT.EVIDENCE_REGISTRY
            WHERE alert_id = '{alert_id}'
        """
        
        rows = self.session.sql(sql).collect()
        if not rows:
            return None
        
        row = rows[0]
        raw_json = row['EVIDENCE_JSON']
        if not raw_json:
            parsed_json = {}
        elif isinstance(raw_json, dict):
            parsed_json = raw_json
        else:
            parsed_json = json.loads(raw_json)

        return Evidence(
            alert_id=row['ALERT_ID'],
            evidence_json=parsed_json,
            file_path=row['FILE_PATH'],
            sha256_hash=row['SHA256_HASH'],
            html_file_path=row['HTML_FILE_PATH'],
            html_sha256_hash=row['HTML_SHA256_HASH'],
            pdf_file_path=row['PDF_FILE_PATH'],
            pdf_sha256_hash=row['PDF_SHA256_HASH'],
            created_by=row['CREATED_BY'],
            created_at=row['CREATED_AT']
        )
    
    def verify_evidence(self, alert_id: str) -> dict:
        """Verify evidence integrity - JSON hash (via AI.VERIFY_EVIDENCE) plus an
        independent re-hash of the HTML artifact downloaded from the stage."""
        sql = f"SELECT AI.VERIFY_EVIDENCE('{alert_id}')"
        rows = self.session.sql(sql).collect()
        if not rows or rows[0][0] is None:
            return {"verified": False, "has_evidence": False, "reason": "No evidence found"}

        raw = rows[0][0]
        result = raw if isinstance(raw, dict) else json.loads(raw)

        evidence = self.get_evidence(alert_id)
        if evidence and evidence.html_file_path and evidence.html_sha256_hash:
            try:
                stream = self.session.file.get_stream(f"@APP.EVIDENCE_STAGE/{evidence.html_file_path}")
                html_bytes = stream.read()
                computed_hash = hashlib.sha256(html_bytes).hexdigest()
                result["html_file_path"] = evidence.html_file_path
                result["html_stored_hash"] = evidence.html_sha256_hash
                result["html_computed_hash"] = computed_hash
                result["html_integrity_status"] = "MATCH" if computed_hash == evidence.html_sha256_hash else "TAMPERED"
            except Exception as e:
                result["html_integrity_status"] = f"ERROR: {e}"

        return result

    def create_evidence(self, alert_id: str, evidence_json: dict) -> Evidence:
        """Create evidence pack - calls AI.BUILD_EVIDENCE_PACK, then renders and
        stages a human-readable HTML (and best-effort PDF) copy alongside the JSON."""
        self.session.sql(f"CALL AI.BUILD_EVIDENCE_PACK('{alert_id}')").collect()
        
        # Retrieve the created evidence
        evidence = self.get_evidence(alert_id)
        if not evidence:
            raise RuntimeError(f"Failed to create evidence for alert {alert_id}")

        self._render_and_stage_documents(evidence)

        # re-fetch so the returned entity carries the html/pdf paths+hashes
        evidence = self.get_evidence(alert_id)
        return evidence

    def _lookup_regulation_quote(self, source_citation: Optional[str]) -> Optional[str]:
        circular_no, para_no = parse_citation(source_citation)
        if not circular_no or not para_no:
            return None
        try:
            escaped = circular_no.replace("'", "''")
            rows = self.session.sql(
                f"SELECT text FROM AI.REG_CHUNKS WHERE circular_no = '{escaped}' AND para_no = {int(para_no)} LIMIT 1"
            ).collect()
            return rows[0]["TEXT"] if rows else None
        except Exception:
            return None

    def _render_and_stage_documents(self, evidence: Evidence) -> None:
        quote = self._lookup_regulation_quote((evidence.evidence_json.get("rule") or {}).get("source_citation"))
        html = render_evidence_html(evidence.evidence_json, regulation_quote=quote)
        html_bytes = html.encode("utf-8")
        html_hash = hashlib.sha256(html_bytes).hexdigest()
        html_rel_path = f"evidence_{evidence.alert_id}.html"

        self.session.file.put_stream(
            io.BytesIO(html_bytes), f"@APP.EVIDENCE_STAGE/{html_rel_path}",
            auto_compress=False, overwrite=True,
        )

        pdf_rel_path = None
        pdf_hash = None
        pdf_bytes = render_evidence_pdf(html)
        if pdf_bytes:
            pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
            pdf_rel_path = f"evidence_{evidence.alert_id}.pdf"
            self.session.file.put_stream(
                io.BytesIO(pdf_bytes), f"@APP.EVIDENCE_STAGE/{pdf_rel_path}",
                auto_compress=False, overwrite=True,
            )

        pdf_path_sql = f"'{pdf_rel_path}'" if pdf_rel_path else "NULL"
        pdf_hash_sql = f"'{pdf_hash}'" if pdf_hash else "NULL"
        self.session.sql(f"""
            UPDATE AUDIT.EVIDENCE_REGISTRY
            SET html_file_path = '{html_rel_path}',
                html_sha256_hash = '{html_hash}',
                pdf_file_path = {pdf_path_sql},
                pdf_sha256_hash = {pdf_hash_sql}
            WHERE alert_id = '{evidence.alert_id}'
        """).collect()

