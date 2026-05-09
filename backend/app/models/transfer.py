from datetime import datetime, timezone, timedelta
from app.extensions import db


class Transfer(db.Model):
    __tablename__ = "transfers"

    id               = db.Column(db.String(36),  primary_key=True)
    file_name        = db.Column(db.String(255),  nullable=False)
    file_type        = db.Column(db.String(20),   nullable=False)   # pdf|img|zip|video|doc|other
    original_name    = db.Column(db.String(255),  nullable=False)
    stored_path      = db.Column(db.String(500),  nullable=False)   # chemin sur le disque
    size_bytes       = db.Column(db.Integer,       nullable=False, default=0)
    encryption_type  = db.Column(db.String(30),   nullable=False, default="AES-256-GCM")
    status           = db.Column(db.String(20),   nullable=False, default="Pending")   # Pending | Sending... | Delivered | Expired

    # Security & Access
    recipient_email  = db.Column(db.String(255),  nullable=True)
    download_count   = db.Column(db.Integer,      nullable=False, default=0)
    expiry_date      = db.Column(db.DateTime,     nullable=True, default=lambda: datetime.now(timezone.utc) + timedelta(days=180))
    is_deleted       = db.Column(db.Boolean,      default=False)
    revoked_at       = db.Column(db.DateTime,     nullable=True)
    sent_at          = db.Column(db.DateTime,     nullable=True)

    # Concurrent access lock
    locked_by_id     = db.Column(db.String(36),   db.ForeignKey("users.id"), nullable=True)
    locked_at        = db.Column(db.DateTime,     nullable=True)

    # Versioning
    current_version  = db.Column(db.Integer,      nullable=False, default=1)

    # FK
    uploaded_by_id   = db.Column(db.String(36),   db.ForeignKey("users.id"), nullable=False)
    group_id         = db.Column(db.String(36),   db.ForeignKey("groups.id"), nullable=True)

    # Timestamps
    created_at       = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at       = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                                              onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    uploader         = db.relationship("User", back_populates="transfers", foreign_keys=[uploaded_by_id])
    locked_by        = db.relationship("User", foreign_keys=[locked_by_id])
    group            = db.relationship("Group", back_populates="transfers", foreign_keys=[group_id])
    versions         = db.relationship("FileVersion", back_populates="transfer", lazy="select",
                                       cascade="all, delete-orphan")
    acl_entries      = db.relationship("ACLEntry", back_populates="transfer", lazy="select",
                                       cascade="all, delete-orphan")

    # ------------------------------------------------------------------ helpers
    @property
    def size_display(self) -> str:
        b = self.size_bytes
        for unit in ("B", "KB", "MB", "GB"):
            if b < 1024:
                return f"{b:.1f} {unit}"
            b /= 1024
        return f"{b:.1f} TB"

    @property
    def is_locked(self) -> bool:
        return self.locked_by_id is not None

    def _fmt_date(self, dt) -> str:
        return f"{dt.strftime('%b')} {dt.day}, {dt.strftime('%Y')}"

    def to_dict(self) -> dict:
        return {
            "id":             self.id,
            "groupId":        self.group_id or "",
            "fileName":       self.file_name,
            "fileType":       self.file_type,
            "recipient":      self.recipient_email or "",
            "size":           self.size_display,
            "sizeBytes":      self.size_bytes,
            "status":         self.status,
            "date":           self._fmt_date(self.created_at),
            "dateTimestamp":  int(self.created_at.timestamp() * 1000),
            "encryptionType": self.encryption_type,
            "downloadCount":  self.download_count,
            "expiryDate":     self.expiry_date.isoformat() if self.expiry_date else "",
            "uploadedBy":     self.uploader.email if self.uploader else "",
            "isLocked":       self.is_locked,
            "currentVersion": self.current_version,
            "revokedAt":      self.revoked_at.isoformat() if self.revoked_at else None,
            "sentAt":         self.sent_at.isoformat() if self.sent_at else None,
        }

    def __repr__(self):
        return f"<Transfer {self.file_name} [{self.status}]>"


class FileVersion(db.Model):
    __tablename__ = "file_versions"

    id           = db.Column(db.String(36),  primary_key=True)
    transfer_id  = db.Column(db.String(36),  db.ForeignKey("transfers.id"), nullable=False)
    version_num  = db.Column(db.Integer,     nullable=False)
    stored_path  = db.Column(db.String(500), nullable=False)
    size_bytes   = db.Column(db.Integer,     nullable=False, default=0)
    description  = db.Column(db.String(255), nullable=True)
    author_id    = db.Column(db.String(36),  db.ForeignKey("users.id"), nullable=False)
    created_at   = db.Column(db.DateTime,    default=lambda: datetime.now(timezone.utc))

    # Relationships
    transfer     = db.relationship("Transfer", back_populates="versions")
    author       = db.relationship("User")

    def to_dict(self) -> dict:
        return {
            "id":          self.id,
            "versionNum":  self.version_num,
            "sizeBytes":   self.size_bytes,
            "description": self.description or "",
            "author":      self.author.email if self.author else "",
            "createdAt":   self.created_at.isoformat(),
        }