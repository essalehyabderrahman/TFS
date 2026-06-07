import logging
import mimetypes
import os
from flask import Blueprint, request, jsonify, send_file, current_app

from app.middleware.auth_middleware import jwt_required_custom, current_user
from app.middleware.csrf_middleware import csrf_protect
from app.extensions import limiter
from app.services import explorer_service

explorer_bp = Blueprint("explorer", __name__, url_prefix="/explorer")
log = logging.getLogger(__name__)


def _ip():
    return request.remote_addr


# ── GET /explorer ──────────────────────────────────────────────────────────────
@explorer_bp.get("")
@jwt_required_custom
@limiter.limit("60 per minute")
def list_items():
    user = current_user()
    raw_parent = request.args.get("parentId", None)
    parent_id = None if (raw_parent is None or raw_parent == "null" or raw_parent == "") else raw_parent
    data = explorer_service.list_items(user, parent_id)
    return jsonify(data), 200


# ── POST /explorer/folders ─────────────────────────────────────────────────────
@explorer_bp.post("/folders")
@csrf_protect
@jwt_required_custom
@limiter.limit("30 per minute")
def create_folder():
    user = current_user()
    body = request.json or {}
    name = body.get("name", "").strip()
    raw_parent = body.get("parentId", None)
    parent_id = None if (raw_parent is None or raw_parent == "null" or raw_parent == "") else raw_parent

    result = explorer_service.create_folder(user, name, parent_id)
    if not result["ok"]:
        status = 409 if result["error"] == "NAME_CONFLICT" else 400
        return jsonify({"error": result["error"]}), status
    return jsonify(result["item"]), 201


# ── POST /explorer/upload ──────────────────────────────────────────────────────
@explorer_bp.post("/upload")
@csrf_protect
@jwt_required_custom
@limiter.limit("20 per minute; 100 per hour")
def upload_file():
    user = current_user()

    log.debug(
        "[upload] content-type=%r  files_keys=%r  form_keys=%r",
        request.content_type,
        list(request.files.keys()),
        list(request.form.keys()),
    )

    if "file" not in request.files:
        log.warning(
            "[upload] NO_FILE — content-type=%r files=%r",
            request.content_type,
            list(request.files.keys()),
        )
        return jsonify({
            "error": "NO_FILE",
            "detail": (
                "The 'file' field was missing from the multipart body. "
                f"Received Content-Type: {request.content_type!r}. "
                "Ensure the request is sent as multipart/form-data without "
                "a manually-set Content-Type header so the browser can "
                "generate the correct boundary."
            ),
        }), 400

    file = request.files["file"]
    if not file or not file.filename:
        return jsonify({"error": "NO_FILE"}), 400

    raw_parent = request.form.get("parentId", None)
    parent_id = None if (raw_parent is None or raw_parent == "null" or raw_parent == "") else raw_parent
    encrypt_flag = request.form.get("encrypt", "true").lower() == "true"

    log.debug(
        "[upload] user=%s  filename=%r  parent_id=%r  encrypt=%s",
        user.id, file.filename, parent_id, encrypt_flag,
    )

    result = explorer_service.upload_file(
        user=user,
        file=file,
        parent_id=parent_id,
        upload_folder=current_app.config["UPLOAD_FOLDER"],
        allowed_ext=current_app.config["ALLOWED_EXTENSIONS"],
        is_encrypted=encrypt_flag,
    )
    if not result["ok"]:
        log.warning("[upload] service error: %s", result["error"])
        return jsonify({"error": result["error"]}), 400

    log.info("[upload] success: item_id=%s  filename=%r", result["item"]["id"], result["item"]["name"])
    return jsonify(result["item"]), 201


# ── PATCH /explorer/<id>/rename ────────────────────────────────────────────────
@explorer_bp.patch("/<item_id>/rename")
@csrf_protect
@jwt_required_custom
@limiter.limit("30 per minute")
def rename_item(item_id):
    user = current_user()
    body = request.json or {}
    new_name = body.get("name", "").strip()

    result = explorer_service.rename_item(user, item_id, new_name)
    if not result["ok"]:
        error = result["error"]
        if error == "NOT_FOUND":
            return jsonify({"error": error}), 404
        if error == "FORBIDDEN":
            return jsonify({"error": error}), 403
        if error == "NAME_CONFLICT":
            return jsonify({"error": error}), 409
        return jsonify({"error": error}), 400
    return jsonify(result["item"]), 200


# ── PATCH /explorer/<id>/move ──────────────────────────────────────────────────
@explorer_bp.patch("/<item_id>/move")
@csrf_protect
@jwt_required_custom
@limiter.limit("30 per minute")
def move_item(item_id):
    user = current_user()
    body = request.json or {}
    raw_target = body.get("targetParentId", None)
    target_parent_id = None if (raw_target is None or raw_target == "null" or raw_target == "") else raw_target

    result = explorer_service.move_item(user, item_id, target_parent_id)
    if not result["ok"]:
        error = result["error"]
        if error == "NOT_FOUND":
            return jsonify({"error": error}), 404
        if error in ("FORBIDDEN", "CIRCULAR_MOVE"):
            return jsonify({"error": error}), 403
        if error == "NAME_CONFLICT":
            return jsonify({"error": error}), 409
        return jsonify({"error": error}), 400
    return jsonify(result["item"]), 200


