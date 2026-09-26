"""
Rule application service: review (approve/reject), versions, conflicts, health,
evaluation, and turning an uploaded circular into pending rules.
"""
from __future__ import annotations

import logging
import re
import uuid
from typing import List, Optional

from app.domain import policies
from app.domain.entities import Rule, RuleConflict, UploadJob
from app.domain.repositories import RuleRepository

log = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# Upload steps (the UI stepper): 0 reading · 1 finding obligations · 2 writing checks · 3 ready for review · 4 done
STEP_MESSAGES = ["Reading the circular", "Finding obligations", "Writing checks", "Ready for review"]


def safe_filename(name: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", (name or "circular.pdf").rsplit("/", 1)[-1]).strip("._") or "circular"
    return base if base.lower().endswith(".pdf") else f"{base}.pdf"


class RuleService:
    """Service for rule operations"""

    def __init__(self, rule_repo: RuleRepository):
        self.rule_repo = rule_repo

    def list_rules(self, status: Optional[str] = None, page: int = 1, page_size: int = 20) -> tuple[List[Rule], int, int]:
        offset = (page - 1) * page_size
        rules, total = self.rule_repo.list_rules(status=status, limit=page_size, offset=offset)
        return rules, total, (total + page_size - 1) // page_size

    def get_rule(self, rule_id: str) -> Optional[Rule]:
        return self.rule_repo.get_rule(rule_id)

    def approve_rule(self, rule_id: str, user: str) -> bool:
        return self.rule_repo.approve_rule(rule_id, user)

    def reject_rule(self, rule_id: str, user: str, reason: str) -> bool:
        return self.rule_repo.reject_rule(rule_id, user, reason)

    def versions(self, rule_id: str) -> List[Rule]:
        return self.rule_repo.rule_versions(rule_id)

    def conflicts(self) -> List[RuleConflict]:
        return self.rule_repo.conflicts()

    def health(self) -> dict:
        totals, rows = self.rule_repo.health_counts()
        out = []
        for r in rows:
            precision, verdict, fix = policies.rule_health(r.alerts_30d, r.confirmed_30d, r.dismissed_30d)
            out.append({
                "rule_id": r.rule_id, "rule_name": r.rule_name, "typology": r.typology,
                "alerts_30d": r.alerts_30d, "confirmed_30d": r.confirmed_30d, "precision": precision, "verdict": verdict,
                "proposed_fix": fix[0] if fix else None, "proposed_fix_hi": fix[1] if fix else None,
            })
        judged = [x for x, r in zip(out, rows) if r.confirmed_30d + r.dismissed_30d > 0]
        return {
            "total_rules": totals["total"], "active_rules": totals["active"], "pending_rules": totals["pending"],
            "rejected_rules": totals["rejected"],
            "avg_precision": round(sum(x["precision"] for x in judged) / len(judged), 3) if judged else 0.0,
            "rules": out,
        }

    def evaluation(self) -> Optional[dict]:
        return self.rule_repo.evaluation()

    # ───────── uploads ─────────

    def start_upload(self, filename: str, data: bytes) -> UploadJob:
        if not data.startswith(b"%PDF"):
            raise ValueError("Please upload a PDF file.")
        if len(data) > MAX_UPLOAD_BYTES:
            raise ValueError("The file is larger than 10 MB.")
        job_id = f"JOB-{uuid.uuid4().hex[:12].upper()}"
        name = safe_filename(filename)
        self.rule_repo.create_job(job_id, name)
        return UploadJob(job_id, name, "RUNNING", 0, 5, STEP_MESSAGES[0])

    def process_upload(self, job_id: str, filename: str, data: bytes) -> None:
        """Runs after the request returns. Each step records progress; any failure marks
        the job FAILED with a plain message instead of leaving it spinning."""
        repo = self.rule_repo
        step = 0
        try:
            rel = repo.store_upload(filename, data)
            circular_no = repo.parse_upload(rel)
            step = 1
            repo.update_job(job_id, status="RUNNING", step=1, progress=35, message=STEP_MESSAGES[1], circular_no=circular_no)
            repo.extract_obligations(circular_no)
            step = 2
            repo.update_job(job_id, status="RUNNING", step=2, progress=70, message=STEP_MESSAGES[2])
            rule_ids = repo.compile_checks(circular_no)
            repo.update_job(job_id, status="COMPLETED", step=4, progress=100,
                            message=f"{len(rule_ids)} check{'s' if len(rule_ids) != 1 else ''} ready for review", rule_ids=rule_ids)
        except Exception as e:  # recorded on the job; the UI shows it
            log.exception("upload %s failed at step %s", job_id, step)
            msg = str(e) if isinstance(e, ValueError) else f"{STEP_MESSAGES[step]} failed. Please try again."
            repo.update_job(job_id, status="FAILED", step=step, progress=100, message=msg)

    def get_job(self, job_id: str) -> Optional[UploadJob]:
        return self.rule_repo.get_job(job_id)
