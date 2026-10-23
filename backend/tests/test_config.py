import pytest
from pydantic import ValidationError

from app.config import Settings


def test_settings_accepts_explicit_http_origins() -> None:
    settings = Settings(cors_origins=["http://localhost:3000", "https://app.example.test"])

    assert settings.cors_origins == ["http://localhost:3000", "https://app.example.test"]


@pytest.mark.parametrize(
    "origin",
    ["*", "localhost:3000", "ftp://example.test", "https://example.test/path"],
)
def test_settings_rejects_non_origin_cors_values(origin: str) -> None:
    with pytest.raises(ValidationError):
        Settings(cors_origins=[origin])
