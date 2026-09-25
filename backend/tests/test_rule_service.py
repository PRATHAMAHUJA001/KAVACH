"""
Unit tests for RuleService with fake repository
"""
import pytest
from datetime import datetime
from typing import Optional, List
from app.domain.entities import Rule
from app.domain.repositories import RuleRepository
from app.application.services.rule_service import RuleService


class FakeRuleRepository(RuleRepository):
    """Fake rule repository for testing"""
    
    def __init__(self):
        self.rules = [
            Rule(
                rule_id="RULE-001",
                rule_name="STRUCTURING_RULE",
                version=1,
                typology="Structuring",
                sql_text="SELECT * FROM transactions WHERE amount < 10000",
                status="ACTIVE",
                source_citation="CIR-2024-001",
                created_at=datetime(2026, 9, 1, 10, 0, 0)
            ),
            Rule(
                rule_id="RULE-002",
                rule_name="LAYERING_RULE",
                version=1,
                typology="Money Laundering",
                sql_text="SELECT * FROM transactions WHERE pattern = 'layering'",
                status="PENDING",
                source_citation="CIR-2024-002",
                created_at=datetime(2026, 9, 2, 11, 0, 0)
            )
        ]
    
    def list_rules(
        self,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> tuple[List[Rule], int]:
        filtered = self.rules
        
        if status:
            filtered = [r for r in filtered if r.status == status]
        
        total = len(filtered)
        paginated = filtered[offset:offset + limit]
        
        return paginated, total
    
    def get_rule(self, rule_id: str) -> Optional[Rule]:
        for rule in self.rules:
            if rule.rule_id == rule_id:
                return rule
        return None
    
    def approve_rule(self, rule_id: str, user: str) -> bool:
        for rule in self.rules:
            if rule.rule_id == rule_id:
                rule.status = "ACTIVE"
                return True
        return False
    
    def reject_rule(self, rule_id: str, user: str, reason: str) -> bool:
        for rule in self.rules:
            if rule.rule_id == rule_id:
                rule.status = "REJECTED"
                return True
        return False


class TestRuleService:
    """Test cases for RuleService"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.fake_repo = FakeRuleRepository()
        self.service = RuleService(self.fake_repo)
    
    def test_list_rules_no_filters(self):
        """Test listing all rules"""
        rules, total, total_pages = self.service.list_rules(page=1, page_size=10)
        
        assert len(rules) == 2
        assert total == 2
        assert total_pages == 1
    
    def test_list_rules_with_status_filter(self):
        """Test listing rules filtered by status"""
        rules, total, total_pages = self.service.list_rules(status="ACTIVE", page=1, page_size=10)
        
        assert len(rules) == 1
        assert total == 1
        assert rules[0].status == "ACTIVE"
    
    def test_get_rule_success(self):
        """Test getting a rule that exists"""
        rule = self.service.get_rule("RULE-001")
        
        assert rule is not None
        assert rule.rule_id == "RULE-001"
        assert rule.rule_name == "STRUCTURING_RULE"
    
    def test_get_rule_not_found(self):
        """Test getting a rule that doesn't exist"""
        rule = self.service.get_rule("RULE-999")
        
        assert rule is None
    
    def test_approve_rule(self):
        """Test approving a rule"""
        success = self.service.approve_rule("RULE-002", "test_user")
        
        assert success
        
        # Verify status changed
        rule = self.service.get_rule("RULE-002")
        assert rule.status == "ACTIVE"
    
    def test_reject_rule(self):
        """Test rejecting a rule"""
        success = self.service.reject_rule("RULE-002", "test_user", "Invalid logic")
        
        assert success
        
        # Verify status changed
        rule = self.service.get_rule("RULE-002")
        assert rule.status == "REJECTED"
