import uuid
import os
import io
import base64
import zipfile
from datetime import datetime, timezone, timedelta
import struct
import hashlib
from sqlalchemy import update
from werkzeug.utils import secure_filename
from werkzeug.datastructures import FileStorage

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend

from flask import current_app

from app.extensions import db
from app.models.transfer import Transfer, FileVersion
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.group import GroupMember
from app.models.audit_log import ACLEntry

LOCK_TIMEOUT_MINUTES = 15

def has_permission(user: "User", transfer: "Transfer", permission_type: str) -> bool:
    """
    Vérifie si user a la permission demandée sur transfer.
    permission_type: 'read' | 'write' | 'delete' | 'share' | 'download'
    """
    # Admin global → tout autorisé
    if user.role == "admin":
        return True

    # Admin de l'espace → tout autorisé
    if transfer.group_id:
        member = GroupMember.query.filter_by(
            group_id=transfer.group_id, user_id=user.id
        ).first()
        if member and member.role == "admin":
            return True

    # Propriétaire → tout autorisé
    if transfer.uploaded_by_id == user.id:
        return True

    # Destinataire → lecture autorisée (pour preview/download des fichiers reçus)
    if transfer.recipient_email and transfer.recipient_email == user.email:
        if permission_type == "read":
            return True

    # Vérification ACL — chercher une entrée explicite pour cet utilisateur
    flag_map = {
        "read":     "can_read",
        "write":    "can_write",
        "delete":   "can_delete",
        "share":    "can_share",
        "download": "can_download",
    }
    flag = flag_map.get(permission_type, "can_read")

    acl_entry = next((a for a in transfer.acl_entries if a.user_id == user.id), None)

    if acl_entry:
        # Entrée ACL explicite pour cet utilisateur → respecter ses flags
        if not getattr(acl_entry, flag):
            # Write implies read — you need to see content to edit it
            if permission_type == "read" and acl_entry.can_write:
                pass  # allow read when user has write
            else:
                return False
    else:
        # Pas d'entrée ACL pour cet utilisateur spécifiquement
        if transfer.group_id:
            # Fichier de groupe → vérifier que l'utilisateur est membre du groupe
            is_member = GroupMember.query.filter_by(
                group_id=transfer.group_id, user_id=user.id
            ).first()
            if not is_member:
                return False
            # Membres du groupe : lecture et download autorisés par défaut, écriture/suppression refusées
            if permission_type not in ("read", "download"):
                return False
        else:
            # Fichier personnel sans ACL explicite → refus
            return False

    # Pour la lecture : vérification récursive des dossiers parents
    if permission_type == "read" and transfer.parent_id:
        parent = db.session.get(Transfer, transfer.parent_id)
        if parent and not has_permission(user, parent, "read"):
            return False

    return True




# ──────────────────────────────────────────────────────────────────────────────
# Encryption helpers (AES-256-GCM)
# ──────────────────────────────────────────────────────────────────────────────

CURRENT_KEY_VERSION = 1

def _get_aes_key(key_version: int = CURRENT_KEY_VERSION) -> bytes:
    raw_key = current_app.config.get("ENCRYPTION_KEY", "")
    versioned_input = f"v{key_version}:{raw_key}"
    return hashlib.sha256(versioned_input.encode()).digest()


def _encrypt_file(data: bytes) -> bytes:
    version = CURRENT_KEY_VERSION
    key = _get_aes_key(version)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, data, None)
    return struct.pack("<H", version) + nonce + ciphertext


def _decrypt_file(data: bytes) -> bytes:
    if len(data) < 15:
        raise ValueError("Invalid encrypted data: too short")
    version = struct.unpack("<H", data[:2])[0]
    key = _get_aes_key(version)
    nonce = data[2:14]
    ciphertext = data[14:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None)


# ──────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ──────────────────────────────────────────────────────────────────────────────

def _allowed(filename: str, allowed: set) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed


