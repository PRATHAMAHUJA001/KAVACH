"""
KAVACH FastAPI Backend
N-layered architecture: Presentation → Application → Domain ← Infrastructure
"""
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from app.presentation.api.v1 import health, home, me, alerts, evidence, ask, whynot, timemachine, rings, rules, reference, auth, risk, customers
from app.infrastructure.snowflake import user_sessions

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

# Endpoints that change stored state. A read-only persona (auditor, external
# reviewer) is refused these server-side, so the greyed-out buttons in the UI are
# backed by a real check rather than being the only thing stopping a write.
WRITE_PATHS = ("/feedback", "/approve", "/reject", "/rules/upload")


@app.middleware("http")
async def bind_user_session(request: Request, call_next):
    """
    Run each request on the signed-in user's Snowflake session, and refuse writes
    from read-only roles.
    """
    entry = user_sessions.resolve(request.cookies.get(auth.COOKIE_NAME))
    if entry is not None and request.method not in ("GET", "HEAD", "OPTIONS"):
        if entry.role in user_sessions.READ_ONLY_ROLES and any(
            request.url.path.endswith(p) or p in request.url.path for p in WRITE_PATHS
        ):
            return JSONResponse(
                status_code=403,
                content={"detail": f"{entry.role} has read-only access and cannot change this."},
            )
    token = user_sessions.bind(entry)
    try:
        return await call_next(request)
    finally:
        user_sessions.unbind(token)


# Health
app.include_router(health.router, tags=["Health"])

# Auth
app.include_router(auth.router, prefix="/api", tags=["Auth"])

# Core
app.include_router(home.router, prefix="/api", tags=["Home"])
app.include_router(risk.router, prefix="/api", tags=["Risk"])
app.include_router(customers.router, prefix="/api", tags=["Customers"])
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
app.include_router(reference.router, prefix="/api", tags=["Reference"])

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )

# Serve the built frontend (SPCS runs backend + frontend as one service).
# Not present in local dev, where the frontend runs on its own via vite.
_FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend_dist")
if os.path.isdir(_FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str, request: Request):
        candidate = os.path.join(_FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_FRONTEND_DIST, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
