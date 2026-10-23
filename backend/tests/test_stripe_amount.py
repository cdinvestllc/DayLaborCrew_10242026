"""The checkout adapter truncates int(amount * 100); _stripe_amount must make that exact."""
import os
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "daylaborcrew_test")
os.environ.setdefault("JWT_SECRET_KEY", "stripe-amount-test-secret-at-least-32-chars")
os.environ.setdefault("JWT_EXPIRE_HOURS", "24")
os.environ.setdefault("CORS_ORIGINS", "http://localhost")
os.environ.setdefault("EMERGENT_LLM_KEY", "stripe-amount-test-placeholder")
os.environ.setdefault("TRUSTED_PROXY_HOPS", "1")

from routes.payment_routes import _stripe_amount, _transaction_amount_matches  # noqa: E402


def test_known_truncating_prices_charge_exact_cents():
    for price, cents in ((19.99, 1999), (79.99, 7999), (0.29, 29), (1.15, 115), (39.99, 3999), (9.99, 999)):
        assert int(price * 100) <= cents  # the raw adapter conversion may truncate
        assert int(_stripe_amount(price) * 100) == cents


def test_every_price_up_to_2000_dollars_round_trips():
    for cents in range(50, 200001):
        value = _stripe_amount(cents / 100)
        assert int(value * 100) == cents
        assert value - cents / 100 < 1e-6  # never overcharges


def test_charged_amount_matches_recorded_transaction():
    tx = {"amount": 19.99, "currency": "usd"}
    charged_cents = int(_stripe_amount(tx["amount"]) * 100)
    assert _transaction_amount_matches(tx, charged_cents, "usd", minor_units=True)
    assert not _transaction_amount_matches(tx, 1998, "usd", minor_units=True)
