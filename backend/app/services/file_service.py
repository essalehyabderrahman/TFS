import uuid
import os
import io
import base64
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


LOCK_TIMEOUT_MINUTES = 15  # Verrou expiré après 15 min d'inactivité

# ──────────────────────────────────────────────────────────────────────────────
# Encryption helpers (AES-256-GCM)
# ──────────────────────────────────────────────────────────────────────────────

CURRENT_KEY_VERSION = 1

def _get_aes_key(key_version: int = CURRENT_KEY_VERSION) -> bytes:
    """
    Returns a 32-byte key for AES-256-GCM, with versioning support.
    """
    raw_key = current_app.config.get("ENCRYPTION_KEY", "")
    
    # Versioned key derivation
    versioned_input = f"v{key_version}:{raw_key}"
    return hashlib.sha256(versioned_input.encode()).digest()


def _encrypt_file(data: bytes) -> bytes:
    """Encrypt raw file bytes using AES-256-GCM and return version + nonce + tag + ciphertext."""
    version = CURRENT_KEY_VERSION
    key = _get_aes_key(version)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 12-byte nonce for GCM
    ciphertext = aesgcm.encrypt(nonce, data, None)
    # Layout: [2-byte version LE][12-byte nonce][ciphertext (includes tag)]
    return struct.pack("<H", version) + nonce + ciphertext


def _decrypt_file(data: bytes) -> bytes:
    """Decrypt ciphertext (header + nonce + encrypted data) and return original bytes."""
    if len(data) < 15: # 2 (version) + 12 (nonce) + tag
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


# ──────────────────────────────────────────────────────────────────────────────
# Upload  (encrypt → save)
# ──────────────────────────────────────────────────────────────────────────────

