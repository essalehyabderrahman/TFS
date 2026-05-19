from functools import wraps
from datetime import datetime, timezone
from flask import jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt

from app.extensions import db
from app.models.user import User


# ──────────────────────────────────────────────────────────────────────────────
# Décorateur : token valide requis (hors MFA pending)
# [Session] Enforces:
#   - 15-min idle timeout  (JWT_ACCESS_TOKEN_EXPIRES = 15 min — Flask-JWT handles this)
#   - 8-hr absolute max    (custom 'session_created_at' claim checked here)
#   - mfa_pending blocked from accessing protected resources
# ──────────────────────────────────────────────────────────────────────────────
def jwt_required_custom(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            verify_jwt_in_request()
        except Exception as e:
            msg = str(e).lower()
            if "expired" in msg:
                return jsonify({"error": "TOKEN_EXPIRED", "message": str(e)}), 401
            return jsonify({"error": "UNAUTHORIZED", "message": str(e)}), 401

        claims = get_jwt()

        # [Security] Block any token that still has mfa_pending=True
        if claims.get("mfa_pending"):
            return jsonify({"error": "MFA_REQUIRED"}), 403

        # [Security] Block any token that requires a password reset
        # Allow only the change-password, get-account, and signout endpoints to proceed
        allowed_endpoints = ("account.change_password", "account.get_account", "auth.signout")
        if claims.get("password_reset_required") and request.endpoint not in allowed_endpoints:
            return jsonify({"error": "PASSWORD_RESET_REQUIRED", "message": "You must change your password before continuing."}), 403

        # [Session] Enforce 8-hour absolute max session lifetime
        session_created_at = claims.get("session_created_at")
        if session_created_at:
            from datetime import timedelta
            created = datetime.fromtimestamp(session_created_at, tz=timezone.utc)
            if datetime.now(timezone.utc) - created > timedelta(hours=8):
                from app.services.auth_service import _log
                ip = request.remote_addr
                user_id = get_jwt_identity()
                _log("SESSION_EXPIRED", "unknown", user_id, "info", ip, details="Absolute 8-hour session limit reached.")
                db.session.commit()
                return jsonify({"error": "SESSION_EXPIRED", "message": "Absolute session limit reached. Please sign in again."}), 401

        # [Security] Validate that the user actually still exists in real-time
        user_id = get_jwt_identity()
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({"error": "UNAUTHORIZED", "message": "Session target no longer exists"}), 401

        # [Security] Reject suspended users regardless of token validity
        if user.status == "suspended":
            from app.services.auth_service import _log
            _log("ACCESS_DENIED_SUSPENDED", user.email, user.id, "warning", request.remote_addr,
                 details="Suspended user attempted to access a protected resource.")
            db.session.commit()
            return jsonify({"error": "ACCOUNT_SUSPENDED", "message": "Your account has been suspended."}), 403

        # [Security] Assert Token Version matches DB — invalidates old tokens if password was changed
        # We only check this for non-pending tokens as tempTokens don't have a token_version claim
        token_version = claims.get("token_version")
        if token_version is not None and token_version < user.token_version:
            from app.services.auth_service import _log
            ip = request.remote_addr
            _log("SESSION_REVOKED", user.email, user.id, "warning", ip, details="Session forcefully revoked due to credential changes.")
            db.session.commit()
            return jsonify({"error": "SESSION_REVOKED", "message": "Session has been revoked due to credential changes. Please sign in again."}), 401

        return fn(*args, **kwargs)
    return wrapper



def jwt_mfa_setup_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            verify_jwt_in_request()
        except Exception:
            return jsonify({"error": "UNAUTHORIZED"}), 401

        claims = get_jwt()
        mfa_pending = claims.get("mfa_pending", False)
        is_full_session = "session_created_at" in claims

        # Accept: temp token in MFA onboarding flow OR full authenticated session
        if not mfa_pending and not is_full_session:
            return jsonify({"error": "UNAUTHORIZED"}), 401

        return fn(*args, **kwargs)
    return wrapper



# ──────────────────────────────────────────────────────────────────────────────
# Décorateur : rôle minimum requis
# ──────────────────────────────────────────────────────────────────────────────
ROLE_RANK = {"user": 0, "admin": 1}

def require_role(min_role: str):
    def decorator(fn):
        @wraps(fn)
        @jwt_required_custom
        def wrapper(*args, **kwargs):
            user_id = get_jwt_identity()
            user    = db.session.get(User, user_id)
            if not user:
                return jsonify({"error": "USER_NOT_FOUND"}), 404

            if ROLE_RANK.get(user.role, 0) < ROLE_RANK.get(min_role, 0):
                return jsonify({"error": "FORBIDDEN", "required": min_role}), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator


# ──────────────────────────────────────────────────────────────────────────────
# Helper : récupère l'utilisateur courant depuis le JWT
# ──────────────────────────────────────────────────────────────────────────────
def current_user():
    from app.models.user import User
    user_id = get_jwt_identity()
    if not user_id:
        return None
    return db.session.get(User, user_id)