# app/extensions/talisman.py
#
# Configures Flask-Talisman to enforce HTTPS and set all required
# security headers on every response.
#
# Rules enforced:
#   - HTTPS enforcement + 301 redirect from HTTP
#   - HSTS: max-age=31536000; includeSubDomains; preload
#   - Content-Security-Policy
#   - X-Frame-Options: DENY
#   - X-Content-Type-Options: nosniff
#   - Referrer-Policy: strict-origin-when-cross-origin

import os
from flask_talisman import Talisman

talisman = Talisman()

# Content Security Policy.
# Tighten script-src and style-src further once inline styles/scripts
# are fully removed from the frontend build.
CSP = {
    "default-src": "'self'",
    "script-src":  ["'self'"],
    "style-src":   ["'self'", "'unsafe-inline'"],
    "img-src":     ["'self'", "data:"],
    "font-src":    "'self'",
    "connect-src": "'self'",
    "frame-src":   "'none'",
    "object-src":  "'none'",
    "base-uri":    "'self'",
    "form-action": "'self'",
}


def init_talisman(app):
    """
    Initialise Talisman with production-safe settings.
    HTTPS enforcement and HSTS are disabled in development so that
    local http://localhost still works.
    All other headers (CSP, X-Frame-Options, etc.) are always active.
    """
    is_prod = os.environ.get("FLASK_ENV", "development") == "production"

    talisman.init_app(
        app,

        # ── HTTPS enforcement (production only) ───────────────────────
        force_https=is_prod,
        force_https_permanent=is_prod,      # 301 not 302

        # ── HSTS (production only) ────────────────────────────────────
        strict_transport_security=is_prod,
        strict_transport_security_max_age=31_536_000,   # 1 year
        strict_transport_security_include_subdomains=True,
        strict_transport_security_preload=True,

        # ── Content Security Policy (always on) ───────────────────────
        content_security_policy=CSP,
        content_security_policy_nonce_in=["script-src"],

        # ── Other headers (always on) ─────────────────────────────────
        frame_options="DENY",                           # X-Frame-Options
        x_content_type_options=True,                      # X-Content-Type-Options: nosniff
        referrer_policy="strict-origin-when-cross-origin",

        # ── Session cookie hardening ──────────────────────────────────
        session_cookie_secure=is_prod,
        session_cookie_http_only=True,
        session_cookie_samesite="Strict",
    )
