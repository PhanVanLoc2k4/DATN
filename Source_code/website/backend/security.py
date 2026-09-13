"""Security helpers shared by authentication endpoints.

This module intentionally has no Flask or database dependencies so it can be
unit-tested without starting the AI models or connecting to SQL Server.
"""

import hashlib
import hmac
import secrets

from werkzeug.security import check_password_hash, generate_password_hash


PASSWORD_HASH_PREFIXES = ("scrypt:", "pbkdf2:")


def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(stored_value: str | None, candidate: str | None) -> tuple[bool, bool]:
    """Return ``(valid, needs_upgrade)``.

    Plaintext values created by older versions remain usable once, then callers
    should replace them with ``hash_password(candidate)``.
    """
    if not stored_value or candidate is None:
        return False, False
    if stored_value.startswith(PASSWORD_HASH_PREFIXES):
        return check_password_hash(stored_value, candidate), False
    return hmac.compare_digest(stored_value, candidate), True


def validate_password(password: str | None) -> tuple[bool, str]:
    if not password or len(password) < 8:
        return False, "Mật khẩu phải có ít nhất 8 ký tự."
    if len(password) > 128:
        return False, "Mật khẩu không được vượt quá 128 ký tự."
    return True, ""


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode("utf-8")).hexdigest()


def verify_otp_hash(stored_hash: str | None, candidate: str | None) -> bool:
    if not stored_hash or not candidate:
        return False
    return hmac.compare_digest(stored_hash, hash_otp(candidate))