# [Security] Malicious file detection — cahier des charges §6.l.ii
# Blocks executables/scripts even if renamed to a safe extension (e.g. .pdf)
_DANGEROUS_MAGIC_BYTES = [
    (b"MZ",              "PE executable (Windows .exe/.dll)"),
    (b"\x7fELF",         "ELF binary (Linux executable)"),
    (b"\xfe\xed\xfa",    "Mach-O binary (macOS executable)"),
    (b"\xcf\xfa\xed\xfe","Mach-O 64-bit binary"),
    (b"#!/",             "Shell/script file"),
    (b"#!\\",            "Windows script"),
]

def _validate_file_content(data: bytes) -> str | None:
    """
    Inspects the first bytes of a file for known executable signatures.
    Returns an error message if dangerous content is detected, None if safe.
    """
    if len(data) < 4:
        return None
    header = data[:8]
    for magic, desc in _DANGEROUS_MAGIC_BYTES:
        if header.startswith(magic):
            return f"Blocked: file content matches {desc}"
    return None


def _file_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mapping = {
        "pdf": "pdf",
        "png": "img", "jpg": "img", "jpeg": "img", "gif": "img", "webp": "img",
        "zip": "zip", "tar": "zip", "gz": "zip", "rar": "zip",
        "mp4": "video", "mov": "video", "avi": "video", "mkv": "video",
        "doc": "doc", "docx": "doc", "txt": "doc", "csv": "doc",
    }
    return mapping.get(ext, "other")


def _log(action, user_email, user_id, status, ip, resource="", details="", group_id=None):
    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        user_email=user_email,
        action=action,
        resource=resource,
        ip_address=ip,
        status=status,
        details=details,
        group_id=group_id,
    ))


def _is_lock_active(t: Transfer) -> bool:
    """Returns True if the transfer's pessimistic lock is still within its timeout window."""
    if not t.locked_by_id or not t.locked_at:
        return False
    locked_at_utc = t.locked_at if t.locked_at.tzinfo else t.locked_at.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - locked_at_utc).total_seconds() / 60
    return elapsed <= LOCK_TIMEOUT_MINUTES


def _locked_by_other(t: Transfer, user: User) -> dict | None:
    """If file is actively locked by someone other than `user`, return the lock-error dict."""
    if t.locked_by_id and t.locked_by_id != user.id and _is_lock_active(t):
        locked_by = db.session.get(User, t.locked_by_id)
        return {"ok": False, "error": "FILE_LOCKED",
                "lockedBy": locked_by.email if locked_by else "unknown"}
    return None


def _is_inside_folder(target_id: str, folder_id: str) -> bool:
    """Returns True if target_id is a descendant of folder_id (circular-move guard)."""
    visited: set = set()
    current_id: str | None = target_id
    while current_id:
        if current_id in visited:
            break
        if current_id == folder_id:
            return True
        visited.add(current_id)
        t = db.session.get(Transfer, current_id)
        if not t:
            break
        current_id = t.parent_id
    return False


# ──────────────────────────────────────────────────────────────────────────────
# Upload  (encrypt → save)
# ──────────────────────────────────────────────────────────────────────────────

