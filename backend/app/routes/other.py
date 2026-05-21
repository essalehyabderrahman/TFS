import uuid
from flask import Blueprint, request, jsonify
from app.extensions import db, limiter
from app.models.user import User
from app.models.audit_log import AuditLog
from app.middleware.auth_middleware import jwt_required_custom, require_role, current_user
from app.middleware.csrf_middleware import csrf_protect

# ══════════════════════════════════════════════════════════════════════════════
# TEAM
# ══════════════════════════════════════════════════════════════════════════════
from app.models.team_settings import TeamSettings

team_bp = Blueprint("team", __name__, url_prefix="/team")


def _is_last_admin(exclude_id: str = None) -> bool:
    q = User.query.filter_by(role="admin", status="active")
    if exclude_id:
        q = q.filter(User.id != exclude_id)
    return q.count() == 0


def _get_settings() -> TeamSettings:
    """Returns the singleton TeamSettings row, creating it if missing."""
    s = TeamSettings.query.first()
    if not s:
        s = TeamSettings()
        db.session.add(s)
        db.session.commit()
    return s



@team_bp.get("/search")
@jwt_required_custom
def search_users():
    """
    Email prefix search for invite autocomplete.
    [Security] Admin-only. Returns at most 5 non-suspended, non-root users.
    Requires at least 2 characters to prevent full-directory enumeration.
    """
    actor = current_user()
    if actor.role != "admin":
        return jsonify({"error": "FORBIDDEN"}), 403

    q = request.args.get("q", "").strip().lower()
    if len(q) < 2:
        return jsonify([]), 200

    users = (
        User.query
        .filter(
            User.email.ilike(f"%{q}%"),
            User.status != "suspended",
            User.is_root == False,          # noqa: E712 — SQLAlchemy requires ==
            User.id != actor.id,
        )
        .order_by(User.email)
        .limit(5)
        .all()
    )

    return jsonify([
        {
            "id":     u.id,
            "email":  u.email,
            "name":   u.name,
            "avatar": u.avatar or u._initials(),
        }
        for u in users
    ]), 200


@team_bp.get("")
@jwt_required_custom
def list_team():
    user = current_user()
    settings = _get_settings()

    # Admins always see the full directory.
    # Regular users only see it if allow_member_directory is enabled.
    if user.role != "admin" and not settings.allow_member_directory:
        return jsonify({"error": "FORBIDDEN"}), 403

    members = User.query.order_by(User.created_at).all()
    if user.role == "admin":
        return jsonify([m.to_dict() for m in members]), 200
    return jsonify([m.to_public_dict() for m in members]), 200


@team_bp.post("")
@csrf_protect
@jwt_required_custom
@limiter.limit("10 per minute")
def invite_member():
    actor    = current_user()
    settings = _get_settings()

    # Admins can always invite.
    # Regular users can only invite if allow_member_invite is enabled.
    if actor.role != "admin" and not settings.allow_member_invite:
        return jsonify({"error": "FORBIDDEN"}), 403

    data     = request.get_json(silent=True) or {}
    name     = data.get("name", "").strip()
    email    = data.get("email", "").strip().lower()
    role     = data.get("role", "user")
    password = data.get("password", "").strip()

    if not name or not email:
        return jsonify({"error": "MISSING_FIELDS"}), 400

    # Only admins can assign the admin role
    if role not in ("admin", "user"):
        return jsonify({"error": "INVALID_ROLE"}), 400

    # [Security] Only root may invite with the admin role
    if role == "admin" and not actor.is_root:
        return jsonify({"error": "FORBIDDEN"}), 403

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "EMAIL_TAKEN"}), 409

    if password:
        from app.services.auth_service import _validate_password
        pw_error = _validate_password(password)
        if pw_error:
            return jsonify({"error": pw_error}), 400

    member = User(
        id=str(uuid.uuid4()),
        name=name,
        email=email,
        role=role,
        status="active" if password else "pending",
        password_reset_required=True,
    )
    if password:
        member.set_password(password)
    else:
        member.set_password(str(uuid.uuid4()))
    db.session.add(member)
    db.session.commit()

    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=actor.id,
        user_email=actor.email,
        action="MEMBER_INVITED",
        resource=email,
        ip_address=request.remote_addr,
        status="success",
        details=f"Invited {email} with role '{role}'"
    ))
    db.session.commit()
    return jsonify(member.to_dict()), 201


