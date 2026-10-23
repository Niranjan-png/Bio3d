from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_returns_service_metadata() -> None:
    response = TestClient(app).get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "biopilot-api",
        "version": "0.1.0",
    }


def test_health_endpoint_allows_the_configured_frontend_origin() -> None:
    response = TestClient(app).get(
        "/api/health",
        headers={"Origin": "http://localhost:3000"},
    )

    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
