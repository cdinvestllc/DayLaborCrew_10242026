"""Unit tests for the staging-only safety gate; no network or database access."""
import pytest

from staging_config import (
    get_staging_api_url,
    get_staging_mongo_settings,
    validate_staging_configuration,
)


def _valid_env(monkeypatch):
    values = {
        "STAGING_API_URL": "https://api.staging.example.test",
        "STAGING_WEB_ORIGIN": "https://app.staging.example.test",
        "STAGING_MONGO_URL": "mongodb://stage_user:stage_pass@mongo.staging.example.test:27017/daylaborcrew_staging?authSource=admin",
        "STAGING_MONGO_HOST": "mongo.staging.example.test",
        "STAGING_DB_NAME": "daylaborcrew_staging",
        "STAGING_JWT_SECRET_KEY": "staging-only-jwt-secret-at-least-32-chars",
        "STAGING_STRIPE_MODE": "test",
        "STAGING_SUPERADMIN_EMAIL": "superadmin@staging.example.test",
        "STAGING_SUPERADMIN_PASSWORD": "seeded-superadmin-password",
        "STAGING_ADMIN_EMAIL": "admin@staging.example.test",
        "STAGING_ADMIN_PASSWORD": "seeded-admin-password",
        "STAGING_CONTRACTOR1_EMAIL": "contractor1@staging.example.test",
        "STAGING_CONTRACTOR1_PASSWORD": "seeded-contractor1-password",
        "STAGING_CONTRACTOR2_EMAIL": "contractor2@staging.example.test",
        "STAGING_CONTRACTOR2_PASSWORD": "seeded-contractor2-password",
        "STAGING_CONTRACTOR3_EMAIL": "contractor3@staging.example.test",
        "STAGING_CONTRACTOR3_PASSWORD": "seeded-contractor3-password",
        "STAGING_CREW_EMAIL": "crew@staging.example.test",
        "STAGING_CREW_PASSWORD": "seeded-crew-password",
        "STAGING_CREW2_EMAIL": "crew2@staging.example.test",
        "STAGING_CREW2_PASSWORD": "seeded-crew2-password",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)


def test_staging_configuration_accepts_only_explicit_isolated_targets(monkeypatch):
    _valid_env(monkeypatch)
    assert validate_staging_configuration() == (
        "api.staging.example.test",
        "app.staging.example.test",
        "daylaborcrew_staging",
    )


def test_staging_api_is_required_and_never_falls_back_to_preview(monkeypatch):
    monkeypatch.delenv("STAGING_API_URL", raising=False)
    with pytest.raises(RuntimeError, match="STAGING_API_URL is required"):
        get_staging_api_url()
    monkeypatch.setenv("STAGING_API_URL", "https://crew-workforce.preview.emergentagent.com")
    with pytest.raises(RuntimeError, match="shared preview host"):
        get_staging_api_url()


def test_staging_mongo_host_must_match_pinned_host(monkeypatch):
    _valid_env(monkeypatch)
    monkeypatch.setenv("STAGING_MONGO_HOST", "other.staging.example.test")
    with pytest.raises(RuntimeError, match="does not match the pinned"):
        get_staging_mongo_settings()


def test_staging_database_must_be_marked_stage_or_test(monkeypatch):
    _valid_env(monkeypatch)
    monkeypatch.setenv("STAGING_DB_NAME", "daylaborcrew_prod")
    with pytest.raises(RuntimeError, match="identify an isolated"):
        get_staging_mongo_settings()


def test_staging_mongo_host_must_be_marked_stage_or_test(monkeypatch):
    _valid_env(monkeypatch)
    monkeypatch.setenv("STAGING_MONGO_HOST", "production.mongo.example.com")
    monkeypatch.setenv(
        "STAGING_MONGO_URL",
        "mongodb://stage_user:stage_pass@production.mongo.example.com:27017/daylaborcrew_staging",
    )
    with pytest.raises(RuntimeError, match="must explicitly identify the staging"):
        get_staging_mongo_settings()


def test_live_stripe_mode_is_rejected(monkeypatch):
    _valid_env(monkeypatch)
    monkeypatch.setenv("STAGING_STRIPE_MODE", "live")
    with pytest.raises(RuntimeError, match="must be explicitly set to 'test'"):
        validate_staging_configuration()
