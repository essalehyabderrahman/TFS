from datetime import datetime, timezone
from app.extensions import db


# ──────────────────────────────────────────────────────────────────────────────
# Audit Log
# ──────────────────────────────────────────────────────────────────────────────
class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id          = db.Column(db.String(36),  primary_key=True)
    user_id     = db.Column(db.String(36),  db.ForeignKey("users.id"), nullable=True)
    user_email  = db.Column(db.String(255), nullable=False, default="system")
    action      = db.Column(db.String(100), nullable=False)
    # Ex: LOGIN_SUCCESS | LOGIN_FAILED | FILE_UPLOAD | FILE_DOWNLOAD |
    #     FILE_DELETE | FILE_MODIFY | PERMISSION_CHANGE | UNAUTHORIZED_ACCESS

    resource    = db.Column(db.String(255), nullable=True)   # nom du fichier / endpoint
    ip_address  = db.Column(db.String(45),  nullable=True)
    location    = db.Column(db.String(100), nullable=True)
    status      = db.Column(db.String(20),  nullable=False, default="success")
    # success | failed | warning

    details     = db.Column(db.Text, nullable=True)
    timestamp   = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    # Relationship
    actor       = db.relationship("User", back_populates="audit_logs")

    def to_dict(self) -> dict:
        return {
            "id":         self.id,
            "timestamp":  self.timestamp.isoformat(),
            "user":       self.user_email,
            "action":     self.action,
            "resource":   self.resource or "",
            "ipAddress":  self.ip_address or "",
            "location":   self.location or "",
            "status":     self.status,
            "details":    self.details or "",
        }

    def __repr__(self):
        return f"<AuditLog {self.action} by {self.user_email}>"


# ──────────────────────────────────────────────────────────────────────────────
# ACL Entry
# ──────────────────────────────────────────────────────────────────────────────
class ACLEntry(db.Model):
    """
    Définit les permissions d'un utilisateur sur un fichier/dossier.
    Permissions stockées en flags booléens pour granularité maximale.
    """
    __tablename__ = "acl_entries"

    id            = db.Column(db.String(36),  primary_key=True)
    transfer_id   = db.Column(db.String(36),  db.ForeignKey("transfers.id"), nullable=False)
    user_id       = db.Column(db.String(36),  db.ForeignKey("users.id"),     nullable=False)

    can_read      = db.Column(db.Boolean, default=True)
    can_write     = db.Column(db.Boolean, default=False)
    can_delete    = db.Column(db.Boolean, default=False)
    can_share     = db.Column(db.Boolean, default=False)

    granted_by_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    granted_at    = db.Column(db.DateTime,   default=lambda: datetime.now(timezone.utc))

    # Relationships
    transfer      = db.relationship("Transfer", back_populates="acl_entries")
    user          = db.relationship("User", foreign_keys=[user_id])
    granted_by    = db.relationship("User", foreign_keys=[granted_by_id])

    __table_args__ = (
        db.UniqueConstraint("transfer_id", "user_id", name="uq_acl_transfer_user"),
    )

    def to_dict(self) -> dict:
        return {
            "id":         self.id,
            "transferId": self.transfer_id,
            "userId":     self.user_id,
            "userEmail":  self.user.email if self.user else "",
            "canRead":    self.can_read,
            "canWrite":   self.can_write,
            "canDelete":  self.can_delete,
            "canShare":   self.can_share,
            "grantedAt":  self.granted_at.isoformat(),
        }

    def __repr__(self):
        perms = []
        if self.can_read:   perms.append("R")
        if self.can_write:  perms.append("W")
        if self.can_delete: perms.append("D")
        if self.can_share:  perms.append("S")
        return f"<ACL {self.user_id}→{self.transfer_id} [{'/'.join(perms)}]>"