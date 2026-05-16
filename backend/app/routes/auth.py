from flask import Blueprint, request, jsonify, make_response
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt, create_access_token, set_access_cookies, unset_jwt_cookies
from flask_limiter.errors import RateLimitExceeded

from app.services import auth_service
from app.middleware.auth_middleware import jwt_required_custom, jwt_mfa_setup_required, current_user
from app.middleware.csrf_middleware import csrf_protect
from app.extensions import limiter

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


def _ip():
    return request.remote_addr


# ── POST /auth/signup ─────────────────────────────────────────────────────────
@auth_bp.post("/signup")
@csrf_protect
@limiter.limit("5 per minute; 20 per hour")
def signup():
    # [Platform Policy] Check allow_signup before touching any user data
    from app.models.team_settings import TeamSettings
    settings = TeamSettings.query.first()
    if settings and not settings.allow_signup:
        return jsonify({"error": "SIGNUP_DISABLED"}), 403

    data = request.get_json(silent=True) or {}
    name     = data.get("name", "").strip()
    email    = data.get("email", "").strip()
    password = data.get("password", "")

    if not name or not email or not password:
        return jsonify({"error": "MISSING_FIELDS"}), 400

    result = auth_service.signup(name, email, password, _ip())
    if not result["ok"]:
        code = 409 if result["error"] == "EMAIL_TAKEN" else 400
        return jsonify({"error": result["error"]}), code

    # Issue a restricted token (mfa_pending=True) to force MFA setup
    response = jsonify({
        "user": result["user"],
        "mfaRequired": True
    })
    set_access_cookies(response, result["token"])
    return response, 201


# ── POST /auth/signin ─────────────────────────────────────────────────────────
@auth_bp.post("/signin")
@csrf_protect
@limiter.limit("10 per minute; 50 per hour")
def signin():
    data     = request.get_json(silent=True) or {}
    email    = data.get("email", "")
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "MISSING_FIELDS"}), 400

    result = auth_service.signin(email, password, _ip())

    if not result["ok"]:
        status = 401 if result["error"] == "INVALID_CREDENTIALS" else 403
        return jsonify({"error": result["error"]}), status

    if result["mfaRequired"]:
        response = jsonify({
            "mfaRequired": True,
            "user":        result["user"],
        })
        set_access_cookies(response, result["tempToken"])
        return response, 200

    response = jsonify({
        "mfaRequired": False,
        "user":        result["user"],
    })
    set_access_cookies(response, result["token"])
    return response, 200


# ── POST /auth/mfa/verify ─────────────────────────────────────────────────────
@auth_bp.post("/mfa/verify")
@csrf_protect
@limiter.limit("5 per minute")
def mfa_verify():
    """
    Accepte le token temporaire (mfa_pending=True) + le code OTP.
    Retourne un vrai token JWT si OK.
    [Security] Suspension is enforced inside auth_service.verify_mfa via
    the user status check — no need for a duplicate inline check here.
    """
    try:
        verify_jwt_in_request()
    except Exception as e:
        return jsonify({"error": "UNAUTHORIZED"}), 401

    claims = get_jwt()
    if not claims.get("mfa_pending"):
        return jsonify({"error": "NOT_MFA_FLOW"}), 400

    user_id = get_jwt_identity()
    data    = request.get_json(silent=True) or {}
    code    = data.get("code", "")

    result = auth_service.verify_mfa(user_id, code, _ip())
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 401

    response = jsonify({"user": result["user"]})
    set_access_cookies(response, result["token"])
    return response, 200

# ── POST /auth/signout ────────────────────────────────────────────────────────
@auth_bp.post("/signout")
@csrf_protect
@jwt_required_custom
@limiter.limit("20 per minute")
def signout():
    user = current_user()
    ip = _ip()
    from app.services.auth_service import _log
    from app.extensions import db
    if user:
        _log("SIGNOUT", user.email, user.id, "success", ip, details="User signed out.")
        db.session.commit()
    response = jsonify({"ok": True, "message": "Signed out successfully"})
    unset_jwt_cookies(response)
    return response, 200


