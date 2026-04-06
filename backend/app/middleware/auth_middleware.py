from functools import wraps
from flask import jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt

from app.extensions import db
from app.models.user import User


# ──────────────────────────────────────────────────────────────────────────────
# Décorateur : token valide requis (hors MFA pending)
# ──────────────────────────────────────────────────────────────────────────────
def jwt_required_custom(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            verify_jwt_in_request()
        except Exception as e:
            return jsonify({"error": "UNAUTHORIZED", "message": str(e)}), 401

        claims = get_jwt()
        if claims.get("mfa_pending"):
            return jsonify({"error": "MFA_REQUIRED"}), 403

        return fn(*args, **kwargs)
    return wrapper


# ──────────────────────────────────────────────────────────────────────────────
# Décorateur : rôle minimum requis
# ──────────────────────────────────────────────────────────────────────────────
ROLE_RANK = {"viewer": 0, "editor": 1, "admin": 2}

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
def current_user() -> User | None:
    try:
        verify_jwt_in_request()
        user_id = get_jwt_identity()
        return db.session.get(User, user_id)
    except Exception:
        return None