@team_bp.patch("/<member_id>")
@csrf_protect
@require_role("admin")
@limiter.limit("20 per minute")
def update_member(member_id):
    actor  = current_user()
    member = db.session.get(User, member_id)
    if not member:
        return jsonify({"error": "NOT_FOUND"}), 404

    data = request.get_json(silent=True) or {}

    # [Security] Root account is immutable — no one may touch it (not even another root)
    if member.is_root:
        return jsonify({"error": "ROOT_PROTECTED"}), 403

    # [Security] No admin may change their own role
    if actor.id == member.id and "role" in data:
        return jsonify({"error": "CANNOT_CHANGE_OWN_ROLE"}), 403

    # [Security] Only root may promote/demote roles
    if "role" in data and not actor.is_root:
        return jsonify({"error": "FORBIDDEN"}), 403

    if "role" in data and data["role"] in ("admin", "user"):
        if member.role == "admin" and data["role"] != "admin":
            if _is_last_admin(exclude_id=member.id):
                return jsonify({"error": "LAST_ADMIN_PROTECTED"}), 403
        member.role = data["role"]

    if "status" in data and data["status"] in ("active", "pending", "suspended"):
        if data["status"] == "suspended" and member.role == "admin":
            if _is_last_admin(exclude_id=member.id):
                return jsonify({"error": "LAST_ADMIN_PROTECTED"}), 403
        member.status = data["status"]
        if data["status"] == "suspended":
            member.token_version = (member.token_version or 0) + 1
    if "name" in data:
        member.name = data["name"].strip()

    # Quota management (admin only)
    if "storageQuota" in data:
        quota_val = data["storageQuota"]
        if quota_val is None:
            member.storage_quota_bytes = None  # Remove quota (unlimited)
        else:
            try:
                member.storage_quota_bytes = max(0, int(quota_val))
            except (ValueError, TypeError):
                return jsonify({"error": "INVALID_QUOTA_VALUE"}), 400

    db.session.commit()

    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=actor.id,
        user_email=actor.email,
        action="MEMBER_UPDATED",
        resource=member.email,
        ip_address=request.remote_addr,
        status="success",
        details=f"Updated member {member.email}: {data}"
    ))
    db.session.commit()
    return jsonify(member.to_dict()), 200


@team_bp.delete("/<member_id>")
@csrf_protect
@require_role("admin")
@limiter.limit("20 per minute")
def delete_member(member_id):
    actor  = current_user()
    member = db.session.get(User, member_id)
    if not member:
        return jsonify({"error": "NOT_FOUND"}), 404
    if member.id == actor.id:
        return jsonify({"error": "CANNOT_DELETE_SELF"}), 400
    # [Security] Root account can never be deleted
    if member.is_root:
        return jsonify({"error": "ROOT_PROTECTED"}), 403
    if member.role == "admin" and _is_last_admin(exclude_id=member.id):
        return jsonify({"error": "LAST_ADMIN_PROTECTED"}), 403

    db.session.delete(member)
    db.session.commit()

    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=actor.id,
        user_email=actor.email,
        action="MEMBER_DELETED",
        resource=member.email,
        ip_address=request.remote_addr,
        status="warning",
        details=f"Deleted member {member.email} (role: {member.role})"
    ))
    db.session.commit()
    return jsonify({"deleted": True}), 200


