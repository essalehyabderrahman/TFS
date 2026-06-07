"""
explorer_service.py
──────────────────────────────────────────────────────────────────────────────
Business logic for the personal File Manager (File Explorer).

Reuses the AES-256-GCM encryption helpers from file_service to keep
a single source of truth for crypto.
"""
import uuid
import os
import io
import zipfile

from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename
from flask import current_app

from app.extensions import db
from app.models.user_file import UserFile
from app.models.user import User

# Re-use encryption helpers from the existing file service
from app.services.file_service import (
    _encrypt_file, _decrypt_file, _file_type, _category_subdir,
    _compute_hash, _find_existing_path, _is_path_shared,
)


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _allowed(filename: str, allowed: set) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed


def _is_descendant(candidate_id: str, ancestor_id: str) -> bool:
    """
    Returns True if ancestor_id is an ancestor (or equal) of candidate_id.
    Used to prevent moving a folder into one of its own descendants.
    """
    if candidate_id == ancestor_id:
        return True
    item = db.session.get(UserFile, candidate_id)
    if not item or item.parent_id is None:
        return False
    return _is_descendant(item.parent_id, ancestor_id)


def _collect_descendant_ids(folder_id: str) -> list[str]:
    """Recursively collect all descendant IDs of a folder (inclusive)."""
    ids = [folder_id]
    children = UserFile.query.filter_by(parent_id=folder_id, is_deleted=False).all()
    for child in children:
        if child.item_type == "folder":
            ids.extend(_collect_descendant_ids(child.id))
        else:
            ids.append(child.id)
    return ids


# ──────────────────────────────────────────────────────────────────────────────
# List
# ──────────────────────────────────────────────────────────────────────────────

def list_items(user: User, parent_id: str | None) -> list[dict]:
    """Return all non-deleted items at a given level for the current user."""
    items = UserFile.query.filter_by(
        owner_id=user.id,
        parent_id=parent_id,
        is_deleted=False,
    ).order_by(UserFile.item_type.desc(), UserFile.name).all()
    return [i.to_dict() for i in items]


# ──────────────────────────────────────────────────────────────────────────────
# Create Folder
# ──────────────────────────────────────────────────────────────────────────────

def create_folder(user: User, name: str, parent_id: str | None) -> dict:
    name = name.strip()
    if not name:
        return {"ok": False, "error": "MISSING_NAME"}

    if parent_id is not None:
        parent = db.session.get(UserFile, parent_id)
        if not parent or parent.owner_id != user.id or parent.is_deleted:
            return {"ok": False, "error": "PARENT_NOT_FOUND"}
        if parent.item_type != "folder":
            return {"ok": False, "error": "PARENT_NOT_A_FOLDER"}

    exists = UserFile.query.filter_by(
        owner_id=user.id,
        parent_id=parent_id,
        item_type="folder",
        is_deleted=False,
    ).filter(db.func.lower(UserFile.name) == name.lower()).first()
    if exists:
        return {"ok": False, "error": "NAME_CONFLICT"}

    folder = UserFile(
        id=str(uuid.uuid4()),
        owner_id=user.id,
        parent_id=parent_id,
        item_type="folder",
        name=name,
    )
    db.session.add(folder)
    db.session.commit()
    return {"ok": True, "item": folder.to_dict()}


# ──────────────────────────────────────────────────────────────────────────────
# Upload File
# ──────────────────────────────────────────────────────────────────────────────

def upload_file(user: User, file: FileStorage, parent_id: str | None,
                upload_folder: str, allowed_ext: set, is_encrypted: bool = True) -> dict:
    if not file or not file.filename:
        return {"ok": False, "error": "NO_FILE"}

    if not _allowed(file.filename, allowed_ext):
        return {"ok": False, "error": "FILE_TYPE_NOT_ALLOWED"}

    if parent_id is not None:
        parent = db.session.get(UserFile, parent_id)
        if not parent or parent.owner_id != user.id or parent.is_deleted:
            return {"ok": False, "error": "PARENT_NOT_FOUND"}

    safe_name  = secure_filename(file.filename)
    stored_id  = str(uuid.uuid4())
    raw_data   = file.read()
    size_bytes = len(raw_data)

    content_hash  = _compute_hash(raw_data)
    existing_path = _find_existing_path(content_hash, is_encrypted)

    if existing_path:
        stored_path = existing_path
    else:
        ext      = ".enc" if is_encrypted else ""
        _cat_dir = os.path.join(upload_folder, _category_subdir(_file_type(safe_name)))
        os.makedirs(_cat_dir, exist_ok=True)
        stored_path = os.path.join(_cat_dir, f"uf_{stored_id}_{safe_name}{ext}")

        data_to_write = _encrypt_file(raw_data) if is_encrypted else raw_data
        with open(stored_path, "wb") as fp:
            fp.write(data_to_write)

    user_file = UserFile(
        id=stored_id,
        owner_id=user.id,
        parent_id=parent_id,
        item_type="file",
        name=safe_name,
        stored_path=stored_path,
        size_bytes=size_bytes,
        file_kind=_file_type(safe_name),
        is_encrypted=is_encrypted,
        content_hash=content_hash,
    )
    db.session.add(user_file)
    db.session.commit()
    return {"ok": True, "item": user_file.to_dict()}


