"""
KAVACH FastAPI Backend
N-layered architecture: Presentation → Application → Domain ← Infrastructure
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.presentation.api.v1 import health, home, me, alerts

app = FastAPI(
    title="KAVACH API",
    description="Risk, Fraud and Regulatory Intelligence Copilot for Indian Banking",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check (no /api prefix)
app.include_router(health.router, tags=["Health"])

# API v1 routes
app.include_router(home.router, prefix="/api", tags=["Home"])
app.include_router(me.router, prefix="/api", tags=["User"])
app.include_router(alerts.router, prefix="/api", tags=["Alerts"])


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
