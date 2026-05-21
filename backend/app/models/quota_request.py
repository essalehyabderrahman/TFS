"""
QuotaRequest model — stores user requests for storage quota increases.
Each request tracks the justification, requested amount, and admin decision.
"""

from datetime import datetime, timezone
from app.extensions import db


class QuotaRequest(db.Model):
    __tablename__ = "quota_requests"

    id              = db.Column(db.String(36), primary_key=True)
    user_id         = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    justification   = db.Column(db.Text, nullable=False)
    requested_bytes = db.Column(db.BigInteger, nullable=False)
    status          = db.Column(db.String(20), nullable=False, default="pending")  # pending | approved | rejected

    # Admin resolution
    admin_id    = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    admin_note  = db.Column(db.Text, nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    user  = db.relationship("User", foreign_keys=[user_id], backref=db.backref("quota_requests", lazy="dynamic"))
    admin = db.relationship("User", foreign_keys=[admin_id])

    def to_dict(self) -> dict:
        d = {
            "id": self.id,
            "userId": self.user_id,
            "justification": self.justification,
            "requestedBytes": self.requested_bytes,
            "status": self.status,
            "adminNote": self.admin_note,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "resolvedAt": self.resolved_at.isoformat() if self.resolved_at else None,
        }
        # Include user info for admin views
        if self.user:
            d["userName"] = self.user.name
            d["userEmail"] = self.user.email
            d["userAvatar"] = self.user.avatar or self.user.name[0].upper()
            d["currentQuotaBytes"] = self.user.storage_quota_bytes
        if self.admin:
            d["adminName"] = self.admin.name
        return d
