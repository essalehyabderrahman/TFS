from flask import Blueprint, request, jsonify, send_file, current_app
from app.services import file_service
from app.middleware.auth_middleware import jwt_required_custom, current_user
from app.middleware.csrf_middleware import csrf_protect
from app.models.audit_log import AuditLog, ACLEntry
from app.models.user import User
from app.models.transfer import Transfer
from app.middleware.acl_middleware import requires_permission, resolve_effective_permissions
from app.extensions import db, limiter
import uuid
import mimetypes

transfers_bp = Blueprint("transfers", __name__, url_prefix="/transfers")


def _ip():
    return request.remote_addr


# ── GET /transfers ─────────────────────────────────────────────────────────────
@transfers_bp.get("")
@jwt_required_custom
@limiter.limit("30 per minute")
def list_transfers():
    user = current_user()
    data = file_service.list_transfers(user)
    return jsonify(data), 200


# ── GET /transfers/received ────────────────────────────────────────────────────
@transfers_bp.get("/received")
@jwt_required_custom
def received():
    user = current_user()
    data = file_service.list_received(user)
    return jsonify(data), 200


# ── POST /transfers ─────────────────────────────────────────────────────────────
@transfers_bp.post("")
@csrf_protect
@jwt_required_custom
@limiter.limit("10 per minute; 50 per hour")
def upload():
    user = current_user()

    if "file" not in request.files:
        return jsonify({"error": "NO_FILE"}), 400

    file            = request.files["file"]
    recipient_email = request.form.get("recipientEmail", "")
    try:
        expiry_days = int(request.form.get("expiryDays", 7))
    except (ValueError, TypeError):
        expiry_days = 7
    if expiry_days != 0:
        expiry_days = max(1, min(expiry_days, 365))

    result = file_service.upload_file(
        file=file,
        uploader_id=user.id,
        recipient_email=recipient_email,
        expiry_days=expiry_days,
        upload_folder=current_app.config["UPLOAD_FOLDER"],
        allowed_ext=current_app.config["ALLOWED_EXTENSIONS"],
        ip=_ip(),
        encrypt=bool(request.form.get("encrypt", "true").lower() == "true")
    )

    if not result["ok"]:
        if result["error"] in ("QUOTA_EXCEEDED", "GROUP_QUOTA_EXCEEDED"):
            return jsonify({"error": result["error"], **(result.get("details", {}))}), 413
        return jsonify({"error": result["error"]}), 400

    return jsonify(result["transfer"]), 201


# ── GET /transfers/<id>/download ───────────────────────────────────────────────
@transfers_bp.get("/<transfer_id>/download")
@jwt_required_custom
@limiter.limit("20 per minute")
def download(transfer_id):
    user    = current_user()
    result  = file_service.get_transfer_file(transfer_id, user, _ip(), context="download")

    if not result["ok"]:
        status = 403 if result["error"] == "FORBIDDEN" else 404
        return jsonify({"error": result["error"]}), status

    return send_file(
        result["stream"],
        download_name=result["filename"],
        as_attachment=True,
        mimetype="application/octet-stream",
    )


# ── GET /transfers/<id>/preview ────────────────────────────────────────────────
@transfers_bp.get("/<transfer_id>/preview")
@jwt_required_custom
@limiter.limit("30 per minute")
def preview(transfer_id):
    """
    Stream the decrypted file with an inline Content-Disposition so the
    browser renders it (PDF viewer, <img>, etc.) rather than downloading.
    """
    user    = current_user()
    result  = file_service.get_transfer_file(transfer_id, user, _ip(), context="preview")

    if not result["ok"]:
        error  = result["error"]
        status = 403 if error == "FORBIDDEN" else (410 if error == "EXPIRED" else 404)
        return jsonify({"error": error}), status

    mime, _ = mimetypes.guess_type(result["filename"])
    if not mime:
        mime = "application/octet-stream"

    return send_file(
        result["stream"],
        mimetype=mime,
        as_attachment=False,
        download_name=result["filename"],
    )