def upload_file(file: FileStorage, uploader_id: str, recipient_email: str,
                expiry_days: int, upload_folder: str, allowed_ext: set, ip: str,
                group_id: str = None, encrypt: bool = True,
                parent_id: str = None) -> dict:
    uploader = db.session.get(User, uploader_id)
    if not uploader:
        return {"ok": False, "error": "USER_NOT_FOUND"}

    if not _allowed(file.filename, allowed_ext):
        return {"ok": False, "error": "FILE_TYPE_NOT_ALLOWED"}

    safe_name   = secure_filename(file.filename)
    stored_id   = str(uuid.uuid4())

    os.makedirs(upload_folder, exist_ok=True)

    raw_data   = file.read()
    size_bytes = len(raw_data)

    # [Security] Malicious file content check (cahier des charges §6.l.ii)
    malware_check = _validate_file_content(raw_data)
    if malware_check:
        _log("UPLOAD_BLOCKED", uploader.email, uploader.id, "failed", ip,
             resource=file.filename, details=malware_check, group_id=group_id)
        return {"ok": False, "error": "MALICIOUS_FILE_BLOCKED", "details": malware_check}

    # ── Quota check (before writing to disk) ─────────────────────────────────
    if group_id:
        # Group upload → check group quota (not user quota)
        from app.services.quota_service import check_group_quota
        from app.models.group import Group
        target_group = db.session.get(Group, group_id)
        if target_group:
            quota_result = check_group_quota(target_group, size_bytes)
        else:
            quota_result = {"ok": True}
    else:
        # Personal upload → check user quota
        from app.services.quota_service import check_quota
        quota_result = check_quota(uploader, size_bytes)
    if not quota_result["ok"]:
        return {"ok": False, "error": quota_result.get("error", "QUOTA_EXCEEDED"), "details": quota_result}

    if encrypt:
        data_to_save = _encrypt_file(raw_data)
        enc_type     = "AES-256-GCM"
        ext_suffix   = ".enc"
    else:
        data_to_save = raw_data
        enc_type     = "None"
        ext_suffix   = ""

    stored_path = os.path.join(upload_folder, f"{stored_id}_{safe_name}{ext_suffix}")

    with open(stored_path, "wb") as f:
        f.write(data_to_save)

    expiry = datetime.now(timezone.utc) + timedelta(days=expiry_days) if expiry_days else None

    transfer = Transfer(
        id=stored_id,
        file_name=safe_name,
        original_name=file.filename,
        file_type=_file_type(safe_name),
        stored_path=stored_path,
        size_bytes=size_bytes,
        is_encrypted=encrypt,
        encryption_type=enc_type,
        recipient_email=recipient_email or None,
        expiry_date=expiry,
        uploaded_by_id=uploader_id,
        group_id=group_id,
        parent_id=parent_id,
        item_type="file",
        status="Delivered" if (recipient_email or group_id) else "Pending",
        current_version=1,
    )
    db.session.add(transfer)

    v = FileVersion(
        id=str(uuid.uuid4()),
        transfer_id=stored_id,
        version_num=1,
        stored_path=stored_path,
        size_bytes=size_bytes,
        author_id=uploader_id,
        description="Initial upload",
    )
    db.session.add(v)

    if recipient_email:
        recipient = User.query.filter_by(email=recipient_email).first()
        if recipient:
            from app.models.notification import Notification
            notif = Notification(
                id=str(uuid.uuid4()),
                user_id=recipient.id,
                title="New file received",
                body=f"{safe_name} from {uploader.name}.",
                type="info"
            )
            db.session.add(notif)

    _log("FILE_UPLOAD", uploader.email, uploader_id, "success", ip,
         resource=safe_name, details=f"{size_bytes} bytes ({'encrypted' if encrypt else 'plain'})",
         group_id=transfer.group_id)

    if recipient_email:
        from app.routes.contacts import _auto_add_contact
        _auto_add_contact(uploader_id, recipient_email, "sent_to")
        recipient = User.query.filter_by(email=recipient_email).first()
        if recipient:
            _auto_add_contact(recipient.id, uploader.email, "received_from")

    db.session.commit()
    return {"ok": True, "transfer": transfer.to_dict()}


# ──────────────────────────────────────────────────────────────────────────────
# List transfers
# ──────────────────────────────────────────────────────────────────────────────

def list_transfers(user: User) -> list:
    if user.role == "admin":
        transfers = Transfer.query.filter(
            Transfer.is_deleted == False,
            Transfer.recipient_email.isnot(None)
        ).order_by(Transfer.created_at.desc()).all()
    else:
        transfers = Transfer.query.filter(
            Transfer.uploaded_by_id == user.id,
            Transfer.is_deleted == False,
            Transfer.recipient_email.isnot(None)
        ).order_by(Transfer.created_at.desc()).all()
    return [t.to_dict() for t in transfers]


def list_received(user: User) -> list:
    transfers = Transfer.query.filter(
        Transfer.recipient_email == user.email,
        Transfer.uploaded_by_id != user.id,
        Transfer.is_deleted == False
    ).order_by(Transfer.created_at.desc()).all()
    return [t.to_dict() for t in transfers]


