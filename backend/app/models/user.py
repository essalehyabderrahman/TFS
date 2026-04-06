from datetime import datetime, timezone
from app.extensions import db, bcrypt


class User(db.Model):
    __tablename__ = "users"

    id            = db.Column(db.String(36),  primary_key=True)
    name          = db.Column(db.String(120), nullable=False)
    email         = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role          = db.Column(db.String(20),  nullable=False, default="viewer")   # admin | editor | viewer
    status        = db.Column(db.String(20),  nullable=False, default="active")   # active | pending | suspended
    avatar        = db.Column(db.String(10),  nullable=True)                      # initials

    # MFA
    mfa_enabled   = db.Column(db.Boolean, default=False)
    mfa_secret    = db.Column(db.String(64), nullable=True)

    # Security settings snapshot (stored per-user)
    session_timeout     = db.Column(db.Integer, default=60)    # minutes
    encryption_level    = db.Column(db.String(20), default="AES-256-GCM")
    login_notifications = db.Column(db.Boolean, default=True)

    # Timestamps
    created_at   = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    last_active  = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    transfers    = db.relationship("Transfer", back_populates="uploader", foreign_keys="Transfer.uploaded_by_id", lazy="select")
    audit_logs   = db.relationship("AuditLog", back_populates="actor", lazy="select")

    # ------------------------------------------------------------------ helpers
    def set_password(self, plain: str) -> None:
        self.password_hash = bcrypt.generate_password_hash(plain).decode("utf-8")

    def check_password(self, plain: str) -> bool:
        return bcrypt.check_password_hash(self.password_hash, plain)

    def touch(self) -> None:
        """Met à jour last_active."""
        self.last_active = datetime.now(timezone.utc)

    def to_dict(self) -> dict:
        return {
            "id":         self.id,
            "name":       self.name,
            "email":      self.email,
            "role":       self.role,
            "status":     self.status,
            "avatar":     self.avatar or self._initials(),
            "mfaEnabled": self.mfa_enabled,
            "joinedAt":   self.created_at.isoformat(),
            "lastActive": self.last_active.isoformat(),
        }

    def _initials(self) -> str:
        parts = self.name.strip().split()
        if len(parts) >= 2:
            return (parts[0][0] + parts[-1][0]).upper()
        return self.name[:2].upper()

    def __repr__(self):
        return f"<User {self.email} [{self.role}]>"