# ── GET /transfers/<id>/permissions ────────────────────────────────────────────
@transfers_bp.get("/<transfer_id>/permissions")
@jwt_required_custom
def get_permissions(transfer_id):
    """
    Returns the effective permissions of the authenticated user on this transfer.
    Used by the frontend to conditionally render action buttons.
    """
    user = current_user()
    transfer = db.session.get(Transfer, transfer_id)
    if not transfer or transfer.is_deleted:
        return jsonify({"error": "NOT_FOUND"}), 404

    perms = resolve_effective_permissions(transfer, user)
    return jsonify(perms), 200


# ── PUT /transfers/<id>/content ────────────────────────────────────────────────
@transfers_bp.put("/<transfer_id>/content")
@csrf_protect
@jwt_required_custom
@limiter.limit("20 per minute")
def update_content(transfer_id):
    """
    Overwrite a text file's content in place without re-uploading.

    The caller MUST hold the pessimistic lock before calling this endpoint
    (acquired via POST /transfers/<id>/lock). If another user holds the lock
    the service returns FILE_LOCKED (423). For group-workspace files a new
    FileVersion row is created automatically.
    """
    user = current_user()
    body = request.get_json(silent=True) or {}
    content = body.get("content", "")

    result = file_service.update_file_content(transfer_id, content, user, _ip())
    if not result["ok"]:
        error = result["error"]
        if error == "NOT_FOUND":
            return jsonify({"error": error}), 404
        if error == "FORBIDDEN":
            return jsonify({"error": error}), 403
        if error == "FILE_LOCKED":
            return jsonify({"error": error, "lockedBy": result.get("lockedBy")}), 423
        return jsonify({"error": error}), 400

    return jsonify(result["transfer"]), 200


# ── DELETE /transfers/<id> ─────────────────────────────────────────────────────
@transfers_bp.delete("/<transfer_id>")
@csrf_protect
@jwt_required_custom
@limiter.limit("20 per minute")
def delete(transfer_id):
    user   = current_user()
    result = file_service.delete_transfer(transfer_id, user, _ip())
    if not result["ok"]:
        if result["error"] == "FILE_LOCKED":
            return jsonify({"error": "FILE_LOCKED", "lockedBy": result.get("lockedBy")}), 423
        status = 403 if result["error"] == "FORBIDDEN" else 404
        return jsonify({"error": result["error"]}), status
    return jsonify({"deleted": True}), 200


# ── GET /transfers/<id>/versions ───────────────────────────────────────────────
@transfers_bp.get("/<transfer_id>/versions")
@jwt_required_custom
def versions(transfer_id):
    user   = current_user()
    result = file_service.get_versions(transfer_id, user)
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 404
    return jsonify(result["versions"]), 200


# ── POST /transfers/<id>/versions/<num>/restore ────────────────────────────────
@transfers_bp.post("/<transfer_id>/versions/<int:version_num>/restore")
@csrf_protect
@jwt_required_custom
def restore(transfer_id, version_num):
    user   = current_user()
    result = file_service.restore_version(transfer_id, version_num, user, _ip())
    if not result["ok"]:
        if result["error"] == "FILE_LOCKED":
            return jsonify({"error": "FILE_LOCKED", "lockedBy": result.get("lockedBy")}), 423
        status = 403 if result["error"] == "FORBIDDEN" else 404
        return jsonify({"error": result["error"]}), status
    return jsonify(result["transfer"]), 200


# ── POST /transfers/<id>/lock ──────────────────────────────────────────────────
@transfers_bp.post("/<transfer_id>/lock")
@csrf_protect
@jwt_required_custom
def lock(transfer_id):
    user   = current_user()
    result = file_service.acquire_lock(transfer_id, user, _ip())
    if not result["ok"]:
        return jsonify({"error": result["error"], "lockedBy": result.get("lockedBy")}), 423
    return jsonify({"locked": True}), 200