# ── DELETE /explorer/<id> ──────────────────────────────────────────────────────
@explorer_bp.delete("/<item_id>")
@csrf_protect
@jwt_required_custom
@limiter.limit("30 per minute")
def delete_item(item_id):
    user = current_user()
    result = explorer_service.delete_item(user, item_id)
    if not result["ok"]:
        error = result["error"]
        if error == "NOT_FOUND":
            return jsonify({"error": error}), 404
        if error == "FORBIDDEN":
            return jsonify({"error": error}), 403
        return jsonify({"error": error}), 400
    return jsonify({"deleted": True, "count": result["deleted"]}), 200

# ── GET /explorer/trash ────────────────────────────────────────────────────────
@explorer_bp.get("/trash")
@jwt_required_custom
def list_trash():
    user = current_user()
    data = explorer_service.list_trash(user)
    return jsonify(data), 200

# ── POST /explorer/<id>/restore ────────────────────────────────────────────────
@explorer_bp.post("/<item_id>/restore")
@csrf_protect
@jwt_required_custom
def restore_item(item_id):
    user = current_user()
    result = explorer_service.restore_item(user, item_id)
    if not result["ok"]:
        error = result["error"]
        status = 403 if error == "FORBIDDEN" else 404
        return jsonify({"error": error}), status
    return jsonify({"restored": True, "count": result["restored"]}), 200

# ── DELETE /explorer/<id>/permanent ────────────────────────────────────────────
@explorer_bp.delete("/<item_id>/permanent")
@csrf_protect
@jwt_required_custom
def permanent_delete_item(item_id):
    user = current_user()
    result = explorer_service.permanently_delete_item(user, item_id)
    if not result["ok"]:
        error = result["error"]
        status = 403 if error == "FORBIDDEN" else 404
        return jsonify({"error": error}), status
    return jsonify({"deleted": True}), 200


# ── GET /explorer/<id>/download ────────────────────────────────────────────────
@explorer_bp.get("/<item_id>/download")
@jwt_required_custom
@limiter.limit("30 per minute")
def download_file(item_id):
    user = current_user()
    result = explorer_service.download_file(user, item_id)
    if not result["ok"]:
        error = result["error"]
        if error == "NOT_FOUND":
            return jsonify({"error": error}), 404
        if error == "FORBIDDEN":
            return jsonify({"error": error}), 403
        return jsonify({"error": error}), 400

    return send_file(
        result["stream"],
        download_name=result["filename"],
        as_attachment=True,
        mimetype="application/octet-stream",
    )


# ── GET /explorer/<id>/preview ─────────────────────────────────────────────────
@explorer_bp.get("/<item_id>/preview")
@jwt_required_custom
@limiter.limit("30 per minute")
def preview_file(item_id):
    """
    Decrypt and stream a personal-storage file with inline Content-Disposition
    so the browser can render it without saving.
    """
    user   = current_user()
    result = explorer_service.download_file(user, item_id)

    if not result["ok"]:
        error  = result["error"]
        if error == "NOT_FOUND":
            return jsonify({"error": error}), 404
        if error == "FORBIDDEN":
            return jsonify({"error": error}), 403
        return jsonify({"error": error}), 400

    mime, _ = mimetypes.guess_type(result["filename"])
    if not mime:
        mime = "application/octet-stream"

    return send_file(
        result["stream"],
        mimetype=mime,
        as_attachment=False,
        download_name=result["filename"],
    )


# ── GET /explorer/<id>/thumbnail ──────────────────────────────────────────────
@explorer_bp.get("/<item_id>/thumbnail")
@jwt_required_custom
@limiter.limit("60 per minute")
def thumbnail(item_id):
    from app.models.user_file import UserFile
    from app.extensions import db as _db
    user = current_user()
    item = _db.session.get(UserFile, item_id)
    if not item or item.is_deleted:
        return jsonify({"error": "NOT_FOUND"}), 404
    if item.owner_id != user.id:
        return jsonify({"error": "FORBIDDEN"}), 403
    if not item.thumbnail_path or not os.path.exists(item.thumbnail_path):
        return jsonify({"error": "NO_THUMBNAIL"}), 404
    return send_file(item.thumbnail_path, mimetype="image/webp")

# ── PUT /explorer/<id>/content ─────────────────────────────────────────────────
@explorer_bp.put("/<item_id>/content")
@csrf_protect
@jwt_required_custom
@limiter.limit("30 per minute")
def update_file_content(item_id):
    """
    Overwrite a text file's content in place without re-uploading.
    Personal Storage files are single-owner — no pessimistic lock required.
    Encryption is transparently preserved (re-encrypted if the file was encrypted).
    """
    user = current_user()
    body = request.get_json(silent=True) or {}
    content = body.get("content", "")

    result = explorer_service.update_file_content(user, item_id, content)
    if not result["ok"]:
        error = result["error"]
        if error == "NOT_FOUND":
            return jsonify({"error": error}), 404
        if error == "FORBIDDEN":
            return jsonify({"error": error}), 403
        return jsonify({"error": error}), 400

    return jsonify(result["item"]), 200