# ──────────────────────────────────────────────────────────────────────────────
# Rename
# ──────────────────────────────────────────────────────────────────────────────

def rename_item(user: User, item_id: str, new_name: str) -> dict:
    new_name = new_name.strip()
    if not new_name:
        return {"ok": False, "error": "MISSING_NAME"}

    item = db.session.get(UserFile, item_id)
    if not item or item.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}
    if item.owner_id != user.id:
        return {"ok": False, "error": "FORBIDDEN"}

    conflict = UserFile.query.filter_by(
        owner_id=user.id,
        parent_id=item.parent_id,
        item_type=item.item_type,
        is_deleted=False,
    ).filter(
        db.func.lower(UserFile.name) == new_name.lower(),
        UserFile.id != item_id,
    ).first()
    if conflict:
        return {"ok": False, "error": "NAME_CONFLICT"}

    item.name = new_name
    db.session.commit()
    return {"ok": True, "item": item.to_dict()}


# ──────────────────────────────────────────────────────────────────────────────
# Move
# ──────────────────────────────────────────────────────────────────────────────

def move_item(user: User, item_id: str, target_parent_id: str | None) -> dict:
    item = db.session.get(UserFile, item_id)
    if not item or item.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}
    if item.owner_id != user.id:
        return {"ok": False, "error": "FORBIDDEN"}

    if item.parent_id == target_parent_id:
        return {"ok": True, "item": item.to_dict()}

    if item.item_type == "folder" and target_parent_id is not None:
        if _is_descendant(target_parent_id, item_id):
            return {"ok": False, "error": "CIRCULAR_MOVE"}

    if target_parent_id is not None:
        target = db.session.get(UserFile, target_parent_id)
        if not target or target.owner_id != user.id or target.is_deleted:
            return {"ok": False, "error": "TARGET_NOT_FOUND"}
        if target.item_type != "folder":
            return {"ok": False, "error": "TARGET_NOT_A_FOLDER"}

    conflict = UserFile.query.filter_by(
        owner_id=user.id,
        parent_id=target_parent_id,
        item_type=item.item_type,
        is_deleted=False,
    ).filter(
        db.func.lower(UserFile.name) == item.name.lower(),
        UserFile.id != item_id,
    ).first()
    if conflict:
        return {"ok": False, "error": "NAME_CONFLICT"}

    item.parent_id = target_parent_id
    db.session.commit()
    return {"ok": True, "item": item.to_dict()}


# ──────────────────────────────────────────────────────────────────────────────
# Delete  (recursive soft-delete)
# ──────────────────────────────────────────────────────────────────────────────

def delete_item(user: User, item_id: str) -> dict:
    item = db.session.get(UserFile, item_id)
    if not item or item.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}
    if item.owner_id != user.id:
        return {"ok": False, "error": "FORBIDDEN"}

    ids_to_delete = _collect_descendant_ids(item_id) if item.item_type == "folder" else [item_id]

    UserFile.query.filter(
        UserFile.id.in_(ids_to_delete)
    ).update({"is_deleted": True}, synchronize_session="fetch")

    db.session.commit()
    return {"ok": True, "deleted": len(ids_to_delete)}

def list_trash(user: User) -> list[dict]:
    items = UserFile.query.filter_by(
        owner_id=user.id,
        is_deleted=True,
    ).order_by(UserFile.updated_at.desc()).all()
    return [i.to_dict() for i in items]

def restore_item(user: User, item_id: str) -> dict:
    item = db.session.get(UserFile, item_id)
    if not item or not item.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}
    if item.owner_id != user.id:
        return {"ok": False, "error": "FORBIDDEN"}

    ids_to_restore = _collect_deleted_descendants(item_id) if item.item_type == "folder" else [item_id]

    UserFile.query.filter(
        UserFile.id.in_(ids_to_restore)
    ).update({"is_deleted": False}, synchronize_session="fetch")

    db.session.commit()
    return {"ok": True, "restored": len(ids_to_restore)}

