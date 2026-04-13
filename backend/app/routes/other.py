import uuid
from flask import Blueprint, request, jsonify
from app.extensions import db
from app.models.user import User
from app.models.audit_log import AuditLog
from app.middleware.auth_middleware import jwt_required_custom, require_role, current_user
from app.middleware.csrf_middleware import csrf_protect

# ══════════════════════════════════════════════════════════════════════════════
# TEAM
# ══════════════════════════════════════════════════════════════════════════════
team_bp = Blueprint("team", __name__, url_prefix="/team")


@team_bp.get("")
@jwt_required_custom
def list_team():
    user = current_user()
    # Seuls admin et editor voient toute l'équipe
    if user.role == "viewer":
        return jsonify({"error": "FORBIDDEN"}), 403
    members = User.query.order_by(User.created_at).all()
    return jsonify([m.to_dict() for m in members]), 200


@team_bp.post("")
@require_role("admin")
def invite_member():
    data   = request.get_json(silent=True) or {}
    name   = data.get("name", "").strip()
    email  = data.get("email", "").strip().lower()
    role   = data.get("role", "viewer")

    if not name or not email:
        return jsonify({"error": "MISSING_FIELDS"}), 400

    if role not in ("admin", "editor", "viewer"):
        return jsonify({"error": "INVALID_ROLE"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "EMAIL_TAKEN"}), 409

    member = User(
        id=str(uuid.uuid4()),
        name=name,
        email=email,
        role=role,
        status="pending",
    )
    member.set_password(str(uuid.uuid4()))  # Mot de passe temporaire aléatoire
    db.session.add(member)
    db.session.commit()
    return jsonify(member.to_dict()), 201


@team_bp.patch("/<member_id>")
@require_role("admin")
def update_member(member_id):
    member = db.session.get(User, member_id)
    if not member:
        return jsonify({"error": "NOT_FOUND"}), 404

    data = request.get_json(silent=True) or {}
    if "role" in data and data["role"] in ("admin", "editor", "viewer"):
        member.role = data["role"]
    if "status" in data and data["status"] in ("active", "pending", "suspended"):
        member.status = data["status"]
    if "name" in data:
        member.name = data["name"].strip()

    db.session.commit()
    return jsonify(member.to_dict()), 200


@team_bp.delete("/<member_id>")
@require_role("admin")
def delete_member(member_id):
    actor  = current_user()
    member = db.session.get(User, member_id)
    if not member:
        return jsonify({"error": "NOT_FOUND"}), 404
    if member.id == actor.id:
        return jsonify({"error": "CANNOT_DELETE_SELF"}), 400

    db.session.delete(member)
    db.session.commit()
    return jsonify({"deleted": True}), 200


# ══════════════════════════════════════════════════════════════════════════════
# AUDIT LOGS
# ══════════════════════════════════════════════════════════════════════════════
audit_bp = Blueprint("audit", __name__, url_prefix="/audit")


@audit_bp.get("")
@require_role("admin")
def list_logs():
    # Query params pour filtrage
    user_filter   = request.args.get("user")
    action_filter = request.args.get("action")
    status_filter = request.args.get("status")
    limit         = min(int(request.args.get("limit", 100)), 500)
    offset        = int(request.args.get("offset", 0))

    q = AuditLog.query.order_by(AuditLog.timestamp.desc())
    if user_filter:
        q = q.filter(AuditLog.user_email.ilike(f"%{user_filter}%"))
    if action_filter:
        q = q.filter(AuditLog.action == action_filter)
    if status_filter:
        q = q.filter(AuditLog.status == status_filter)

    total = q.count()
    logs  = q.limit(limit).offset(offset).all()
    return jsonify({"total": total, "logs": [l.to_dict() for l in logs]}), 200


# ══════════════════════════════════════════════════════════════════════════════
# ACCOUNT
# ══════════════════════════════════════════════════════════════════════════════
account_bp = Blueprint("account", __name__, url_prefix="/account")


