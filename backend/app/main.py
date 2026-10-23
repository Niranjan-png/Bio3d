from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

settings = get_settings()
app = FastAPI(title="BioPilot 3D Lab API", version="0.1.0", docs_url="/docs", redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=[],
)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    """Return a credential-free liveness response for local tooling and deployment checks."""
    return {"status": "ok", "service": "biopilot-api", "version": app.version}