# ── DELETE /transfers/<id>/lock ────────────────────────────────────────────────
@transfers_bp.delete("/<transfer_id>/lock")
@csrf_protect
@jwt_required_custom
def unlock(transfer_id):
    user   = current_user()
    result = file_service.release_lock(transfer_id, user)
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 403
    return jsonify({"locked": False}), 200


# ── GET /transfers/<id>/acl ───────────────────────────────────────────────────
@transfers_bp.get("/<transfer_id>/acl")
@jwt_required_custom
def list_acl(transfer_id):
    t = db.session.get(Transfer, transfer_id)
    if not t or t.is_deleted:
        return jsonify({"error": "NOT_FOUND"}), 404

    user = current_user()
    from app.services.file_service import has_permission
    if not has_permission(user, t, "share"):
        return jsonify({"error": "FORBIDDEN"}), 403

    return jsonify([entry.to_dict() for entry in t.acl_entries]), 200


# ── POST /transfers/<id>/acl ──────────────────────────────────────────────────
@transfers_bp.post("/<transfer_id>/acl")
@csrf_protect
@jwt_required_custom
def grant_acl(transfer_id):
    t = db.session.get(Transfer, transfer_id)
    if not t or t.is_deleted:
        return jsonify({"error": "NOT_FOUND"}), 404

    user = current_user()
    from app.services.file_service import has_permission
    if not has_permission(user, t, "share"):
        return jsonify({"error": "FORBIDDEN"}), 403

    data = request.json or {}
    apply_to_all = bool(data.get("applyToAll", False))
    
    can_read     = bool(data.get("canRead", False))
    can_write    = bool(data.get("canWrite", False))
    can_delete   = bool(data.get("canDelete", False))
    can_share    = bool(data.get("canShare", False))
    can_download = bool(data.get("canDownload", True))

    if apply_to_all:
        from app.models.group import GroupMember
        members = GroupMember.query.filter_by(group_id=t.group_id).all()
        # skip owner and admins
        targets = [m.user for m in members if m.user_id != t.uploaded_by_id and m.role != 'admin']
        count = 0
        for target in targets:
            existing = next((a for a in t.acl_entries if a.user_id == target.id), None)
            if existing:
                existing.can_read = can_read
                existing.can_write = can_write
                existing.can_delete = can_delete
                existing.can_share = can_share
                existing.can_download = can_download
                existing.granted_by_id = user.id
            else:
                entry = ACLEntry(
                    id=str(uuid.uuid4()),
                    transfer_id=t.id,
                    user_id=target.id,
                    can_read=can_read,
                    can_write=can_write,
                    can_delete=can_delete,
                    can_share=can_share,
                    can_download=can_download,
                    granted_by_id=user.id
                )
                db.session.add(entry)
            count += 1
        
        log = AuditLog(
            id=str(uuid.uuid4()),
            user_id=user.id,
            user_email=user.email,
            action="ACL_GRANTED_BULK",
            resource=t.file_name,
            details=f"Bulk granted to {count} members: R={can_read} W={can_write} D={can_delete} S={can_share} DL={can_download}",
            ip_address=_ip(),
            status="success"
        )
        db.session.add(log)
        db.session.commit()
        return jsonify({"message": f"Applied to {count} members"}), 201

    user_email = data.get("userEmail")

    target = User.query.filter_by(email=user_email).first()
    if not target:
        return jsonify({"error": "USER_NOT_FOUND"}), 404

    if target.id == t.uploaded_by_id:
        return jsonify({"error": "CANNOT_GRANT_TO_SELF"}), 400

    # Enforce group-level external sharing policy
    if t.group_id:
        from app.models.group import Group, GroupMember
        group = db.session.get(Group, t.group_id)
        if group and group.settings and not group.settings.allow_external_sharing:
            # Check if target is a member of the group
            is_member = GroupMember.query.filter_by(
                group_id=t.group_id, user_id=target.id
            ).first()
            if not is_member:
                return jsonify({"error": "EXTERNAL_SHARING_DISABLED"}), 403

    existing = next((a for a in t.acl_entries if a.user_id == target.id), None)


    if existing:
        entry = existing
        entry.can_read     = can_read
        entry.can_write    = can_write
        entry.can_delete   = can_delete
        entry.can_share    = can_share
        entry.can_download = can_download
        entry.granted_by_id = user.id
    else:
        entry = ACLEntry(
            id=str(uuid.uuid4()),
            transfer_id=t.id,
            user_id=target.id,
            can_read=can_read,
            can_write=can_write,
            can_delete=can_delete,
            can_share=can_share,
            can_download=can_download,
            granted_by_id=user.id
        )
        db.session.add(entry)

    log = AuditLog(
        id=str(uuid.uuid4()),
        user_id=user.id,
        user_email=user.email,
        action="ACL_GRANTED",
        resource=t.file_name,
        details=f"Granted to {target.email}: R={can_read} W={can_write} D={can_delete} S={can_share} DL={can_download}",
        ip_address=_ip(),
        status="success"
    )
    db.session.add(log)
    db.session.commit()

    return jsonify(entry.to_dict()), 201


