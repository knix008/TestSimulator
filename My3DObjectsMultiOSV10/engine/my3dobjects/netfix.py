"""Downloads from a server whose certificate has only *expired* — with the
user's consent, given in the app after a warning.

When a download host lets its certificate lapse (dl.fbaipublicfiles.com, where
TRELLIS's DINOv2 comes from, did on 2026-11-11), every HTTPS client refuses
it. The engine then stops and reports ExpiredCertificate; the app warns the
user, and only if they choose to go on is the host allowed (allow()).

Even then verification is not switched off: only the validity *dates* go
unchecked (OpenSSL's X509_V_FLAG_NO_CHECK_TIME). The chain must still lead to
a trusted authority and the name must still match, so a different server
posing as this one is still refused. Other hosts keep the full check.
"""

import contextlib
import http.client
import ssl
import threading
import urllib.request

# X509_V_FLAG_NO_CHECK_TIME (OpenSSL 1.1.0+); not in ssl.VerifyFlags.
NO_CHECK_TIME = 0x200000

_allowed = set()
_lock = threading.Lock()


class ExpiredCertificate(Exception):
    """A download host's certificate has expired; nothing more is fetched
    from it until the user allows it in the app."""

    def __init__(self, host, what=""):
        self.host = host
        self.what = what
        super().__init__(f"{host}'s security certificate has expired" + (f" ({what})" if what else ""))


def allow(host):
    with _lock:
        _allowed.add(str(host).lower())


def allowed(host):
    with _lock:
        return str(host).lower() in _allowed


def allowed_hosts():
    with _lock:
        return sorted(_allowed)


def is_expired_certificate(error):
    """True when `error` (or what caused it) is a certificate refused only
    because it has expired."""
    seen = set()
    while error is not None and id(error) not in seen:
        seen.add(id(error))
        if isinstance(error, ssl.SSLCertVerificationError) and getattr(error, "verify_code", None) == 10:
            return True       # X509_V_ERR_CERT_HAS_EXPIRED
        if "certificate has expired" in str(error):
            return True
        error = getattr(error, "reason", None) or error.__cause__ or error.__context__
    return False


def expired_tolerant_context():
    ctx = ssl.create_default_context()
    ctx.verify_flags |= NO_CHECK_TIME
    return ctx


class _HostHandler(urllib.request.HTTPSHandler):
    """The date-tolerant context for `hosts`, the normal one elsewhere
    (a redirect to another host is checked in full)."""

    def __init__(self, hosts):
        super().__init__()
        self._hosts = {h.lower() for h in hosts}
        self._strict = ssl.create_default_context()
        self._tolerant = expired_tolerant_context()

    def https_open(self, req):
        host = (req.host or "").split(":")[0].lower()
        ctx = self._tolerant if host in self._hosts else self._strict
        return self.do_open(http.client.HTTPSConnection, req, context=ctx)


@contextlib.contextmanager
def tolerate_expired_certificate(hosts):
    """Within the block, urllib.request.urlopen (without a context of its
    own, as torch.hub calls it) accepts an expired certificate from `hosts`;
    the chain and the name are still checked. The previous opener comes back
    afterwards."""
    previous = urllib.request._opener  # noqa: SLF001 — what install_opener sets
    urllib.request.install_opener(urllib.request.build_opener(_HostHandler(hosts)))
    try:
        yield
    finally:
        urllib.request._opener = previous  # noqa: SLF001


def fetch(fn, host, what=""):
    """Runs the download `fn`. If `host`'s certificate has expired: again with
    only its dates unchecked when the user has allowed that host, else
    ExpiredCertificate for the app to ask."""
    try:
        return fn()
    except Exception as e:  # noqa: BLE001
        if not is_expired_certificate(e):
            raise
        if not allowed(host):
            raise ExpiredCertificate(host, what) from e
    with tolerate_expired_certificate([host]):
        return fn()