# ──────────────────────────────────────────────────────────────────────────────
# Download  (read → decrypt → stream)
# ──────────────────────────────────────────────────────────────────────────────

def get_transfer_file(transfer_id: str, user: User, ip: str, context: str = None) -> dict:
    t = db.session.get(Transfer, transfer_id)
    if not t or t.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}

    # For download requests, check 'download' permission; for preview, check 'read'
    perm_type = "download" if context != "preview" else "read"
    if not has_permission(user, t, perm_type):
        _log("UNAUTHORIZED_ACCESS", user.email, user.id, "failed", ip, resource=t.file_name)
        db.session.commit()
        return {"ok": False, "error": "FORBIDDEN"}

    if t.expiry_date:
        expiry_utc = t.expiry_date if t.expiry_date.tzinfo else t.expiry_date.replace(tzinfo=timezone.utc)
        if expiry_utc < datetime.now(timezone.utc):
            t.status = "Expired"
            db.session.commit()
            return {"ok": False, "error": "EXPIRED"}

    if t.item_type == "folder":
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            def add_folder_to_zip(folder: Transfer, current_path: str):
                children = Transfer.query.filter_by(parent_id=folder.id, is_deleted=False).all()
                for child in children:
                    child_path = os.path.join(current_path, child.file_name) if current_path else child.file_name
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
            add_folder_to_zip(t, "")
        
        zip_buffer.seek(0)
        
        db.session.execute(
            update(Transfer).where(Transfer.id == t.id)
            .values(download_count=Transfer.download_count + 1)
        )
        _log("FILE_DOWNLOAD", user.email, user.id, "success", ip, resource=t.file_name, group_id=t.group_id)
        db.session.commit()

        return {
            "ok": True,
            "stream": zip_buffer,
            "filename": f"{t.file_name}.zip",
            "size": zip_buffer.getbuffer().nbytes
        }

    try:
        with open(t.stored_path, "rb") as f:
            file_data = f.read()
        decrypted = _decrypt_file(file_data) if t.is_encrypted else file_data
    except Exception:
        _log("DECRYPT_ERROR", user.email, user.id, "failed", ip, resource=t.file_name, group_id=t.group_id)
        db.session.commit()
        return {"ok": False, "error": "DECRYPT_ERROR"}

    db.session.execute(
        update(Transfer).where(Transfer.id == t.id)
        .values(download_count=Transfer.download_count + 1)
    )
    _log("FILE_DOWNLOAD", user.email, user.id, "success", ip, resource=t.file_name, group_id=t.group_id)
    db.session.commit()

    stream = io.BytesIO(decrypted)
    stream.seek(0)
    return {"ok": True, "stream": stream, "filename": t.original_name, "size": len(decrypted)}


# ──────────────────────────────────────────────────────────────────────────────
# Delete
# ──────────────────────────────────────────────────────────────────────────────

def delete_transfer(transfer_id: str, user: User, ip: str) -> dict:
    t = db.session.get(Transfer, transfer_id)
    if not t or t.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}

    lock_err = _locked_by_other(t, user)
    if lock_err and user.role != "admin":
        return lock_err

    if not has_permission(user, t, "delete"):
        _log("UNAUTHORIZED_ACCESS", user.email, user.id, "failed", ip,
             resource=t.file_name, group_id=t.group_id)
        db.session.commit()
        return {"ok": False, "error": "FORBIDDEN"}

    deleted_paths: set = set()
    paths_to_delete = [t.stored_path] if t.stored_path else []
    for v in t.versions:
        if v.stored_path and v.stored_path not in paths_to_delete:
            paths_to_delete.append(v.stored_path)

    for path in paths_to_delete:
        if path and path not in deleted_paths:
            try:
                os.remove(path)
                deleted_paths.add(path)
            except Exception as e:
                _log("FILE_DELETE_DISK_ERROR", user.email, user.id, "warning", ip,
                     resource=t.file_name, details=str(e))

    t.locked_by_id = None
    t.locked_at    = None
    t.is_deleted   = True
    _log("FILE_DELETE", user.email, user.id, "success", ip, resource=t.file_name, group_id=t.group_id)
    db.session.commit()
    return {"ok": True}


