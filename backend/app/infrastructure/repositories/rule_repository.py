"""
Concrete implementation of RuleRepository using Snowflake
"""
from typing import Optional, List
from snowflake.snowpark import Session
from app.domain.entities import Rule
from app.domain.repositories import RuleRepository


class SnowflakeRuleRepository(RuleRepository):
    """Snowflake implementation of RuleRepository"""
    
    def __init__(self, session: Session):
        self.session = session
    
    def list_rules(
        self,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> tuple[List[Rule], int]:
        """List rules with filters"""
        where_clause = f"WHERE status = '{status}'" if status else ""
        
        # Get total count
        count_sql = f"SELECT COUNT(*) AS total FROM RULES.RULE_LIBRARY {where_clause}"
        total = self.session.sql(count_sql).collect()[0]['TOTAL']
        
        # Get rules
        rules_sql = f"""
            SELECT rule_id, rule_name, version, typology, sql_text, status,
                   source_citation, created_at
            FROM RULES.RULE_LIBRARY
            {where_clause}
            ORDER BY created_at DESC
            LIMIT {limit} OFFSET {offset}
        """
        
        rows = self.session.sql(rules_sql).collect()
        rules = [
            Rule(
                rule_id=row['RULE_ID'],
                rule_name=row['RULE_NAME'],
                version=row['VERSION'],
                typology=row['TYPOLOGY'],
                sql_text=row['SQL_TEXT'],
                status=row['STATUS'],
                source_citation=row['SOURCE_CITATION'],
                created_at=row['CREATED_AT']
            )
            for row in rows
        ]
        
        return rules, total
    
    def get_rule(self, rule_id: str) -> Optional[Rule]:
        """Get a single rule by ID"""
        sql = f"""
            SELECT rule_id, rule_name, version, typology, sql_text, status,
                   source_citation, created_at
            FROM RULES.RULE_LIBRARY
            WHERE rule_id = '{rule_id}'
        """
        
        rows = self.session.sql(sql).collect()
        if not rows:
            return None
        
        row = rows[0]
        return Rule(
            rule_id=row['RULE_ID'],
            rule_name=row['RULE_NAME'],
            version=row['VERSION'],
            typology=row['TYPOLOGY'],
            sql_text=row['SQL_TEXT'],
            status=row['STATUS'],
            source_citation=row['SOURCE_CITATION'],
            created_at=row['CREATED_AT']
        )
    
    def approve_rule(self, rule_id: str, user: str) -> bool:
        """Approve a rule"""
        sql = f"""
            UPDATE RULES.RULE_LIBRARY
            SET status = 'APPROVED', approved_by = '{user}', approved_at = CURRENT_TIMESTAMP()
            WHERE rule_id = '{rule_id}'
        """
        self.session.sql(sql).collect()
        return True
    
    def reject_rule(self, rule_id: str, user: str, reason: str) -> bool:
        """Reject a rule"""
        sql = f"""
            UPDATE RULES.RULE_LIBRARY
            SET status = 'REJECTED', rejected_by = '{user}', 
                rejection_reason = '{reason}', rejected_at = CURRENT_TIMESTAMP()
            WHERE rule_id = '{rule_id}'
        """
        self.session.sql(sql).collect()
        return True
