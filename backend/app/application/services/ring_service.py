"""
Ring application service
"""
from typing import Optional, List
from app.domain.repositories import RingRepository
from app.domain.entities import Ring, RingDetail


class RingService:
    """Service for mule ring operations"""
    
    def __init__(self, ring_repo: RingRepository):
        self.ring_repo = ring_repo
    
    def list_rings(
        self,
        page: int = 1,
        page_size: int = 20
    ) -> tuple[List[Ring], int, int]:
        """List rings with pagination"""
        offset = (page - 1) * page_size
        rings, total = self.ring_repo.list_rings(
            limit=page_size,
            offset=offset
        )
        
        total_pages = (total + page_size - 1) // page_size
        return rings, total, total_pages
    
    def get_ring(self, ring_id: str) -> Optional[Ring]:
        """Get a single ring"""
        return self.ring_repo.get_ring(ring_id)

    def get_ring_detail(self, ring_id: str) -> Optional[RingDetail]:
        """Ring with its members, links and transfers"""
        return self.ring_repo.get_ring_detail(ring_id)
