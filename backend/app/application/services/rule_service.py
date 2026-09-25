"""
Rule application service
"""
from typing import Optional, List
from app.domain.repositories import RuleRepository
from app.domain.entities import Rule


class RuleService:
    """Service for rule operations"""
    
    def __init__(self, rule_repo: RuleRepository):
        self.rule_repo = rule_repo
    
    def list_rules(
        self,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> tuple[List[Rule], int, int]:
        """List rules with pagination"""
        offset = (page - 1) * page_size
        rules, total = self.rule_repo.list_rules(
            status=status,
            limit=page_size,
            offset=offset
        )
        
        total_pages = (total + page_size - 1) // page_size
        return rules, total, total_pages
    
    def get_rule(self, rule_id: str) -> Optional[Rule]:
        """Get a single rule"""
        return self.rule_repo.get_rule(rule_id)
    
    def approve_rule(self, rule_id: str, user: str) -> bool:
        """Approve a rule"""
        return self.rule_repo.approve_rule(rule_id, user)
    
    def reject_rule(self, rule_id: str, user: str, reason: str) -> bool:
        """Reject a rule"""
        return self.rule_repo.reject_rule(rule_id, user, reason)