@account_bp.get("")
@jwt_required_custom
def get_account():
    user = current_user()
    from app.models.transfer import Transfer
    transfers_count = Transfer.query.filter_by(uploaded_by_id=user.id, is_deleted=False).count()
    total_bytes = db.session.query(
        db.func.sum(Transfer.size_bytes)
    ).filter_by(uploaded_by_id=user.id, is_deleted=False).scalar() or 0

    total_users = User.query.count()
    
    return jsonify({
        **user.to_dict(),
        "transfersCount": transfers_count,
        "storageUsedBytes": total_bytes,
        "totalUsers": total_users,
    }), 200


@account_bp.patch("")
@csrf_protect
@jwt_required_custom
def update_account():
    user = current_user()
    data = request.get_json(silent=True) or {}

    if "name" in data and data["name"].strip():
        user.name = data["name"].strip()
        
    if "company" in data:
        user.company = data["company"].strip() or "Individual"

    db.session.commit()
    return jsonify(user.to_dict()), 200


@account_bp.post("/change-password")
@csrf_protect
@jwt_required_custom
def change_password():
    user = current_user()
    data = request.get_json(silent=True) or {}
    current_pw = data.get("currentPassword", "")
    new_pw     = data.get("newPassword", "")

    if not user.check_password(current_pw):
        return jsonify({"error": "WRONG_PASSWORD"}), 401
        
    # [Security] Enforce strict password policy
    from app.services.auth_service import _validate_password
    pw_error = _validate_password(new_pw)
    if pw_error:
        return jsonify({"error": pw_error}), 400

    user.set_password(new_pw)
    
    # [Security] Token Rotation: invalidate ALL existing sessions by bumping token version
    user.token_version += 1
    
    # [Audit] Log password change
    from app.services.auth_service import _log
    ip = request.headers.get("X-Forwarded-For", request.remote_addr)
    _log("PASSWORD_CHANGED", user.email, user.id, "success", ip, details="Password changed. All existing sessions invalidated.")
    
    db.session.commit()
    
    # Issue a fresh cookie reflecting the new token_version so the current session survives
    from flask_jwt_extended import create_access_token, set_access_cookies
    from datetime import datetime, timezone
    now_ts = int(datetime.now(timezone.utc).timestamp())
    fresh_token = create_access_token(
        identity=user.id,
        additional_claims={
            "session_created_at": now_ts,
            "token_version": user.token_version
        }
    )
    response = jsonify({"ok": True})
    set_access_cookies(response, fresh_token)
    return response, 200


@account_bp.delete("")
@csrf_protect
@jwt_required_custom
def delete_account():
    user = current_user()
    
    # Optional explicitly handle files if they are not stored just in DB (e.g., local storage)
    from app.models.transfer import Transfer
    transfers = Transfer.query.filter_by(uploaded_by_id=user.id).all()
    import os
    from flask import current_app
    for t in transfers:
        if os.path.exists(t.stored_path):
            try:
                os.remove(t.stored_path)
            except Exception:
                pass
                
    db.session.delete(user)
    db.session.commit()
    return jsonify({"ok": True}), 200


# ══════════════════════════════════════════════════════════════════════════════
# SECURITY SETTINGS
# ══════════════════════════════════════════════════════════════════════════════
security_bp = Blueprint("security", __name__, url_prefix="/security")


@security_bp.get("/settings")
@jwt_required_custom
def get_settings():
    user = current_user()
    return jsonify({
        "mfaEnabled":         user.mfa_enabled,
        "sessionTimeout":     user.session_timeout,
        "encryptionLevel":    user.encryption_level,
        "loginNotifications": user.login_notifications,
    }), 200


@security_bp.patch("/settings")
@csrf_protect
@jwt_required_custom
def update_settings():
    user = current_user()
    data = request.get_json(silent=True) or {}

    if "sessionTimeout" in data:
        user.session_timeout = max(5, min(int(data["sessionTimeout"]), 1440))
    if "encryptionLevel" in data and data["encryptionLevel"] in ("AES-128-GCM", "AES-256-GCM"):
        user.encryption_level = data["encryptionLevel"]
    if "loginNotifications" in data:
        user.login_notifications = bool(data["loginNotifications"])

    db.session.commit()
    return jsonify({
        "mfaEnabled":         user.mfa_enabled,
        "sessionTimeout":     user.session_timeout,
        "encryptionLevel":    user.encryption_level,
        "loginNotifications": user.login_notifications,
    }), 200