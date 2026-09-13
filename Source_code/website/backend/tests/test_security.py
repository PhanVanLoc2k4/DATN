import pathlib
import sys
import unittest


BACKEND_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from security import (  # noqa: E402
    generate_otp,
    hash_otp,
    hash_password,
    validate_password,
    verify_otp_hash,
    verify_password,
)


class SecurityTests(unittest.TestCase):
    def test_password_hash_round_trip(self):
        encoded = hash_password("correct-horse-battery-staple")
        self.assertNotEqual(encoded, "correct-horse-battery-staple")
        self.assertEqual(verify_password(encoded, "correct-horse-battery-staple"), (True, False))
        self.assertEqual(verify_password(encoded, "wrong-password"), (False, False))

    def test_legacy_password_requests_upgrade(self):
        self.assertEqual(verify_password("legacy-password", "legacy-password"), (True, True))

    def test_password_policy(self):
        self.assertFalse(validate_password("short")[0])
        self.assertTrue(validate_password("long-enough")[0])

    def test_otp_is_six_digits_and_only_hash_is_compared(self):
        otp = generate_otp()
        self.assertRegex(otp, r"^\d{6}$")
        digest = hash_otp(otp)
        self.assertNotEqual(digest, otp)
        self.assertTrue(verify_otp_hash(digest, otp))
        self.assertFalse(verify_otp_hash(digest, "000000" if otp != "000000" else "111111"))


if __name__ == "__main__":
    unittest.main()