# ── PATCH /team/<user_id>/password ────────────────────────────────────────────
@team_bp.patch("/<user_id>/password")
@csrf_protect
@require_role("admin")
@limiter.limit("5 per minute")
def admin_set_password(user_id):
    """
    Allows an admin to set a user's password directly.
    [Security] root can set anyone's password. admin can set 'user' role passwords.
    """
    actor = current_user()
    target = db.session.get(User, user_id)
    if not target:
        return jsonify({"error": "USER_NOT_FOUND"}), 404

    # [Security] Admin cannot change other admins' passwords unless they are root
    if target.role == "admin" and not actor.is_root:
        return jsonify({"error": "FORBIDDEN"}), 403

    data = request.get_json(silent=True) or {}
    new_password = data.get("password")
    if not new_password:
        return jsonify({"error": "INVALID_PASSWORD"}), 400

    from app.services.auth_service import _validate_password
    pw_error = _validate_password(new_password)
    if pw_error:
        return jsonify({"error": pw_error}), 400

    target.set_password(new_password)
    target.password_reset_required = True
    # Invalidate existing sessions
    target.token_version = (target.token_version or 1) + 1
    
    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=actor.id,
        user_email=actor.email,
        action="MEMBER_PASSWORD_RESET_ADMIN",
        resource=target.email,
        ip_address=request.remote_addr,
        status="warning",
        details=f"Password for {target.email} manually set by admin."
    ))
    db.session.commit()
    return jsonify({"ok": True}), 200


# ── POST /team/<user_id>/send-password-email ──────────────────────────────────
@team_bp.post("/<user_id>/send-password-email")
@csrf_protect
@require_role("admin")
@limiter.limit("10 per hour")
def admin_send_password_email(user_id):
    """
    Allows an admin to send the temporary password notification email to a user.
    """
    import os, smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    actor = current_user()
    target = db.session.get(User, user_id)
    if not target:
        return jsonify({"error": "USER_NOT_FOUND"}), 404

    # [Security] Admin cannot send password email to other admins unless they are root
    if target.role == "admin" and not actor.is_root:
        return jsonify({"error": "FORBIDDEN"}), 403

    data = request.get_json(silent=True) or {}
    to_addr = (data.get("to") or "").strip()
    subject = (data.get("subject") or "").strip()
    body = (data.get("body") or "").strip()

    if not to_addr or not subject or not body:
        return jsonify({"error": "MISSING_FIELDS"}), 400

    smtp_sender   = os.environ.get("SMTP_SENDER_EMAIL")
    smtp_password = os.environ.get("SMTP_APP_PASSWORD")
    smtp_host     = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port     = int(os.environ.get("SMTP_PORT", 587))

    email_sent = False
    if smtp_sender and smtp_password:
        msg = MIMEMultipart()
        msg["From"]    = f"TFS Security <{smtp_sender}>"
        msg["To"]      = to_addr
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain", "utf-8"))
        try:
            if smtp_port == 465:
                with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10) as srv:
                    srv.login(smtp_sender, smtp_password)
                    srv.sendmail(smtp_sender, to_addr, msg.as_string())
            else:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as srv:
                    srv.ehlo(); srv.starttls(); srv.ehlo()
                    srv.login(smtp_sender, smtp_password)
                    srv.sendmail(smtp_sender, to_addr, msg.as_string())
            email_sent = True
        except Exception as e:
            db.session.add(AuditLog(
                id=str(uuid.uuid4()),
                user_id=actor.id,
                user_email=actor.email,
                action="MEMBER_PASSWORD_EMAIL_FAILED",
                resource=target.email,
                ip_address=request.remote_addr,
                status="error",
                details=f"SMTP error sending password email to {target.email}: {e}"
            ))
            db.session.commit()
            return jsonify({"error": f"SMTP error: {e}"}), 500

    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=actor.id,
        user_email=actor.email,
        action="MEMBER_PASSWORD_EMAIL_SENT",
        resource=target.email,
        ip_address=request.remote_addr,
        status="info",
        details=f"Password email sent to {target.email} by admin {actor.email}."
    ))
    db.session.commit()

    return jsonify({"ok": True, "emailSent": email_sent}), 200