def upload_file(file: FileStorage, uploader_id: str, recipient_email: str,
                expiry_days: int, upload_folder: str, allowed_ext: set, ip: str,
                group_id: str = None, encrypt: bool = True) -> dict:
    uploader = db.session.get(User, uploader_id)
    if not uploader:
        return {"ok": False, "error": "USER_NOT_FOUND"}

    if not _allowed(file.filename, allowed_ext):
        return {"ok": False, "error": "FILE_TYPE_NOT_ALLOWED"}

    safe_name   = secure_filename(file.filename)
    stored_id   = str(uuid.uuid4())
    stored_path = os.path.join(upload_folder, f"{stored_id}_{safe_name}.enc")

    os.makedirs(upload_folder, exist_ok=True)

    # ── Read → encrypt → write ───────────────────────────────────────────────
    raw_data      = file.read()
    size_bytes    = len(raw_data)          # store original size for display

    if encrypt:
        data_to_save = _encrypt_file(raw_data)
        enc_type = "AES-256-GCM"
        ext_suffix = ".enc"
    else:
        data_to_save = raw_data
        enc_type = "None"
        ext_suffix = ""

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
        status="Delivered" if recipient_email else "Pending",
        current_version=1,
    )
    db.session.add(transfer)

    # First version record
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

    # Notification for recipient
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

    # [Contacts] Auto-add recipient as a contact of the uploader
    if recipient_email:
        from app.routes.contacts import _auto_add_contact
        _auto_add_contact(uploader_id, recipient_email, "sent_to")
        # Auto-add uploader as a contact of the recipient (received_from)
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
        transfers = Transfer.query.filter_by(is_deleted=False).order_by(Transfer.created_at.desc()).all()
    else:
        transfers = Transfer.query.filter_by(
            uploaded_by_id=user.id, is_deleted=False
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

    # Access control
    # [Security] recipient_email grants implicit read access UNLESS an explicit
    # ACL entry exists for this user — in which case the ACL is authoritative.
    user_acl = next((a for a in t.acl_entries if a.user_id == user.id), None)
    recipient_has_implicit_access = (
        t.recipient_email == user.email and user_acl is None
    )
    
    is_admin = user.role == "admin"
    is_uploader = t.uploaded_by_id == user.id
    has_acl_read = user_acl is not None and user_acl.can_read

    if context == "received":
        # In received context, uploader should not be able to download
        # (they have Active Transfers for that)
        is_core = is_admin or recipient_has_implicit_access or has_acl_read
    else:
        is_core = is_admin or is_uploader or recipient_has_implicit_access or has_acl_read

    if not is_core:
        # Step 2: if not core, external sharing must be enabled to allow access
        from app.models.team_settings import TeamSettings
        settings = TeamSettings.query.first()
        if not settings or not settings.allow_external_sharing:
            _log("UNAUTHORIZED_ACCESS", user.email, user.id, "failed", ip, resource=t.file_name)
            db.session.commit()
            return {"ok": False, "error": "FORBIDDEN"}
        # External sharing is on — allow the request to proceed

    if t.expiry_date:
        expiry_utc = t.expiry_date if t.expiry_date.tzinfo else t.expiry_date.replace(tzinfo=timezone.utc)
        if expiry_utc < datetime.now(timezone.utc):
            t.status = "Expired"
            db.session.commit()
            return {"ok": False, "error": "EXPIRED"}

    # ── Decrypt in memory if needed ──────────────────────────────────────────
    try:
        with open(t.stored_path, "rb") as f:
            file_data = f.read()
        
        if t.is_encrypted:
            decrypted = _decrypt_file(file_data)
        else:
            decrypted = file_data
    except Exception:
        _log("DECRYPT_ERROR", user.email, user.id, "failed", ip, resource=t.file_name, group_id=t.group_id)
        db.session.commit()
        return {"ok": False, "error": "DECRYPT_ERROR"}

    db.session.execute(
        update(Transfer)
        .where(Transfer.id == t.id)
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

    if user.role != "admin" and t.uploaded_by_id != user.id:
        acl = next((a for a in t.acl_entries if a.user_id == user.id and a.can_delete), None)
        if not acl:
            _log("UNAUTHORIZED_ACCESS", user.email, user.id, "failed", ip, resource=t.file_name, group_id=t.group_id)
            db.session.commit()
            return {"ok": False, "error": "FORBIDDEN"}

    deleted_paths = set()
    paths_to_delete = [t.stored_path]
    for v in t.versions:
        if v.stored_path and v.stored_path not in paths_to_delete:
            paths_to_delete.append(v.stored_path)

    for path in paths_to_delete:
        if path and path not in deleted_paths:
            try:
                os.remove(path)
                deleted_paths.add(path)
            except Exception as e:
                _log("FILE_DELETE_DISK_ERROR", user.email, user.id, "warning", ip, resource=t.file_name, details=str(e))

    # [Concurrency] Always release lock before deletion to avoid dangling lock state
    t.locked_by_id = None
    t.locked_at = None
    t.is_deleted = True
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

    if user.role != "admin" and t.uploaded_by_id != user.id:
        acl = next((a for a in t.acl_entries if a.user_id == user.id and a.can_write), None)
        if not acl:
            _log("UNAUTHORIZED_ACCESS", user.email, user.id, "failed", ip, resource=t.file_name,
                 details="Restore attempt blocked: no can_write ACL entry.", group_id=t.group_id)
            db.session.commit()
            return {"ok": False, "error": "FORBIDDEN"}

    # [Concurrency] Reject restore if another user holds the lock
    if t.locked_by_id and t.locked_by_id != user.id:
        # Check if lock has expired first
        if t.locked_at:
            locked_at_utc = t.locked_at if t.locked_at.tzinfo is not None else t.locked_at.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - locked_at_utc).total_seconds() / 60
            if elapsed <= LOCK_TIMEOUT_MINUTES:
                locked_by = db.session.get(User, t.locked_by_id)
                return {"ok": False, "error": "FILE_LOCKED",
                        "lockedBy": locked_by.email if locked_by else "unknown"}

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
    t.stored_path = target_v.stored_path
    t.size_bytes  = target_v.size_bytes
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

    # [ACL] Only owner, admin, or users with can_write may acquire a lock
    if user.role != "admin" and t.uploaded_by_id != user.id:
        acl = next((a for a in t.acl_entries if a.user_id == user.id and a.can_write), None)
        if not acl:
            _log("UNAUTHORIZED_ACCESS", user.email, user.id, "failed", ip, resource=t.file_name,
                 details="Lock attempt blocked: no can_write ACL entry.", group_id=t.group_id)
            db.session.commit()
            return {"ok": False, "error": "FORBIDDEN"}

    # Check if lock has expired
    if t.locked_by_id and t.locked_at:
        locked_at_utc = t.locked_at if t.locked_at.tzinfo is not None else t.locked_at.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - locked_at_utc).total_seconds() / 60
        if elapsed > LOCK_TIMEOUT_MINUTES:
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