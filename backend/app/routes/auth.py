from flask import Blueprint, request, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt

from app.services import auth_service
from app.middleware.auth_middleware import jwt_required_custom, current_user

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


def _ip():
    return request.headers.get("X-Forwarded-For", request.remote_addr)


# ── POST /auth/signup ─────────────────────────────────────────────────────────
@auth_bp.post("/signup")
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

    return jsonify({"user": result["user"]}), 201


# ── POST /auth/signin ─────────────────────────────────────────────────────────
@auth_bp.post("/signin")
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
        return jsonify({
            "mfaRequired": True,
            "tempToken":   result["tempToken"],
            "user":        result["user"],
        }), 200

    return jsonify({
        "mfaRequired": False,
        "token":       result["token"],
        "user":        result["user"],
    }), 200


# ── POST /auth/mfa/verify ─────────────────────────────────────────────────────
@auth_bp.post("/mfa/verify")
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

    return jsonify({"token": result["token"], "user": result["user"]}), 200


# ── POST /auth/mfa/setup ──────────────────────────────────────────────────────
@auth_bp.post("/mfa/setup")
@jwt_required_custom
def mfa_setup():
    user = current_user()
    result = auth_service.setup_mfa(user.id)
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 400
    return jsonify({"secret": result["secret"], "qrCode": result["qrCode"]}), 200


# ── POST /auth/mfa/enable ─────────────────────────────────────────────────────
@auth_bp.post("/mfa/enable")
@jwt_required_custom
def mfa_enable():
    """Confirme l'activation MFA via un code OTP après setup."""
    user = current_user()
    data = request.get_json(silent=True) or {}
    code = data.get("code", "")
    result = auth_service.verify_mfa(user.id, code, _ip())
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 401
    return jsonify({"mfaEnabled": True}), 200


# ── POST /auth/mfa/disable ────────────────────────────────────────────────────
@auth_bp.post("/mfa/disable")
@jwt_required_custom
def mfa_disable():
    user = current_user()
    data = request.get_json(silent=True) or {}
    code = data.get("code", "")
    result = auth_service.disable_mfa(user.id, code, _ip())
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 400
    return jsonify({"mfaEnabled": False}), 200


# ── GET /auth/me ──────────────────────────────────────────────────────────────
@auth_bp.get("/me")
@jwt_required_custom
def me():
    user = current_user()
    if not user:
        return jsonify({"error": "USER_NOT_FOUND"}), 404
    return jsonify({"user": user.to_dict()}), 200