# ── DELETE /transfers/<id>/acl/<user_id> ──────────────────────────────────────
@transfers_bp.delete("/<transfer_id>/acl/<user_id>")
@csrf_protect
@jwt_required_custom
def revoke_acl(transfer_id, user_id):
    t = db.session.get(Transfer, transfer_id)
    if not t or t.is_deleted:
        return jsonify({"error": "NOT_FOUND"}), 404

    user = current_user()
    from app.services.file_service import has_permission
    if not has_permission(user, t, "share"):
        return jsonify({"error": "FORBIDDEN"}), 403

    entry = next((a for a in t.acl_entries if a.user_id == user_id), None)
    if not entry:
        return jsonify({"error": "ACL_NOT_FOUND"}), 404

    db.session.delete(entry)

    log = AuditLog(
        id=str(uuid.uuid4()),
        user_id=user.id,
        user_email=user.email,
        action="ACL_REVOKED",
        resource=t.file_name,
        details=f"Access revoked for user {user_id}",
        ip_address=_ip(),
        status="success"
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({"revoked": True}), 200


# ── POST /transfers/<id>/resend ───────────────────────────────────────────────
@transfers_bp.post("/<transfer_id>/resend")
@csrf_protect
@jwt_required_custom
@limiter.limit("5 per minute")
def resend_transfer(transfer_id):
    from datetime import datetime, timezone
    user = current_user()

    t = db.session.get(Transfer, transfer_id)
    if not t or t.is_deleted:
        return jsonify({"error": "NOT_FOUND"}), 404

    if user.role != "admin" and t.uploaded_by_id != user.id:
        return jsonify({"error": "FORBIDDEN"}), 403

    t.sent_at = datetime.now(timezone.utc)
    t.status = "Delivered" if t.recipient_email else "Pending"
    db.session.commit()

    return jsonify(t.to_dict()), 200


# ── POST /transfers/<id>/revoke ───────────────────────────────────────────────
@transfers_bp.post("/<transfer_id>/revoke")
@csrf_protect
@jwt_required_custom
@limiter.limit("10 per minute")
def revoke_transfer(transfer_id):
    from datetime import datetime, timezone
    user = current_user()

    t = db.session.get(Transfer, transfer_id)
    if not t or t.is_deleted:
        return jsonify({"error": "NOT_FOUND"}), 404

    if user.role != "admin" and t.uploaded_by_id != user.id:
        return jsonify({"error": "FORBIDDEN"}), 403

    t.revoked_at = datetime.now(timezone.utc)
    t.status = "Expired"
    db.session.commit()

    return jsonify(t.to_dict()), 200
