"""
KAVACH FastAPI Backend
N-layered architecture: Presentation → Application → Domain ← Infrastructure
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.presentation.api.v1 import health, home, me, alerts, evidence, ask, whynot, timemachine, rings, rules

app = FastAPI(
    title="KAVACH API",
    description="Risk, Fraud and Regulatory Intelligence Copilot for Indian Banking",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health
app.include_router(health.router, tags=["Health"])

# Core
app.include_router(home.router, prefix="/api", tags=["Home"])
app.include_router(me.router, prefix="/api", tags=["User"])

# Alerts
app.include_router(alerts.router, prefix="/api", tags=["Alerts"])
app.include_router(evidence.router, prefix="/api", tags=["Evidence"])

# AI
app.include_router(ask.router, prefix="/api", tags=["AI"])
app.include_router(whynot.router, prefix="/api", tags=["Analysis"])

# Analytics
app.include_router(timemachine.router, prefix="/api", tags=["Analytics"])

# Graph
app.include_router(rings.router, prefix="/api", tags=["Rings"])

# Rules
app.include_router(rules.router, prefix="/api", tags=["Rules"])

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
