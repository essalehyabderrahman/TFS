from datetime import datetime, timezone
from app.extensions import db


class UserFile(db.Model):
    """
    Represents a file or folder in a user's personal File Manager space.
    This is distinct from Transfer (which is for sharing). UserFile is for
    persistent personal storage with a folder hierarchy.
    """
    __tablename__ = "user_files"

    id          = db.Column(db.String(36),  primary_key=True)
    owner_id    = db.Column(db.String(36),  db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # parent_id = None means the item is at the root level
    parent_id   = db.Column(db.String(36),  db.ForeignKey("user_files.id", ondelete="CASCADE"), nullable=True)
    item_type   = db.Column(db.String(10),  nullable=False)   # "folder" | "file"
    name        = db.Column(db.String(255), nullable=False)
    stored_path = db.Column(db.String(500), nullable=True)    # disk path; None for folders
    size_bytes  = db.Column(db.Integer,     nullable=False, default=0)
    file_kind   = db.Column(db.String(20),  nullable=True)    # pdf|img|zip|video|doc|other
    is_encrypted = db.Column(db.Boolean,    nullable=False, default=True)
    is_deleted  = db.Column(db.Boolean,     nullable=False, default=False)
    created_at  = db.Column(db.DateTime,    nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at  = db.Column(db.DateTime,    nullable=False,
                            default=lambda: datetime.now(timezone.utc),
                            onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    owner    = db.relationship("User", foreign_keys=[owner_id])
    children = db.relationship("UserFile", back_populates="parent",
                               foreign_keys="UserFile.parent_id",
                               lazy="dynamic", cascade="all, delete-orphan")
    parent   = db.relationship("UserFile", back_populates="children",
                               foreign_keys=[parent_id], remote_side=[id])

    # ── helpers ──────────────────────────────────────────────────────────────

    @property
    def size_label(self) -> str:
        b = self.size_bytes
        if b < 1024:
            return f"{b} B"
        if b < 1_048_576:
            return f"{b / 1024:.0f} KB"
        if b < 1_073_741_824:
            return f"{b / 1_048_576:.1f} MB"
        return f"{b / 1_073_741_824:.2f} GB"

    def to_dict(self) -> dict:
        return {
            "id":            self.id,
            "type":          self.item_type,
            "name":          self.name,
            "parentId":      self.parent_id,
            "size":          self.size_bytes if self.item_type == "file" else None,
            "sizeLabel":     self.size_label if self.item_type == "file" else None,
            "fileKind":      self.file_kind,
            "isEncrypted":   self.is_encrypted,
            "createdAt":     self._fmt_date(self.created_at),
            "dateTimestamp": int(self.created_at.timestamp()),
        }

    def _fmt_date(self, dt: datetime) -> str:
        return f"{dt.strftime('%b')} {dt.day}, {dt.strftime('%Y')}"

    def __init__(self, **kwargs):
        super(UserFile, self).__init__(**kwargs)

    def __repr__(self):
        return f"<UserFile [{self.item_type}] {self.name}>"
