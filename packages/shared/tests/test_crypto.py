import pytest
from natalka_shared.crypto import DecryptionError, KeyRing


def test_roundtrip_and_rotation() -> None:
    k1, k2 = KeyRing.generate_key(), KeyRing.generate_key()
    old = KeyRing.parse(f"v1:{k1}")
    blob = old.encrypt(b'{"lat": 49.99}', aad=b"order-1")
    new = KeyRing.parse(f"v2:{k2},v1:{k1}")
    assert new.decrypt(blob, aad=b"order-1") == b'{"lat": 49.99}'
    assert new.needs_rotation(blob)
    reblob = new.encrypt(new.decrypt(blob, aad=b"order-1"), aad=b"order-1")
    assert not new.needs_rotation(reblob)


def test_tamper_and_wrong_aad() -> None:
    ring = KeyRing.parse(f"v1:{KeyRing.generate_key()}")
    blob = ring.encrypt(b"secret", aad=b"a")
    with pytest.raises(DecryptionError):
        ring.decrypt(blob, aad=b"b")
    with pytest.raises(DecryptionError):
        ring.decrypt(blob[:-1] + bytes([blob[-1] ^ 1]), aad=b"a")
    with pytest.raises(DecryptionError):
        ring.decrypt(bytes([9]) + blob[1:], aad=b"a")


def test_bad_specs() -> None:
    with pytest.raises(ValueError):
        KeyRing.parse("")
    with pytest.raises(ValueError):
        KeyRing.parse("x1:abc")
    with pytest.raises(ValueError):
        KeyRing.parse("v1:" + "QUJD")  # 3 bytes
