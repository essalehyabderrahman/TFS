# app/middleware/csrf_middleware.py
#
# Implements CSRF protection via the Double Submit Cookie pattern.
# Rule enforced: "Protect all state-changing endpoints with CSRF tokens."

import secrets
from functools import wraps
from flask import request, jsonify

CSRF_COOKIE_NAME  = "csrf_token"
CSRF_HEADER_NAME  = "X-CSRF-Token"
SAFE_METHODS      = {"GET", "HEAD", "OPTIONS"}
COOKIE_MAX_AGE    = 8 * 60 * 60   # 8 hours — matches absolute session max


def init_csrf(app):
    """
    Register an after_request hook that sets a fresh csrf_token cookie
    on every response.
    The cookie is:
      - NOT HttpOnly so JavaScript can read it
      - Secure (HTTPS only)
      - SameSite=Strict
    """
    @app.after_request
    def set_csrf_cookie(response):
        token = secrets.token_hex(32)   # 256-bit entropy
        response.set_cookie(
            CSRF_COOKIE_NAME,
            token,
            httponly=False,         # must be readable by JS
            secure=True,
            samesite="Strict",
            max_age=COOKIE_MAX_AGE,
        )
        return response


def csrf_protect(fn):
    """
    Route decorator — validates the X-CSRF-Token header against the
    csrf_token cookie on every non-safe request.

    Usage:
        @auth_bp.post("/signin")
        @csrf_protect
        def signin(): ...

    Place this decorator directly below the route decorator and above
    any JWT decorators so CSRF is checked before auth logic runs.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if request.method in SAFE_METHODS:
            return fn(*args, **kwargs)

        cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
        header_token = request.headers.get(CSRF_HEADER_NAME)

        if not cookie_token or not header_token:
            return jsonify({"error": "CSRF_TOKEN_MISSING"}), 403

        # Constant-time comparison prevents timing attacks.
        if not secrets.compare_digest(cookie_token, header_token):
            return jsonify({"error": "CSRF_TOKEN_INVALID"}), 403

        return fn(*args, **kwargs)
    return wrapper