# ── POST /auth/mfa/setup ──────────────────────────────────────────────────────
@auth_bp.post("/mfa/setup")
@csrf_protect
@jwt_mfa_setup_required
@limiter.limit("10 per minute")
def mfa_setup():
    user = current_user()
    if not user:
        return jsonify({"error": "USER_NOT_FOUND"}), 404
    result = auth_service.setup_mfa(user.id)
    if not result["ok"]:
        status = 409 if result["error"] == "MFA_ALREADY_ENABLED" else 400
        return jsonify({"error": result["error"]}), status
    return jsonify({
        "secret":      result["secret"],
        "qrCode":      result["qrCode"],
        "backupCode": result["backupCode"],
    }), 200


# ── POST /auth/mfa/enable ─────────────────────────────────────────────────────
@auth_bp.post("/mfa/enable")
@csrf_protect
@jwt_mfa_setup_required
@limiter.limit("5 per minute")
def mfa_enable():
    """Confirme l'activation MFA via un code OTP après setup."""
    user = current_user()
    data = request.get_json(silent=True) or {}
    code = data.get("code", "")
    # [Security] Enrollment confirmation must use a 6-digit TOTP code only.
    # Accepting the backup code here would confirm enrollment without proving
    # the authenticator app is actually working.
    if not code or len(code.strip()) != 6 or not code.strip().isdigit():
        return jsonify({"error": "TOTP_REQUIRED"}), 400
    result = auth_service.verify_mfa(user.id, code, _ip(), is_setup_confirm=True)
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 401
    
    # Return the finalized token and the user
    response = jsonify({
        "mfaEnabled": True,
        "user": result["user"]
    })
    set_access_cookies(response, result["token"])
    return response, 200


# ── POST /auth/mfa/disable ────────────────────────────────────────────────────
@auth_bp.post("/mfa/disable")
@csrf_protect
@jwt_required_custom
def mfa_disable():
    # [Platform Policy] Block MFA disable when require_mfa is enforced app-wide
    from app.models.team_settings import TeamSettings
    settings = TeamSettings.query.first()
    if settings and settings.require_mfa:
        return jsonify({"error": "MFA_REQUIRED_BY_POLICY"}), 403

    user = current_user()
    data = request.get_json(silent=True) or {}
    code = data.get("code", "")
    result = auth_service.disable_mfa(user.id, code, _ip())
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 400
    return jsonify({"mfaEnabled": False}), 200


# ── POST /auth/mfa/backup-code/regenerate ─────────────────────────────────
@auth_bp.post("/mfa/backup-code/regenerate")
@csrf_protect
@jwt_required_custom
@limiter.limit("3 per hour")
def regenerate_backup_code():
    user = current_user()
    data = request.get_json(silent=True) or {}
    code = data.get("code", "")
    result = auth_service.regenerate_backup_code(user.id, code, _ip())
    if not result["ok"]:
        status = 429 if result["error"] == "MFA_MAX_ATTEMPTS_EXCEEDED" else 400
        return jsonify({"error": result["error"]}), status
    return jsonify({"backupCode": result["backupCode"]}), 200


# ── GET /auth/me ──────────────────────────────────────────────────────────────
@auth_bp.get("/me")
def me():
    # Accept BOTH full tokens and mfa_pending tokens so AuthContext can
    # restore isMfaPending=True correctly after a hard page reload.
    try:
        verify_jwt_in_request()
    except Exception:
        return jsonify({"error": "UNAUTHORIZED"}), 401

    claims      = get_jwt()
    mfa_pending = bool(claims.get("mfa_pending"))

    user = current_user()
    if not user:
        return jsonify({"error": "USER_NOT_FOUND"}), 404

    return jsonify({"user": user.to_dict(), "mfaPending": mfa_pending}), 200


