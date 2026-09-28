"""AES-256-GCM encryption for birth data at rest, with key versioning.

Keys come from ``NATALKA_DATA_KEYS`` as ``v2:<base64>,v1:<base64>`` (newest first).
Ciphertext layout: ``key_version (1 byte) || nonce (12 bytes) || AES-GCM(ciphertext || tag)``.
"""

from __future__ import annotations

import base64
import os
from dataclasses import dataclass

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

NONCE_LEN = 12
KEY_LEN = 32


class DecryptionError(ValueError):
    """Ciphertext could not be decrypted (wrong key, tampering or unknown version)."""


@dataclass(frozen=True, slots=True)
class KeyRing:
    keys: dict[int, bytes]
    current: int

    @classmethod
    def parse(cls, spec: str) -> KeyRing:
        """Parse ``v2:base64,v1:base64``. The first entry is the current key."""
        keys: dict[int, bytes] = {}
        current: int | None = None
        for item in (s.strip() for s in spec.split(",") if s.strip()):
            label, _, b64 = item.partition(":")
            if not label.startswith("v") or not label[1:].isdigit() or not b64:
                raise ValueError(f"bad key spec entry: {label!r}")
            raw = base64.b64decode(b64, validate=True)
            if len(raw) != KEY_LEN:
                raise ValueError(f"key {label} must be {KEY_LEN} bytes, got {len(raw)}")
            version = int(label[1:])
            if version < 0 or version > 255:
                raise ValueError("key version must fit in one byte")
            keys[version] = raw
            if current is None:
                current = version
        if current is None:
            raise ValueError("NATALKA_DATA_KEYS is empty")
        return cls(keys=keys, current=current)

    @staticmethod
    def generate_key() -> str:
        """Return a fresh base64 key suitable for the env variable."""
        return base64.b64encode(AESGCM.generate_key(bit_length=256)).decode()

    def encrypt(self, plaintext: bytes, aad: bytes = b"") -> bytes:
        nonce = os.urandom(NONCE_LEN)
        sealed = AESGCM(self.keys[self.current]).encrypt(nonce, plaintext, aad)
        return bytes([self.current]) + nonce + sealed

    def decrypt(self, blob: bytes, aad: bytes = b"") -> bytes:
        if len(blob) < 1 + NONCE_LEN + 16:
            raise DecryptionError("ciphertext too short")
        version, nonce, sealed = blob[0], blob[1 : 1 + NONCE_LEN], blob[1 + NONCE_LEN :]
        key = self.keys.get(version)
        if key is None:
            raise DecryptionError(f"unknown key version {version}")
        try:
            return AESGCM(key).decrypt(nonce, sealed, aad)
        except InvalidTag as exc:
            raise DecryptionError("authentication failed") from exc

    def needs_rotation(self, blob: bytes) -> bool:
        return bool(blob) and blob[0] != self.current
