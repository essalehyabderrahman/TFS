from datetime import datetime, timezone
from app.extensions import db

class Notification(db.Model):
    __tablename__ = "notifications"

    id         = db.Column(db.String(36), primary_key=True)
    user_id    = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False, index=True)
    title      = db.Column(db.String(255), nullable=False)
    body       = db.Column(db.Text, nullable=False)
    type       = db.Column(db.String(20), nullable=False, default="info") # info, success, warning
    is_read    = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship("User", backref=db.backref("notifications", lazy="dynamic", cascade="all, delete-orphan"))

    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "title": self.title,
            "body": self.body,
            "type": self.type,
            "isRead": self.is_read,
            "createdAt": self.created_at.isoformat()
        }
