"""Webhook secrets are compared in constant time."""

import pytest

from app.presentation.api.v1.webhooks import _secret_matches


@pytest.mark.parametrize(
    ("given", "matches"),
    [("s3cret-value", True), ("s3cret-valuf", False), ("s3cret", False), ("", False), (None, False), ("пароль", False)],
)
def test_only_the_exact_secret_matches(given, matches):
    assert _secret_matches(given, "s3cret-value") is matches