# ──────────────────────────────────────────────────────────────────────────────
# Versioning
# ──────────────────────────────────────────────────────────────────────────────

def get_versions(transfer_id: str, user: User) -> dict:
    t = db.session.get(Transfer, transfer_id)
    if not t or t.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}
    versions = db.session.execute(
        db.select(FileVersion)
        .where(FileVersion.transfer_id == transfer_id)
        .order_by(FileVersion.version_num.desc())
    ).scalars().all()
    return {"ok": True, "versions": [v.to_dict() for v in versions]}


def restore_version(transfer_id: str, version_num: int, user: User, ip: str) -> dict:
    t = db.session.get(Transfer, transfer_id)
    if not t or t.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}

    if not has_permission(user, t, "write"):
        _log("UNAUTHORIZED_ACCESS", user.email, user.id, "failed", ip,
             resource=t.file_name, group_id=t.group_id)
        db.session.commit()
        return {"ok": False, "error": "FORBIDDEN"}

    lock_err = _locked_by_other(t, user)
    if lock_err:
        return lock_err

    target_v = db.session.execute(
        db.select(FileVersion)
        .where(FileVersion.transfer_id == transfer_id,
               FileVersion.version_num == version_num)
    ).scalar_one_or_none()
    if not target_v:
        return {"ok": False, "error": "VERSION_NOT_FOUND"}

    new_num = t.current_version + 1
    new_v = FileVersion(
        id=str(uuid.uuid4()),
        transfer_id=t.id,
        version_num=new_num,
        stored_path=target_v.stored_path,
        size_bytes=target_v.size_bytes,
        author_id=user.id,
        description=f"Restored from v{version_num}",
    )
    t.current_version = new_num
    t.stored_path     = target_v.stored_path
    t.size_bytes      = target_v.size_bytes
    db.session.add(new_v)
    _log("FILE_RESTORE", user.email, user.id, "success", ip,
         resource=t.file_name, details=f"Restored to v{version_num}", group_id=t.group_id)
    db.session.commit()
    return {"ok": True, "transfer": t.to_dict()}


# ──────────────────────────────────────────────────────────────────────────────
# Pessimistic Locking
# ──────────────────────────────────────────────────────────────────────────────

def acquire_lock(transfer_id: str, user: User, ip: str) -> dict:
    t = db.session.get(Transfer, transfer_id)
    if not t:
        return {"ok": False, "error": "NOT_FOUND"}

    if user.role != "admin" and t.uploaded_by_id != user.id:
        acl = next((a for a in t.acl_entries if a.user_id == user.id and a.can_write), None)
        if not acl:
            _log("UNAUTHORIZED_ACCESS", user.email, user.id, "failed", ip,
                 resource=t.file_name, group_id=t.group_id)
            db.session.commit()
            return {"ok": False, "error": "FORBIDDEN"}

    # Expire stale lock
    if t.locked_by_id and t.locked_at and not _is_lock_active(t):
        t.locked_by_id = None
        t.locked_at    = None

    if t.locked_by_id and t.locked_by_id != user.id:
        locked_by = db.session.get(User, t.locked_by_id)
        return {"ok": False, "error": "FILE_LOCKED",
                "lockedBy": locked_by.email if locked_by else "unknown"}

    t.locked_by_id = user.id
    t.locked_at    = datetime.now(timezone.utc)
    db.session.commit()
    return {"ok": True}


def release_lock(transfer_id: str, user: User) -> dict:
    t = db.session.get(Transfer, transfer_id)
    if not t:
        return {"ok": False, "error": "NOT_FOUND"}

    if t.locked_by_id == user.id or user.role == "admin":
        t.locked_by_id = None
        t.locked_at    = None
        db.session.commit()
        return {"ok": True}

    return {"ok": False, "error": "NOT_LOCK_OWNER"}


# ──────────────────────────────────────────────────────────────────────────────
# Group Folder / Rename / Move / Version Upload
# ──────────────────────────────────────────────────────────────────────────────

