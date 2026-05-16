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
    action      = db.Column(db.String(50), nullable=False)
    # Ex: LOGIN_SUCCESS | LOGIN_FAILED | FILE_UPLOAD | FILE_DOWNLOAD |
    resource    = db.Column(db.String(255), nullable=True)   # nom du fichier / endpoint
    ip_address  = db.Column(db.String(45),  nullable=True)
    location    = db.Column(db.String(100), nullable=True)
    user_agent  = db.Column(db.String(255), nullable=True)
    status      = db.Column(db.String(20),  nullable=False, default="success")
    # success | failed | warning

    details     = db.Column(db.Text, nullable=True)
    timestamp   = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    group_id    = db.Column(db.String(36), db.ForeignKey("groups.id", ondelete="SET NULL"), nullable=True, index=True)

    # Relationships
    actor       = db.relationship("User", back_populates="audit_logs")
    group       = db.relationship("Group", foreign_keys=[group_id])

    def to_dict(self) -> dict:
        return {
            "id":         self.id,
            "timestamp":  self.timestamp.isoformat(),
            "user":       self.user_email,
            "action":     self.action,
            "resource":   self.resource or "",
            "ipAddress":  self.ip_address or "",
            "location":   self.location or "",
            "userAgent":  self.user_agent or "",
            "status":     self.status,
            "details":    self.details or "",
            "groupId":    self.group_id or "",
        }

    def __init__(self, **kwargs):
        super(AuditLog, self).__init__(**kwargs)

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

    def __init__(self, **kwargs):
        super(ACLEntry, self).__init__(**kwargs)

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