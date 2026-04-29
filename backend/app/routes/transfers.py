from flask import Blueprint, request, jsonify, send_file, current_app
from app.services import file_service
from app.middleware.auth_middleware import jwt_required_custom, current_user
from app.middleware.csrf_middleware import csrf_protect
from app.models.audit_log import AuditLog, ACLEntry
from app.models.user import User
from app.models.transfer import Transfer
from app.extensions import db
import uuid

transfers_bp = Blueprint("transfers", __name__, url_prefix="/transfers")


def _ip():
    return request.remote_addr


# ── GET /transfers ─────────────────────────────────────────────────────────────
@transfers_bp.get("")
@jwt_required_custom
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
    # [Security] 0 = never expires (no clamp). Otherwise clamp to 1–365 days.
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
    )

    if not result["ok"]:
        return jsonify({"error": result["error"]}), 400

    return jsonify(result["transfer"]), 201


# ── GET /transfers/<id>/download ───────────────────────────────────────────────
@transfers_bp.get("/<transfer_id>/download")
@jwt_required_custom
def download(transfer_id):
    user   = current_user()
    result = file_service.get_transfer_file(transfer_id, user, _ip())

    if not result["ok"]:
        status = 403 if result["error"] == "FORBIDDEN" else 404
        return jsonify({"error": result["error"]}), status

    return send_file(
        result["stream"],
        download_name=result["filename"],
        as_attachment=True,
        mimetype="application/octet-stream",
    )



# ── DELETE /transfers/<id> ─────────────────────────────────────────────────────
@transfers_bp.delete("/<transfer_id>")
@csrf_protect
@jwt_required_custom
def delete(transfer_id):
    user   = current_user()
    result = file_service.delete_transfer(transfer_id, user, _ip())
    if not result["ok"]:
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
    if user.role != "admin" and t.uploaded_by_id != user.id:
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
    if user.role != "admin" and t.uploaded_by_id != user.id:
        return jsonify({"error": "FORBIDDEN"}), 403
        
    data = request.json or {}
    user_email = data.get("userEmail")
    
    target = User.query.filter_by(email=user_email).first()
    if not target:
        return jsonify({"error": "USER_NOT_FOUND"}), 404
        
    if target.id == t.uploaded_by_id:
        return jsonify({"error": "CANNOT_GRANT_TO_SELF"}), 400
        
    existing = next((a for a in t.acl_entries if a.user_id == target.id), None)
    
    can_read = bool(data.get("canRead", False))
    can_write = bool(data.get("canWrite", False))
    can_delete = bool(data.get("canDelete", False))
    can_share = bool(data.get("canShare", False))
    
    if existing:
        entry = existing
        entry.can_read = can_read
        entry.can_write = can_write
        entry.can_delete = can_delete
        entry.can_share = can_share
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
            granted_by_id=user.id
        )
        db.session.add(entry)
        
    log = AuditLog(
        id=str(uuid.uuid4()),
        user_id=user.id,
        user_email=user.email,
        action="ACL_GRANTED",
        resource=t.file_name,
        details=f"Granted to {target.email}: R={can_read} W={can_write} D={can_delete} S={can_share}",
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
    if user.role != "admin" and t.uploaded_by_id != user.id:
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