def create_group_folder(group_id: str, name: str, parent_id: str | None,
                        user: User, ip: str) -> dict:
    """Create a virtual folder inside a group workspace."""
    name = name.strip()
    if not name:
        return {"ok": False, "error": "MISSING_NAME"}

    if parent_id:
        parent = db.session.get(Transfer, parent_id)
        if parent and not has_permission(user, parent, "write"):
            return {"ok": False, "error": "FORBIDDEN"}

    collision = Transfer.query.filter_by(
        group_id=group_id,
        parent_id=parent_id,
        file_name=name,
        is_deleted=False,
        item_type="folder",
    ).first()
    if collision:
        return {"ok": False, "error": "NAME_CONFLICT"}

    folder = Transfer(
        id=str(uuid.uuid4()),
        file_name=name,
        original_name=name,
        file_type="other",
        stored_path=None,
        size_bytes=0,
        is_encrypted=False,
        encryption_type="None",
        uploaded_by_id=user.id,
        group_id=group_id,
        parent_id=parent_id,
        item_type="folder",
        status="Delivered",
        current_version=0,
    )
    db.session.add(folder)
    _log("FOLDER_CREATED", user.email, user.id, "success", ip,
         resource=name, group_id=group_id)
    db.session.commit()
    return {"ok": True, "transfer": folder.to_dict()}


def rename_group_item(transfer_id: str, new_name: str, user: User, ip: str) -> dict:
    new_name = new_name.strip()
    if not new_name:
        return {"ok": False, "error": "MISSING_NAME"}

    t = db.session.get(Transfer, transfer_id)
    if not t or t.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}

    lock_err = _locked_by_other(t, user)
    if lock_err:
        return lock_err

    if not has_permission(user, t, "write"):
        return {"ok": False, "error": "FORBIDDEN"}

    collision = Transfer.query.filter(
        Transfer.group_id == t.group_id,
        Transfer.parent_id == t.parent_id,
        Transfer.file_name == new_name,
        Transfer.is_deleted == False,
        Transfer.id != t.id,
    ).first()
    if collision:
        return {"ok": False, "error": "NAME_CONFLICT"}

    t.file_name     = new_name
    t.original_name = new_name
    _log("ITEM_RENAMED", user.email, user.id, "success", ip,
         resource=new_name, group_id=t.group_id)
    db.session.commit()
    return {"ok": True, "transfer": t.to_dict()}


def move_group_item(transfer_id: str, target_parent_id: str | None,
                    user: User, ip: str) -> dict:
    t = db.session.get(Transfer, transfer_id)
    if not t or t.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}

    lock_err = _locked_by_other(t, user)
    if lock_err:
        return lock_err

    if not has_permission(user, t, "write"):
        return {"ok": False, "error": "FORBIDDEN"}

    # Vérifier aussi les droits d'écriture sur le dossier cible
    if target_parent_id:
        target_folder = db.session.get(Transfer, target_parent_id)
        if target_folder and not has_permission(user, target_folder, "write"):
            return {"ok": False, "error": "FORBIDDEN"}

    if t.item_type == "folder" and target_parent_id:
        if target_parent_id == t.id or _is_inside_folder(target_parent_id, t.id):
            return {"ok": False, "error": "CIRCULAR_MOVE"}

    t.parent_id = target_parent_id
    _log("ITEM_MOVED", user.email, user.id, "success", ip,
         resource=t.file_name, group_id=t.group_id)
    db.session.commit()
    return {"ok": True, "transfer": t.to_dict()}


