import uuid
from datetime import datetime, timezone
from app.extensions import db

class RecoveryRequest(db.Model):
    __tablename__ = "recovery_requests"

    id          = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id     = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    user_email  = db.Column(db.String(255), nullable=False)
    full_name   = db.Column(db.String(255), nullable=False)
    message     = db.Column(db.Text, nullable=True)
    status      = db.Column(db.String(20), nullable=False, default="pending")  # pending | approved | rejected
    created_at  = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    resolved_at = db.Column(db.DateTime, nullable=True)
    resolved_by = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    user     = db.relationship("User", foreign_keys=[user_id],     backref="recovery_requests")
    resolver = db.relationship("User", foreign_keys=[resolved_by])

    def to_dict(self):
        return {
            "id":         self.id,
            "userId":     self.user_id,
            "userEmail":  self.user_email,
            "fullName":   self.full_name,
            "message":    self.message,
            "status":     self.status,
            "createdAt":  self.created_at.isoformat() if self.created_at else None,
            "resolvedAt": self.resolved_at.isoformat() if self.resolved_at else None,
            "resolvedBy": self.resolved_by,
            "mfaEnabled": self.user.mfa_enabled if self.user else False,
        }

    def __init__(self, **kwargs):
        super(RecoveryRequest, self).__init__(**kwargs)
