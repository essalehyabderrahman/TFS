import uuid
import os
import io
import base64
from datetime import datetime, timezone, timedelta
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

def _get_aes_key() -> bytes:
    """
    Returns a 32-byte key for AES-256-GCM.
    """
    raw_key = current_app.config.get("ENCRYPTION_KEY", "")

    if raw_key:
        try:
            key = base64.urlsafe_b64decode(raw_key.encode())
            if len(key) == 32:
                return key
        except Exception:
            pass
        
        # Fallback/Normalization
        import hashlib
        return hashlib.sha256(raw_key.encode()).digest()
    else:
        # Derive a 32-byte key from Flask SECRET_KEY via PBKDF2
        secret = current_app.config["SECRET_KEY"].encode()
        salt = b"tfs-file-encryption-salt-v2"  # New salt for AES-256-GCM
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100_000,
            backend=default_backend(),
        )
        return kdf.derive(secret)


def _encrypt_file(data: bytes) -> bytes:
    """Encrypt raw file bytes using AES-256-GCM and return nonce + ciphertext."""
    aesgcm = AESGCM(_get_aes_key())
    nonce = os.urandom(12)  # 12-byte nonce for GCM
    ciphertext = aesgcm.encrypt(nonce, data, None)
    return nonce + ciphertext  # Prepend nonce for storage


def _decrypt_file(data: bytes) -> bytes:
    """Decrypt ciphertext (nonce + encrypted data) and return original bytes."""
    if len(data) < 13:
        raise ValueError("Invalid encrypted data: too short")
    
    nonce = data[:12]
    ciphertext = data[12:]
    aesgcm = AESGCM(_get_aes_key())
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


def _log(action, user_email, user_id, status, ip, resource="", details=""):
    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        user_email=user_email,
        action=action,
        resource=resource,
        ip_address=ip,
        status=status,
        details=details,
    ))


# ──────────────────────────────────────────────────────────────────────────────
# Upload  (encrypt → save)
# ──────────────────────────────────────────────────────────────────────────────

def upload_file(file: FileStorage, uploader_id: str, recipient_email: str,
                expiry_days: int, upload_folder: str, allowed_ext: set, ip: str,
                group_id: str = None) -> dict:
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
    encrypted     = _encrypt_file(raw_data)
    size_bytes    = len(raw_data)          # store original size for display

    with open(stored_path, "wb") as f:
        f.write(encrypted)

    expiry = datetime.now(timezone.utc) + timedelta(days=expiry_days) if expiry_days else None

    transfer = Transfer(
        id=stored_id,
        file_name=safe_name,
        original_name=file.filename,
        file_type=_file_type(safe_name),
        stored_path=stored_path,
        size_bytes=size_bytes,
        recipient_email=recipient_email or None,
        expiry_date=expiry,
        uploaded_by_id=uploader_id,
        group_id=group_id or None,
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
         resource=safe_name, details=f"{size_bytes} bytes (encrypted with AES-256-GCM)")

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
    transfers = Transfer.query.filter_by(
        recipient_email=user.email, is_deleted=False
    ).order_by(Transfer.created_at.desc()).all()
    return [t.to_dict() for t in transfers]


# ──────────────────────────────────────────────────────────────────────────────
# Download  (read → decrypt → stream)
# ──────────────────────────────────────────────────────────────────────────────

def get_transfer_file(transfer_id: str, user: User, ip: str) -> dict:
    t = db.session.get(Transfer, transfer_id)
    if not t or t.is_deleted:
        return {"ok": False, "error": "NOT_FOUND"}

    # Access control
    # Step 1: determine if the user is a "core" authorized party
    is_core = (
        user.role == "admin"
        or t.uploaded_by_id == user.id
        or t.recipient_email == user.email
        or any(a.user_id == user.id and a.can_read for a in t.acl_entries)
    )

    if not is_core:
        # Step 2: if not core, external sharing must be enabled to allow access
        from app.models.team_settings import TeamSettings
        settings = TeamSettings.query.first()
        if not settings or not settings.allow_external_sharing:
            _log("UNAUTHORIZED_ACCESS", user.email, user.id, "failed", ip, resource=t.file_name)
            db.session.commit()
            return {"ok": False, "error": "FORBIDDEN"}
        # External sharing is on — allow the request to proceed

    if t.expiry_date and t.expiry_date < datetime.now(timezone.utc):
        t.status = "Expired"
        db.session.commit()
        return {"ok": False, "error": "EXPIRED"}

    # ── Decrypt in memory ────────────────────────────────────────────────────
    try:
        with open(t.stored_path, "rb") as f:
            encrypted = f.read()
        decrypted = _decrypt_file(encrypted)
    except Exception:
        _log("DECRYPT_ERROR", user.email, user.id, "failed", ip, resource=t.file_name)
        db.session.commit()
        return {"ok": False, "error": "DECRYPT_ERROR"}

    t.download_count += 1
    _log("FILE_DOWNLOAD", user.email, user.id, "success", ip, resource=t.file_name)
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
            _log("UNAUTHORIZED_ACCESS", user.email, user.id, "failed", ip, resource=t.file_name)
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
    _log("FILE_DELETE", user.email, user.id, "success", ip, resource=t.file_name)
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
                 details="Restore attempt blocked: no can_write ACL entry.")
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
         resource=t.file_name, details=f"Restored to v{version_num}")
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
                 details="Lock attempt blocked: no can_write ACL entry.")
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