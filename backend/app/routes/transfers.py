from flask import Blueprint, request, jsonify, send_file, current_app
from app.services import file_service
from app.middleware.auth_middleware import jwt_required_custom, current_user

transfers_bp = Blueprint("transfers", __name__, url_prefix="/transfers")


def _ip():
    return request.headers.get("X-Forwarded-For", request.remote_addr)


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
@jwt_required_custom
def upload():
    user = current_user()

    if "file" not in request.files:
        return jsonify({"error": "NO_FILE"}), 400

    file            = request.files["file"]
    recipient_email = request.form.get("recipientEmail", "")
    expiry_days     = int(request.form.get("expiryDays", 7))

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
@jwt_required_custom
def lock(transfer_id):
    user   = current_user()
    result = file_service.acquire_lock(transfer_id, user, _ip())
    if not result["ok"]:
        return jsonify({"error": result["error"], "lockedBy": result.get("lockedBy")}), 423
    return jsonify({"locked": True}), 200


# ── DELETE /transfers/<id>/lock ────────────────────────────────────────────────
@transfers_bp.delete("/<transfer_id>/lock")
@jwt_required_custom
def unlock(transfer_id):
    user   = current_user()
    result = file_service.release_lock(transfer_id, user)
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 403
    return jsonify({"locked": False}), 200