"""The rate-limit bucket must follow the caller, not one global "default"."""

from starlette.requests import Request

from app.infrastructure.rate_limiter import _bucket_owner


def _request(headers: dict[str, str], client=("10.0.0.1", 1234)) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
            "client": client,
        }
    )


def test_two_api_keys_get_two_buckets():
    assert _bucket_owner(_request({"X-API-Key": "day_sk_a"})) != _bucket_owner(_request({"X-API-Key": "day_sk_b"}))


def test_two_logins_get_two_buckets():
    a = _bucket_owner(_request({"Authorization": "Bearer a"}))
    b = _bucket_owner(_request({"Authorization": "Bearer b"}))
    assert a != b


def test_same_credential_shares_a_bucket():
    assert _bucket_owner(_request({"X-API-Key": "day_sk_a"})) == _bucket_owner(_request({"X-API-Key": "day_sk_a"}))


def test_the_raw_secret_never_reaches_redis():
    assert "day_sk_a" not in _bucket_owner(_request({"X-API-Key": "day_sk_a"}))


def test_anonymous_falls_back_to_client_address():
    assert _bucket_owner(_request({})) == "ip:10.0.0.1"
    assert _bucket_owner(_request({}, client=None)) == "ip:unknown"
