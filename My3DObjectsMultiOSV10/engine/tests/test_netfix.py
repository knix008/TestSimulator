"""An expired download certificate: the engine stops and reports it, and only
after the user allows the host in the app does it download — with the dates
unchecked and nothing else (my3dobjects.netfix, Service.configure)."""

import os
import ssl
import sys
import tempfile
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from my3dobjects import netfix  # noqa: E402

HOST = "dl.example-expired.test"


def expired_error():
    err = ssl.SSLCertVerificationError(1, "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: certificate has expired (_ssl.c:1016)")
    err.verify_code = 10
    return urllib.error.URLError(err)


def other_cert_error():
    err = ssl.SSLCertVerificationError(1, "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: self-signed certificate")
    err.verify_code = 18
    return urllib.error.URLError(err)


class Log:
    def __init__(self):
        self.lines = []

    def info(self, m, **_):
        self.lines.append(m)

    warn = error = debug = info


class NetfixTest(unittest.TestCase):
    def tearDown(self):
        netfix._allowed.clear()  # noqa: SLF001

    def test_recognises_only_an_expired_certificate(self):
        self.assertTrue(netfix.is_expired_certificate(expired_error()))
        self.assertFalse(netfix.is_expired_certificate(RuntimeError("other")))
        self.assertFalse(netfix.is_expired_certificate(other_cert_error()))
        self.assertFalse(netfix.is_expired_certificate(ConnectionResetError()))

    def test_not_allowed_stops_with_the_host(self):
        calls = []

        def download():
            calls.append(urllib.request._opener)  # noqa: SLF001
            raise expired_error()

        with self.assertRaises(netfix.ExpiredCertificate) as cm:
            netfix.fetch(download, HOST, "weights")
        self.assertEqual(cm.exception.host, HOST)
        self.assertEqual(len(calls), 1)

    def test_allowed_retries_with_only_the_dates_unchecked_for_that_host(self):
        netfix.allow(HOST)
        seen = []
        before = urllib.request._opener  # noqa: SLF001

        def download():
            opener = urllib.request._opener  # noqa: SLF001
            if not seen:
                seen.append(None)
                raise expired_error()
            handler = next(h for h in opener.handlers if isinstance(h, netfix._HostHandler))  # noqa: SLF001
            seen.append(handler)
            return "file"

        self.assertEqual(netfix.fetch(download, HOST), "file")
        handler = seen[1]
        self.assertEqual(handler._hosts, {HOST})  # noqa: SLF001
        # Dates unchecked, everything else as strict as ever.
        tol, strict = handler._tolerant, handler._strict  # noqa: SLF001
        self.assertTrue(tol.verify_flags & netfix.NO_CHECK_TIME)
        self.assertFalse(strict.verify_flags & netfix.NO_CHECK_TIME)
        self.assertEqual(tol.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(tol.check_hostname)
        self.assertIs(urllib.request._opener, before)  # noqa: SLF001 — put back

    def test_other_failures_are_not_retried(self):
        netfix.allow(HOST)
        calls = []

        def download():
            calls.append(1)
            raise other_cert_error()

        with self.assertRaises(urllib.error.URLError):
            netfix.fetch(download, HOST)
        self.assertEqual(len(calls), 1)


class ServiceConsentTest(unittest.TestCase):
    def tearDown(self):
        netfix._allowed.clear()  # noqa: SLF001

    def test_status_then_consent_for_that_host_only(self):
        from my3dobjects.server import Service

        with tempfile.TemporaryDirectory() as home:
            svc = Service(home, "uv", Log(), autostart=False)
            svc.state = "ready"
            svc.selected = "sf3d"                 # another model is in use
            started = []
            svc._background = lambda fn, *args: started.append(args)  # noqa: SLF001
            st = svc.model_status["trellis"]
            st.update(status="needs-cert", error="expired", certHost=HOST)
            # A host the engine did not report is ignored.
            self.assertEqual(svc.configure({"allowExpiredCert": "evil.example"}), [])
            self.assertFalse(netfix.allowed("evil.example"))
            self.assertEqual(svc.configure({"allowExpiredCert": HOST}), ["certificate"])
            self.assertTrue(netfix.allowed(HOST))
            self.assertEqual(st["status"], "not-installed")
            self.assertNotIn("certHost", st)
            # The model it was for goes on installing, though not the selected one.
            self.assertEqual(started, [("trellis", True)])


if __name__ == "__main__":
    unittest.main()
