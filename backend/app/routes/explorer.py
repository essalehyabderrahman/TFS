from flask import Blueprint, request, jsonify, send_file, current_app

from app.middleware.auth_middleware import jwt_required_custom, current_user
from app.middleware.csrf_middleware import csrf_protect
from app.extensions import limiter
from app.services import explorer_service

explorer_bp = Blueprint("explorer", __name__, url_prefix="/explorer")


def _ip():
    return request.remote_addr


# ── GET /explorer ──────────────────────────────────────────────────────────────
# Returns the items at a given folder level.
# Query param: parentId (omit or send "null" for root level)
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
# Creates a new folder.
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
# Uploads and encrypts a file into the user's personal storage.
@explorer_bp.post("/upload")
@csrf_protect
@jwt_required_custom
@limiter.limit("20 per minute; 100 per hour")
def upload_file():
    user = current_user()

    if "file" not in request.files:
        return jsonify({"error": "NO_FILE"}), 400

    file = request.files["file"]
    raw_parent = request.form.get("parentId", None)
    parent_id = None if (raw_parent is None or raw_parent == "null" or raw_parent == "") else raw_parent
    encrypt_flag = request.form.get("encrypt", "true").lower() == "true"

    result = explorer_service.upload_file(
        user=user,
        file=file,
        parent_id=parent_id,
        upload_folder=current_app.config["UPLOAD_FOLDER"],
        allowed_ext=current_app.config["ALLOWED_EXTENSIONS"],
        is_encrypted=encrypt_flag,
    )
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 400
    return jsonify(result["item"]), 201


# ── PATCH /explorer/<id>/rename ────────────────────────────────────────────────
# Renames a file or folder.
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
# Moves a file or folder to a new parent.
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
# Soft-deletes a file or folder (recursive for folders).
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


# ── GET /explorer/<id>/download ────────────────────────────────────────────────
# Decrypts and streams a file back to the client.
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
