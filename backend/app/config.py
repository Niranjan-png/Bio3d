from functools import lru_cache
from os import getenv
from urllib.parse import urlparse

from pydantic import BaseModel, field_validator


class Settings(BaseModel):
    """Non-secret runtime settings sourced from environment variables."""

    cors_origins: list[str] = ["http://localhost:3000"]

    @field_validator("cors_origins")
    @classmethod
    def require_explicit_http_origins(cls, origins: list[str]) -> list[str]:
        if not origins:
            raise ValueError("BIOPILOT_CORS_ORIGINS must contain at least one origin")

        for origin in origins:
            parsed = urlparse(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.username
                or parsed.password
                or parsed.path not in {"", "/"}
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError("BIOPILOT_CORS_ORIGINS must contain HTTP(S) origins only")
        return origins


@lru_cache
def get_settings() -> Settings:
    raw_origins = getenv("BIOPILOT_CORS_ORIGINS", "http://localhost:3000")
    return Settings(cors_origins=[origin.strip() for origin in raw_origins.split(",") if origin.strip()])
