from flask import Blueprint, request, jsonify, make_response
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt, create_access_token, set_access_cookies, unset_jwt_cookies
from flask_limiter.errors import RateLimitExceeded

from app.services import auth_service
from app.middleware.auth_middleware import jwt_required_custom, jwt_mfa_setup_required, current_user
from app.middleware.csrf_middleware import csrf_protect
from app.extensions import limiter

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


def _ip():
    return request.headers.get("X-Forwarded-For", request.remote_addr)


# ── POST /auth/signup ─────────────────────────────────────────────────────────
@auth_bp.post("/signup")
@csrf_protect
@limiter.limit("5 per minute; 20 per hour")
def signup():
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
@limiter.limit("10 per minute")
@jwt_mfa_setup_required
def mfa_setup():
    user = current_user()
    if not user:
        return jsonify({"error": "USER_NOT_FOUND"}), 404
    result = auth_service.setup_mfa(user.id)
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 400
    return jsonify({
        "secret":      result["secret"],
        "qrCode":      result["qrCode"],
        "backupCode": result["backupCode"],
    }), 200


# ── POST /auth/mfa/enable ─────────────────────────────────────────────────────
@auth_bp.post("/mfa/enable")
@csrf_protect
@limiter.limit("5 per minute")
@jwt_mfa_setup_required
def mfa_enable():
    """Confirme l'activation MFA via un code OTP après setup."""
    user = current_user()
    data = request.get_json(silent=True) or {}
    code = data.get("code", "")
    result = auth_service.verify_mfa(user.id, code, _ip())
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
@jwt_required_custom
def me():
    user = current_user()
    if not user:
        return jsonify({"error": "USER_NOT_FOUND"}), 404
    return jsonify({"user": user.to_dict()}), 200


# ── Rate Limit Error Handler ───────────────────────────────────────────────────
@auth_bp.errorhandler(RateLimitExceeded)
def handle_rate_limit(e):
    # [Audit] Log rate limit hits — IP logged, no user identity assumed
    from app.services.auth_service import _log
    ip = request.headers.get("X-Forwarded-For", request.remote_addr)
    _log("RATE_LIMITED", "anonymous", None, "warning", ip,
         resource=request.path, details="Rate limit exceeded.")
    from app.extensions import db
    db.session.commit()
    # Generic message — do not reveal limit thresholds to callers
    return jsonify({"error": "TOO_MANY_REQUESTS"}), 429