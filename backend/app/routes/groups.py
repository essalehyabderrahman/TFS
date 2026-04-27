import uuid
from flask import Blueprint, request, jsonify
from app.extensions import db
from app.models.user import User
from app.models.group import Group, GroupMember, GroupSettings
from app.models.audit_log import AuditLog
from app.middleware.auth_middleware import jwt_required_custom, require_role, current_user
from app.middleware.csrf_middleware import csrf_protect

groups_bp = Blueprint("groups", __name__, url_prefix="/groups")


def _ip():
    return request.remote_addr


def _is_group_admin(user: User, group: Group) -> bool:
    """Returns True if user is an app admin or a group-level admin of this group."""
    if user.role == "admin":
        return True
    member = next((m for m in group.members if m.user_id == user.id), None)
    return member is not None and member.role == "admin"


def _is_group_member(user: User, group: Group) -> bool:
    """Returns True if user belongs to this group (any role) or is app admin."""
    if user.role == "admin":
        return True
    return any(m.user_id == user.id for m in group.members)


def _get_user_groups(user: User) -> list:
    """Returns all groups the user is a member of."""
    memberships = GroupMember.query.filter_by(user_id=user.id).all()
    return [m.group for m in memberships]


# ── GET /groups ───────────────────────────────────────────────────────────────
@groups_bp.get("")
@jwt_required_custom
def list_groups():
    """
    App admins see all groups.
    Regular users see only groups they belong to.
    """
    user = current_user()
    if user.role == "admin":
        groups = Group.query.order_by(Group.created_at).all()
    else:
        groups = _get_user_groups(user)

    result = []
    for g in groups:
        d = g.to_dict()
        # Include the calling user's role within this group
        member = next((m for m in g.members if m.user_id == user.id), None)
        d["myRole"] = member.role if member else ("admin" if user.role == "admin" else None)
        result.append(d)

    return jsonify(result), 200


# ── POST /groups ──────────────────────────────────────────────────────────────
@groups_bp.post("")
@csrf_protect
@require_role("admin")
def create_group():
    """Only app admins can create groups."""
    actor = current_user()
    data  = request.get_json(silent=True) or {}
    name  = data.get("name", "").strip()
    desc  = data.get("description", "").strip()

    if not name:
        return jsonify({"error": "MISSING_NAME"}), 400

    if Group.query.filter_by(name=name).first():
        return jsonify({"error": "GROUP_NAME_TAKEN"}), 409

    group = Group(
        id=str(uuid.uuid4()),
        name=name,
        description=desc or None,
        created_by_id=actor.id,
    )
    db.session.add(group)

    # Auto-create default settings for the group
    settings = GroupSettings(
        id=str(uuid.uuid4()),
        group_id=group.id,
    )
    db.session.add(settings)

    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=actor.id,
        user_email=actor.email,
        action="GROUP_CREATED",
        resource=name,
        ip_address=_ip(),
        status="success",
        details=f"Group '{name}' created.",
        group_id=group.id,
    ))
    db.session.commit()
    return jsonify(group.to_dict()), 201


# ── DELETE /groups/<group_id> ─────────────────────────────────────────────────
@groups_bp.delete("/<group_id>")
@csrf_protect
@require_role("admin")
def delete_group(group_id):
    """Only app admins can delete groups."""
    actor = current_user()
    group = db.session.get(Group, group_id)
    if not group:
        return jsonify({"error": "NOT_FOUND"}), 404

    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=actor.id,
        user_email=actor.email,
        action="GROUP_DELETED",
        resource=group.name,
        ip_address=_ip(),
        status="warning",
        details=f"Group '{group.name}' deleted.",
    ))
    db.session.delete(group)
    db.session.commit()
    return jsonify({"deleted": True}), 200


# ── GET /groups/<group_id>/members ────────────────────────────────────────────
@groups_bp.get("/<group_id>/members")
@jwt_required_custom
def list_members(group_id):
    user  = current_user()
    group = db.session.get(Group, group_id)
    if not group:
        return jsonify({"error": "NOT_FOUND"}), 404

    if not _is_group_member(user, group):
        return jsonify({"error": "FORBIDDEN"}), 403

    # Respect allow_member_directory for non-group-admins
    if not _is_group_admin(user, group):
        settings = group.settings
        if settings and not settings.allow_member_directory:
            return jsonify({"error": "FORBIDDEN"}), 403

    return jsonify([m.to_dict() for m in group.members]), 200


# ── POST /groups/<group_id>/members ───────────────────────────────────────────
@groups_bp.post("/<group_id>/members")
@csrf_protect
@jwt_required_custom
def invite_member(group_id):
    """App admin or group admin can invite. Group admin only if allow_member_invite=True."""
    actor = current_user()
    group = db.session.get(Group, group_id)
    if not group:
        return jsonify({"error": "NOT_FOUND"}), 404

    if not _is_group_admin(actor, group):
        return jsonify({"error": "FORBIDDEN"}), 403

    data       = request.get_json(silent=True) or {}
    user_email = data.get("email", "").strip().lower()
    role       = data.get("role", "member")

    if role not in ("admin", "member"):
        return jsonify({"error": "INVALID_ROLE"}), 400

    # Only app admins can promote someone to group admin
    if role == "admin" and actor.role != "admin":
        return jsonify({"error": "FORBIDDEN"}), 403

    target = User.query.filter_by(email=user_email).first()
    if not target:
        return jsonify({"error": "USER_NOT_FOUND"}), 404

    if any(m.user_id == target.id for m in group.members):
        return jsonify({"error": "ALREADY_MEMBER"}), 409

    member = GroupMember(
        id=str(uuid.uuid4()),
        group_id=group.id,
        user_id=target.id,
        role=role,
        invited_by_id=actor.id,
    )
    db.session.add(member)

    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=actor.id,
        user_email=actor.email,
        action="GROUP_MEMBER_INVITED",
        resource=group.name,
        ip_address=_ip(),
        status="success",
        details=f"{target.email} invited to '{group.name}' as {role}.",
        group_id=group.id,
    ))
    db.session.commit()
    return jsonify(member.to_dict()), 201