def _collect_deleted_descendants(folder_id: str) -> list[str]:
    ids = [folder_id]
    children = UserFile.query.filter_by(parent_id=folder_id, is_deleted=True).all()
    for child in children:
        if child.item_type == "folder":
            ids.extend(_collect_deleted_descendants(child.id))
        else:
            ids.append(child.id)
    return ids

def permanently_delete_item(user: User, item_id: str) -> dict:
    item = db.session.get(UserFile, item_id)
    if not item or not item.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}
    if item.owner_id != user.id:
        return {"ok": False, "error": "FORBIDDEN"}

    # Gather paths
    paths_to_delete = []
    
    def gather_paths(it):
        if it.stored_path:
            paths_to_delete.append(it.stored_path)
        if it.item_type == "folder":
            children = UserFile.query.filter_by(parent_id=it.id).all()
            for child in children:
                gather_paths(child)

    gather_paths(item)

    # Include thumbnail (per-record, never shared)
    if item.thumbnail_path and os.path.exists(item.thumbnail_path):
        paths_to_delete.append(item.thumbnail_path)

    for path in paths_to_delete:
        if path and os.path.exists(path) and not _is_path_shared(path):
            try:
                os.remove(path)
            except Exception:
                pass

    db.session.delete(item)
    db.session.commit()
    return {"ok": True}




# ──────────────────────────────────────────────────────────────────────────────
# Download  (decrypt → stream)
# ──────────────────────────────────────────────────────────────────────────────

def download_file(user: User, item_id: str) -> dict:
    item = db.session.get(UserFile, item_id)
    if not item or item.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}
    if item.owner_id != user.id:
        return {"ok": False, "error": "FORBIDDEN"}

    if item.item_type == "folder":
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            def add_folder_to_zip(folder: UserFile, current_path: str):
                children = UserFile.query.filter_by(parent_id=folder.id, is_deleted=False).all()
                for child in children:
                    child_path = os.path.join(current_path, child.name) if current_path else child.name
                    if child.item_type == "folder":
                        add_folder_to_zip(child, child_path)
                    else:
                        if child.stored_path and os.path.exists(child.stored_path):
                            try:
                                with open(child.stored_path, "rb") as fp:
                                    file_data = fp.read()
                                if getattr(child, "is_encrypted", True):
                                    file_data = _decrypt_file(file_data)
                                zip_file.writestr(child_path, file_data)
                            except Exception:
                                pass
            add_folder_to_zip(item, "")
        
        zip_buffer.seek(0)
        return {
            "ok": True,
            "stream": zip_buffer,
            "filename": f"{item.name}.zip",
        }

    if not item.stored_path or not os.path.exists(item.stored_path):
        return {"ok": False, "error": "FILE_MISSING_ON_DISK"}

    with open(item.stored_path, "rb") as fp:
        file_data = fp.read()

    if getattr(item, "is_encrypted", True):
        try:
            raw = _decrypt_file(file_data)
        except Exception:
            return {"ok": False, "error": "DECRYPTION_FAILED"}
    else:
        raw = file_data

    return {
        "ok": True,
        "stream": io.BytesIO(raw),
        "filename": item.name,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Inline Text Edit  (Personal Storage — no lock, single-owner)
# ──────────────────────────────────────────────────────────────────────────────

def update_file_content(user: User, item_id: str, new_text: str) -> dict:
    """
    Overwrite a personal-storage text file's content directly.

    Personal Storage files are single-owner so no pessimistic lock is needed.
    Encryption is preserved: if is_encrypted=True the new bytes are re-encrypted
    with _encrypt_file() before being written to disk.
    size_bytes is updated to reflect the new UTF-8 byte length.
    """
    item = db.session.get(UserFile, item_id)
    if not item or item.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}
    if item.owner_id != user.id:
        return {"ok": False, "error": "FORBIDDEN"}
    if item.item_type != "file":
        return {"ok": False, "error": "NOT_A_FILE"}
    if not item.stored_path or not os.path.exists(item.stored_path):
        return {"ok": False, "error": "FILE_MISSING_ON_DISK"}

    raw_bytes     = new_text.encode("utf-8")
    data_to_write = _encrypt_file(raw_bytes) if getattr(item, "is_encrypted", False) else raw_bytes

    with open(item.stored_path, "wb") as fp:
        fp.write(data_to_write)

    item.size_bytes = len(raw_bytes)
    db.session.commit()
    return {"ok": True, "item": item.to_dict()}