# ── POST /auth/refresh ────────────────────────────────────────────────────────
@auth_bp.post("/refresh")
@csrf_protect
@limiter.limit("30 per minute")
def refresh():
    """
    Sliding session refresh.
    [Session] Intentionally uses decode_token(allow_expired=True) so that a
    just-expired token can still obtain a new one — this is the sliding window.
    verify_jwt_in_request() would hard-reject expired tokens before we could
    act on them, which is wrong for a refresh endpoint.
    Refuses if the 8-hour absolute max has been reached.
    """
    from flask import current_app
    from flask_jwt_extended import decode_token

    # Extract raw token from the HttpOnly cookie
    cookie_name = current_app.config.get("JWT_ACCESS_COOKIE_NAME", "access_token_cookie")
    raw_token = request.cookies.get(cookie_name)
    if not raw_token:
        return jsonify({"error": "UNAUTHORIZED"}), 401

    from datetime import timedelta as _td
    try:
        # [Session] allow_expired=True is the whole point — we are refreshing it
        claims = decode_token(raw_token, allow_expired=True)
    except Exception:
        return jsonify({"error": "INVALID_TOKEN"}), 401

    # [Session] Enforce idle timeout: reject tokens that expired more than
    # IDLE_GRACE_SECONDS ago. This is what gives the 15-min idle window real
    # meaning — without this gate, any expired token could be refreshed
    # indefinitely up to the 8-hr absolute wall.
    IDLE_GRACE_SECONDS = 30  # small buffer for clock skew / slow requests
    import time as _time
    token_exp = claims.get("exp")
    if token_exp is not None:
        seconds_since_expiry = _time.time() - token_exp
        if seconds_since_expiry > IDLE_GRACE_SECONDS:
            return jsonify({"error": "SESSION_EXPIRED"}), 401

    # Block mfa_pending tokens from refreshing into a real session
    if claims.get("mfa_pending"):
        return jsonify({"error": "MFA_REQUIRED"}), 403

    user_id            = claims.get("sub")
    session_created_at = claims.get("session_created_at")
    token_version      = claims.get("token_version")

    if not user_id or not session_created_at:
        return jsonify({"error": "INVALID_TOKEN"}), 401

    result = auth_service.refresh_token(user_id, session_created_at, token_version, _ip())

    if not result["ok"]:
        status = 403 if result["error"] == "ACCOUNT_SUSPENDED" else 401
        return jsonify({"error": result["error"]}), status

    response = jsonify({"user": result["user"]})
    set_access_cookies(response, result["token"])
    return response, 200


# ── Rate Limit Error Handler ───────────────────────────────────────────────────
@auth_bp.errorhandler(RateLimitExceeded)
def handle_rate_limit(e):
    # [Audit] Log rate limit hits — IP logged, no user identity assumed
    from app.services.auth_service import _log
    ip = request.remote_addr
    _log("RATE_LIMITED", "anonymous", None, "warning", ip,
         resource=request.path, details="Rate limit exceeded.")
    from app.extensions import db
    db.session.commit()
    # Generic message — do not reveal limit thresholds to callers
    return jsonify({"error": "TOO_MANY_REQUESTS"}), 429

# -- POST /auth/recovery-request ---------------------------------------------
@auth_bp.post("/recovery-request")
@csrf_protect
@limiter.limit("5 per hour")
def recovery_request():
    from flask import current_app, request, jsonify
    from app.services.auth_service import _log

    data = request.get_json(silent=True) or {}
    full_name = data.get("fullName", "").strip()
    email = data.get("email", "").strip().lower()
    registration_date = data.get("registrationDate", "").strip()
    last_file = data.get("lastFile", "").strip()
    message = data.get("message", "").strip()

    if not full_name or not email or not message:
        return jsonify({"error": "MISSING_FIELDS"}), 400

    if "@" not in email:
        return jsonify({"error": "INVALID_EMAIL"}), 400

    admin_email = current_app.config.get("ADMIN_RECOVERY_EMAIL") or current_app.config.get("ADMIN_EMAIL") or "admin@tfs.local"

    print("\n" + "="*60)
    print(f"[SECURITY] RECOVERY REQUEST RECEIVED")
    print(f"To: {admin_email}")
    print(f"From: {full_name} <{email}>")
    print(f"Registration Date: {registration_date or 'N/A'}")
    print(f"Last File: {last_file or 'N/A'}")
    print(f"Message:\n{message}")
    print("="*60 + "\n")

    _log("RECOVERY_REQUEST_SUBMITTED", email, None, "info", request.remote_addr)

    return jsonify({"ok": True, "message": "Recovery request transmitted to administration."}), 200
