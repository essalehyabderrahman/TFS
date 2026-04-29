from datetime import datetime, timezone, timedelta
from app.extensions import db, bcrypt

  
class User(db.Model):
    __tablename__ = "users"

    id            = db.Column(db.String(36),  primary_key=True)
    name          = db.Column(db.String(120), nullable=False)
    email         = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role          = db.Column(db.String(20),  nullable=False, default="user")   # admin | user
    status        = db.Column(db.String(20),  nullable=False, default="active")   # active | pending | suspended
    avatar        = db.Column(db.String(10),  nullable=True)                      # initials
    company       = db.Column(db.String(120), nullable=False, default="Individual")
    plan          = db.Column(db.String(20),  nullable=False, default="free")     # free | pro | enterprise

    # Security Lockout (sign-in brute-force)
    failed_login_attempts = db.Column(db.Integer, default=0)
    lockout_until         = db.Column(db.DateTime, nullable=True)

    # MFA
    mfa_enabled          = db.Column(db.Boolean, default=False)
    mfa_secret           = db.Column(db.String(64), nullable=True)
    mfa_failed_attempts  = db.Column(db.Integer, default=0)         # MFA verify failure counter (independent)
    # last_used_totp removed — TOTP replay protection is handled by Redis (totp_replay.py)
    backup_codes         = db.Column(db.String(1000), nullable=True)# Comma-separated bcrypt hashes of backup codes

    # Token Rotation
    token_version        = db.Column(db.Integer, default=1)         # Incremented on password change to invalidate sessions
    # [Security] Root account flag — set only on the seeded superadmin. Immutable after creation.
    is_root = db.Column(db.Boolean, nullable=False, default=False)

    # Security settings snapshot (stored per-user)
    session_timeout     = db.Column(db.Integer, default=60)    # minutes
    encryption_level    = db.Column(db.String(20), default="AES-256-GCM")
    login_notifications = db.Column(db.Boolean, default=True)

    # Timestamps
    created_at   = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    last_active  = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    transfers    = db.relationship("Transfer", back_populates="uploader", foreign_keys="Transfer.uploaded_by_id", lazy="select", cascade="all, delete-orphan")
    audit_logs   = db.relationship("AuditLog", back_populates="actor", lazy="select", cascade="all, delete-orphan")

    # ------------------------------------------------------------------ helpers
    def set_password(self, plain: str) -> None:
        self.password_hash = bcrypt.generate_password_hash(plain).decode("utf-8")

    def check_password(self, plain: str) -> bool:
        return bcrypt.check_password_hash(self.password_hash, plain)

    def is_locked(self) -> bool:
        """Return True if the account is currently under a lockout."""
        if self.lockout_until is None:
            return False
        return datetime.now(timezone.utc) < self.lockout_until.replace(tzinfo=timezone.utc)

    def record_failed_attempt(self) -> None:
        """
        Increment the failure counter and apply exponential back-off lockout.
        Locks the account after 5 consecutive failures.
        Back-off: 2^(n-5) seconds, capped at 900 s (15 min).
        """
        self.failed_login_attempts = (self.failed_login_attempts or 0) + 1
        if self.failed_login_attempts >= 5:
            delay = min(2 ** (self.failed_login_attempts - 5), 900)
            self.lockout_until = datetime.now(timezone.utc) + timedelta(seconds=delay)

    def reset_failed_attempts(self) -> None:
        """Reset counter and lock on a successful authentication."""
        self.failed_login_attempts = 0
        self.lockout_until         = None

    def touch(self) -> None:
        """Met à jour last_active."""
        self.last_active = datetime.now(timezone.utc)

    def to_dict(self) -> dict:
        """Full profile — for the authenticated user's own data and admin views."""
        return {
            "id":         self.id,
            "name":       self.name,
            "email":      self.email,
            "role":       self.role,
            "status":     self.status,
            "avatar":     self.avatar or self._initials(),
            "company":    self.company,
            "plan":       self.plan,
            "mfaEnabled":       self.mfa_enabled,
            "backupCodeExists": self.backup_codes is not None,
            "isRoot":           self.is_root,
            "joinedAt":   self.created_at.isoformat(),
            "lastActive": self.last_active.isoformat(),
        }

    def to_public_dict(self) -> dict:
        """Minimal profile — safe for team directory listings visible to non-admins."""
        return {
            "id":     self.id,
            "name":   self.name,
            "email":  self.email,
            "role":   self.role,
            "status": self.status,
            "isRoot": self.is_root,
            "avatar": self.avatar or self._initials(),
        }

    def _initials(self) -> str:
        parts = self.name.strip().split()
        if len(parts) >= 2:
            return (parts[0][0] + parts[-1][0]).upper()
        return self.name[:2].upper()

    def __repr__(self):
        return f"<User {self.email} [{self.role}]>"