# ── PATCH /groups/<group_id>/members/<user_id> ────────────────────────────────
@groups_bp.patch("/<group_id>/members/<user_id>")
@csrf_protect
@jwt_required_custom
def update_member(group_id, user_id):
    """Update a member's role within the group."""
    actor = current_user()
    group = db.session.get(Group, group_id)
    if not group:
        return jsonify({"error": "NOT_FOUND"}), 404

    if not _is_group_admin(actor, group):
        return jsonify({"error": "FORBIDDEN"}), 403

    member = next((m for m in group.members if m.user_id == user_id), None)
    if not member:
        return jsonify({"error": "NOT_FOUND"}), 404

    data     = request.get_json(silent=True) or {}
    new_role = data.get("role")

    if new_role not in ("admin", "member"):
        return jsonify({"error": "INVALID_ROLE"}), 400

    # Only app admins can promote to group admin
    if new_role == "admin" and actor.role != "admin":
        return jsonify({"error": "FORBIDDEN"}), 403

    # Protect last group admin
    if member.role == "admin" and new_role == "member":
        admin_count = sum(1 for m in group.members if m.role == "admin")
        if admin_count <= 1:
            return jsonify({"error": "LAST_GROUP_ADMIN_PROTECTED"}), 403

    member.role = new_role
    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=actor.id,
        user_email=actor.email,
        action="GROUP_MEMBER_UPDATED",
        resource=group.name,
        ip_address=_ip(),
        status="success",
        details=f"{member.user.email} role changed to {new_role} in '{group.name}'.",
        group_id=group.id,
    ))
    db.session.commit()
    return jsonify(member.to_dict()), 200


# ── DELETE /groups/<group_id>/members/<user_id> ───────────────────────────────
@groups_bp.delete("/<group_id>/members/<user_id>")
@csrf_protect
@jwt_required_custom
def remove_member(group_id, user_id):
    """App admin or group admin can remove members."""
    actor = current_user()
    group = db.session.get(Group, group_id)
    if not group:
        return jsonify({"error": "NOT_FOUND"}), 404

    if not _is_group_admin(actor, group):
        return jsonify({"error": "FORBIDDEN"}), 403

    member = next((m for m in group.members if m.user_id == user_id), None)
    if not member:
        return jsonify({"error": "NOT_FOUND"}), 404

    # Protect last group admin
    if member.role == "admin":
        admin_count = sum(1 for m in group.members if m.role == "admin")
        if admin_count <= 1:
            return jsonify({"error": "LAST_GROUP_ADMIN_PROTECTED"}), 403

    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=actor.id,
        user_email=actor.email,
        action="GROUP_MEMBER_REMOVED",
        resource=group.name,
        ip_address=_ip(),
        status="warning",
        details=f"{member.user.email} removed from '{group.name}'.",
        group_id=group.id,
    ))
    db.session.delete(member)
    db.session.commit()
    return jsonify({"removed": True}), 200


# ── GET /groups/<group_id>/settings ──────────────────────────────────────────
@groups_bp.get("/<group_id>/settings")
@jwt_required_custom
def get_settings(group_id):
    user  = current_user()
    group = db.session.get(Group, group_id)
    if not group:
        return jsonify({"error": "NOT_FOUND"}), 404

    if not _is_group_admin(user, group):
        return jsonify({"error": "FORBIDDEN"}), 403

    return jsonify(group.settings.to_dict() if group.settings else {}), 200


# ── PATCH /groups/<group_id>/settings ────────────────────────────────────────
@groups_bp.patch("/<group_id>/settings")
@csrf_protect
@jwt_required_custom
def update_settings(group_id):
    actor = current_user()
    group = db.session.get(Group, group_id)
    if not group:
        return jsonify({"error": "NOT_FOUND"}), 404

    if not _is_group_admin(actor, group):
        return jsonify({"error": "FORBIDDEN"}), 403

    # Global allow_external_sharing override — if app-level is False, group cannot enable it
    from app.models.team_settings import TeamSettings
    app_settings = TeamSettings.query.first()

    data = request.get_json(silent=True) or {}
    s    = group.settings

    allowed_fields = {
        "allowMemberDirectory": "allow_member_directory",
        "allowMemberInvite":    "allow_member_invite",
        "allowExternalSharing": "allow_external_sharing",
        "allowGroupTransfers":  "allow_group_transfers",
    }

    changed = []
    for json_key, db_field in allowed_fields.items():
        if json_key in data:
            new_val = bool(data[json_key])
            # Global override: external sharing cannot be enabled if disabled app-wide
            if json_key == "allowExternalSharing" and new_val:
                if app_settings and not app_settings.allow_external_sharing:
                    return jsonify({"error": "EXTERNAL_SHARING_DISABLED_GLOBALLY"}), 403
            setattr(s, db_field, new_val)
            changed.append(f"{json_key}={new_val}")

    if not changed:
        return jsonify({"error": "NO_VALID_FIELDS"}), 400

    s.updated_by_id = actor.id
    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=actor.id,
        user_email=actor.email,
        action="GROUP_SETTINGS_UPDATED",
        resource=group.name,
        ip_address=_ip(),
        status="success",
        details=f"Settings updated: {', '.join(changed)}",
        group_id=group.id,
    ))
    db.session.commit()
    return jsonify(s.to_dict()), 200