# ── GET /team/settings ────────────────────────────────────────────────────────
@team_bp.get("/settings")
@require_role("admin")
@limiter.limit("30 per minute")
def get_team_settings():
    return jsonify(_get_settings().to_dict()), 200


# ── PATCH /team/settings ──────────────────────────────────────────────────────
@team_bp.patch("/settings")
@csrf_protect
@require_role("admin")
@limiter.limit("10 per minute")
def update_team_settings():
    actor    = current_user()
    settings = _get_settings()
    data     = request.get_json(silent=True) or {}

    allowed_fields = {
        "allowMemberDirectory": "allow_member_directory",
        "allowMemberInvite":    "allow_member_invite",
        "allowExternalSharing": "allow_external_sharing",
    }

    changed = []
    for json_key, db_field in allowed_fields.items():
        if json_key in data:
            new_val = bool(data[json_key])
            setattr(settings, db_field, new_val)
            changed.append(f"{json_key}={new_val}")

    if not changed:
        return jsonify({"error": "NO_VALID_FIELDS"}), 400

    settings.updated_by_id = actor.id
    db.session.commit()

    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=actor.id,
        user_email=actor.email,
        action="TEAM_SETTINGS_UPDATED",
        resource="team_settings",
        ip_address=request.remote_addr,
        status="success",
        details=f"Updated: {', '.join(changed)}"
    ))
    db.session.commit()
    return jsonify(settings.to_dict()), 200


# ══════════════════════════════════════════════════════════════════════════════
# AUDIT LOGS
# ══════════════════════════════════════════════════════════════════════════════
audit_bp = Blueprint("audit", __name__, url_prefix="/audit")


@audit_bp.get("")
@jwt_required_custom
@limiter.limit("30 per minute")
def list_logs():
    """
    App admins see all logs.
    Group admins see only logs scoped to their group(s).
    Regular members cannot access audit logs.
    """
    from app.models.group import GroupMember
    actor = current_user()

    # Determine accessible group IDs for this user
    if actor.role == "admin":
        accessible_group_ids = None  # None = no filter = see all
    else:
        admin_memberships = GroupMember.query.filter_by(
            user_id=actor.id, role="admin"
        ).all()
        if not admin_memberships:
            return jsonify({"error": "FORBIDDEN"}), 403
        accessible_group_ids = [m.group_id for m in admin_memberships]

    user_filter   = request.args.get("user")
    action_filter = request.args.get("action")
    status_filter = request.args.get("status")
    limit         = min(int(request.args.get("limit", 100)), 500)
    offset        = int(request.args.get("offset", 0))

    q = AuditLog.query.order_by(AuditLog.timestamp.desc())

    if accessible_group_ids is not None:
        q = q.filter(AuditLog.group_id.in_(accessible_group_ids))

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

    settings = _get_settings()

    # Quota info
    from app.services.quota_service import get_quota_info
    quota = get_quota_info(user)

    # Pending quota request
    from app.models.quota_request import QuotaRequest
    pending_qr = QuotaRequest.query.filter_by(user_id=user.id, status="pending").first()

    result = {
        **user.to_dict(),
        "transfersCount": transfers_count,
        "storageUsedBytes": total_bytes,
        "requireMfa": settings.require_mfa,
        "quotaInfo": quota,
        "pendingQuotaRequest": pending_qr.to_dict() if pending_qr else None,
    }

    # Group membership counts — scoped by role
    from app.models.group import GroupMember
    if user.is_root:
        # Root admin sees the full platform headcount
        result["totalUsers"] = User.query.count()
        result["groupCount"] = None  # not shown for root
    elif user.role == "admin":
        # Regular admin sees how many groups they administrate
        result["groupCount"] = GroupMember.query.filter_by(
            user_id=user.id, role="admin"
        ).count()
    else:
        # Regular user sees how many groups they belong to
        result["groupCount"] = GroupMember.query.filter_by(
            user_id=user.id
        ).count()

    return jsonify(result), 200


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

    from app.services.auth_service import _log
    _log("ACCOUNT_UPDATED", user.email, user.id, "success", request.remote_addr,
         details=f"Account fields updated: {list(data.keys())}")
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
    from app.services.auth_service import _validate_new_password
    pw_error = _validate_new_password(new_pw, user.password_hash)
    if pw_error:
        return jsonify({"error": pw_error}), 400

    user.set_password(new_pw)
    user.password_reset_required = False
    
    # [Security] Token Rotation: invalidate ALL existing sessions by bumping token version
    user.token_version += 1
    
    # [Audit] Log password change
    from app.services.auth_service import _log
    ip = request.remote_addr
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
            "token_version": user.token_version,
            "password_reset_required": False
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

    # [Security] Root admin account can never be self-deleted
    if user.is_root:
        return jsonify({"error": "ROOT_PROTECTED"}), 403

    # [Security] Prevent deleting the last active platform admin
    if user.role == "admin" and _is_last_admin(exclude_id=user.id):
        return jsonify({"error": "LAST_ADMIN_PROTECTED"}), 403

    # [Security] Prevent deleting account if user is the sole admin of any group
    from app.models.group import GroupMember
    memberships = GroupMember.query.filter_by(user_id=user.id, role="admin").all()
    for m in memberships:
        group_admin_count = GroupMember.query.filter_by(
            group_id=m.group_id, role="admin"
        ).count()
        if group_admin_count <= 1:
            return jsonify({"error": "LAST_GROUP_ADMIN_PROTECTED"}), 403

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

    from app.services.auth_service import _log
    _log("ACCOUNT_DELETED", user.email, user.id, "warning", request.remote_addr,
         details="User self-deleted their account.")

    db.session.delete(user)
    db.session.commit()

    from flask_jwt_extended import unset_jwt_cookies
    response = jsonify({"ok": True})
    unset_jwt_cookies(response)
    return response, 200


