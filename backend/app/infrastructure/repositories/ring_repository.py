"""
Concrete implementation of RingRepository using Snowflake
"""
from typing import Optional, List
from snowflake.snowpark import Session
from app.domain.entities import Ring
from app.domain.repositories import RingRepository


class SnowflakeRingRepository(RingRepository):
    """Snowflake implementation of RingRepository"""
    
    def __init__(self, session: Session):
        self.session = session
    
    def list_rings(self, limit: int = 20, offset: int = 0) -> tuple[List[Ring], int]:
        """List mule rings"""
        # Get total count
        count_sql = "SELECT COUNT(*) AS total FROM GRAPH.MULE_RINGS"
        total = self.session.sql(count_sql).collect()[0]['TOTAL']
        
        # Get rings
        rings_sql = f"""
            SELECT ring_id, ring_name, member_count, total_volume_inr, risk_score, status
            FROM GRAPH.MULE_RINGS
            ORDER BY risk_score DESC
            LIMIT {limit} OFFSET {offset}
        """
        
        rows = self.session.sql(rings_sql).collect()
        rings = [
            Ring(
                ring_id=row['RING_ID'],
                ring_name=row['RING_NAME'],
                member_count=row['MEMBER_COUNT'],
                total_volume_inr=float(row['TOTAL_VOLUME_INR']),
                risk_score=float(row['RISK_SCORE']),
                status=row['STATUS']
            )
            for row in rows
        ]
        
        return rings, total
    
    def get_ring(self, ring_id: str) -> Optional[Ring]:
        """Get a single ring by ID"""
        sql = f"""
            SELECT ring_id, ring_name, member_count, total_volume_inr, risk_score, status
            FROM GRAPH.MULE_RINGS
            WHERE ring_id = '{ring_id}'
        """
        
        rows = self.session.sql(sql).collect()
        if not rows:
            return None
        
        row = rows[0]
        return Ring(
            ring_id=row['RING_ID'],
            ring_name=row['RING_NAME'],
            member_count=row['MEMBER_COUNT'],
            total_volume_inr=float(row['TOTAL_VOLUME_INR']),
            risk_score=float(row['RISK_SCORE']),
            status=row['STATUS']
        )
