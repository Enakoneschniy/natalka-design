"""Process settings, loaded from the environment (see .env.example)."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="NATALKA_", env_file=".env", extra="ignore")

    env: str = Field(default="dev", description="dev | staging | prod")
    database_url: str = Field(default="postgresql://natalka:natalka@localhost:5432/natalka")
    # Comma-separated "v<n>:<base64 32-byte key>" list, newest first. See crypto.py.
    data_keys: SecretStr = Field(default=SecretStr(""))
    jwt_secret: SecretStr = Field(default=SecretStr(""))
    storage_endpoint: str = ""
    storage_bucket: str = "natalka-documents"
    storage_access_key: SecretStr = Field(default=SecretStr(""))
    storage_secret_key: SecretStr = Field(default=SecretStr(""))
    anthropic_api_key: SecretStr = Field(default=SecretStr(""))
    telegram_bot_token: SecretStr = Field(default=SecretStr(""))
    telegram_chat_id: str = ""
    retention_days: int = 30


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