def upload_group_version(transfer_id: str, file: FileStorage, user: User, ip: str,
                         upload_folder: str, allowed_ext: set) -> dict:
    """Upload a new explicit version to an existing Transfer record."""
    t = db.session.get(Transfer, transfer_id)
    if not t or t.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}

    if t.item_type == "folder":
        return {"ok": False, "error": "CANNOT_VERSION_FOLDER"}

    lock_err = _locked_by_other(t, user)
    if lock_err:
        return lock_err

    if not has_permission(user, t, "write"):
        return {"ok": False, "error": "FORBIDDEN"}

    if not _allowed(file.filename, allowed_ext):
        return {"ok": False, "error": "FILE_TYPE_NOT_ALLOWED"}

    safe_name  = secure_filename(file.filename)
    stored_id  = str(uuid.uuid4())
    raw_data   = file.read()
    size_bytes = len(raw_data)

    data_to_save = _encrypt_file(raw_data) if t.is_encrypted else raw_data
    ext_suffix   = ".enc" if t.is_encrypted else ""
    stored_path  = os.path.join(upload_folder, f"{stored_id}_{safe_name}{ext_suffix}")

    os.makedirs(upload_folder, exist_ok=True)
    with open(stored_path, "wb") as f:
        f.write(data_to_save)

    new_num = t.current_version + 1
    v = FileVersion(
        id=str(uuid.uuid4()),
        transfer_id=t.id,
        version_num=new_num,
        stored_path=stored_path,
        size_bytes=size_bytes,
        author_id=user.id,
        description=f"Version {new_num}",
    )
    t.current_version = new_num
    t.stored_path     = stored_path
    t.size_bytes      = size_bytes
    db.session.add(v)
    _log("FILE_VERSION_UPLOAD", user.email, user.id, "success", ip,
         resource=t.file_name, details=f"v{new_num} uploaded", group_id=t.group_id)
    db.session.commit()
    return {"ok": True, "transfer": t.to_dict()}


# ──────────────────────────────────────────────────────────────────────────────
# Inline Text Edit  (overwrite in place, version-bump for group files)
# ──────────────────────────────────────────────────────────────────────────────

def update_file_content(transfer_id: str, new_text: str, user: User, ip: str) -> dict:
    """
    Overwrite a text file's content directly without re-uploading.

    Rules:
    - Caller must hold the pessimistic lock (checked here; 423 if another user holds it).
    - If the file belongs to a group workspace, a new FileVersion row is created and
      current_version is incremented, exactly like an explicit version upload.
    - Encryption is preserved: if is_encrypted=True the new bytes are re-encrypted
      with _encrypt_file() before being written to disk.
    - size_bytes is updated to reflect the new UTF-8 byte length.
    """
    t = db.session.get(Transfer, transfer_id)
    if not t or t.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}

    if t.item_type == "folder":
        return {"ok": False, "error": "CANNOT_EDIT_FOLDER"}

    if not t.stored_path or not os.path.exists(t.stored_path):
        return {"ok": False, "error": "FILE_MISSING_ON_DISK"}

    # Permission check: uploader, admin, or ACL can_write
    if not has_permission(user, t, "write"):
        _log("UNAUTHORIZED_ACCESS", user.email, user.id, "failed", ip,
             resource=t.file_name, group_id=t.group_id)
        db.session.commit()
        return {"ok": False, "error": "FORBIDDEN"}

    # Lock guard — caller must already hold the lock
    lock_err = _locked_by_other(t, user)
    if lock_err:
        return lock_err

    raw_bytes     = new_text.encode("utf-8")
    data_to_write = _encrypt_file(raw_bytes) if t.is_encrypted else raw_bytes

    with open(t.stored_path, "wb") as f:
        f.write(data_to_write)

    t.size_bytes = len(raw_bytes)

    # Group workspace: bump version so history is preserved
    if t.group_id:
        new_num = (t.current_version or 1) + 1
        v = FileVersion(
            id=str(uuid.uuid4()),
            transfer_id=t.id,
            version_num=new_num,
            stored_path=t.stored_path,
            size_bytes=len(raw_bytes),
            author_id=user.id,
            description=f"Inline edit v{new_num}",
        )
        t.current_version = new_num
        db.session.add(v)

    _log("FILE_CONTENT_UPDATED", user.email, user.id, "success", ip,
         resource=t.file_name,
         details=f"{len(raw_bytes)} bytes written ({'encrypted' if t.is_encrypted else 'plain'})",
         group_id=t.group_id)
    db.session.commit()
    return {"ok": True, "transfer": t.to_dict()}