# ══════════════════════════════════════════════════════════════════════════════
# APP-WIDE PLATFORM SETTINGS  (root admin only)
# ══════════════════════════════════════════════════════════════════════════════
app_bp = Blueprint("app", __name__, url_prefix="/app")


def _require_root(actor):
    """Returns a 403 response tuple if the actor is not the root admin, else None."""
    if not actor.is_root:
        return jsonify({"error": "FORBIDDEN"}), 403
    return None


@app_bp.get("/settings")
@jwt_required_custom
def get_app_settings():
    actor = current_user()
    err = _require_root(actor)
    if err:
        return err
    settings = _get_settings()
    return jsonify({
        "requireMfa":          settings.require_mfa,
        "allowSignup":         settings.allow_signup,
        "allowExternalSharing": settings.allow_external_sharing,
    }), 200


@app_bp.patch("/settings")
@csrf_protect
@jwt_required_custom
def update_app_settings():
    actor = current_user()
    err = _require_root(actor)
    if err:
        return err

    settings = _get_settings()
    data     = request.get_json(silent=True) or {}

    allowed = {
        "requireMfa":           "require_mfa",
        "allowSignup":          "allow_signup",
        "allowExternalSharing": "allow_external_sharing",
    }

    changed = []
    for json_key, db_field in allowed.items():
        if json_key in data:
            new_val = bool(data[json_key])
            setattr(settings, db_field, new_val)
            changed.append(f"{json_key}={new_val}")

    if not changed:
        return jsonify({"error": "NO_VALID_FIELDS"}), 400

    settings.updated_by_id = actor.id
    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=actor.id,
        user_email=actor.email,
        action="APP_SETTINGS_UPDATED",
        resource="app_settings",
        ip_address=request.remote_addr,
        status="success",
        details=f"Platform policy updated: {', '.join(changed)}",
    ))
    db.session.commit()
    return jsonify({
        "requireMfa":          settings.require_mfa,
        "allowSignup":         settings.allow_signup,
        "allowExternalSharing": settings.allow_external_sharing,
    }), 200


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