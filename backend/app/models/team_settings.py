from datetime import datetime, timezone
from app.extensions import db


class TeamSettings(db.Model):
    __tablename__ = "team_settings"

    id                      = db.Column(db.Integer, primary_key=True)
    allow_member_directory  = db.Column(db.Boolean, nullable=False, default=False)
    allow_member_invite     = db.Column(db.Boolean, nullable=False, default=False)
    allow_external_sharing  = db.Column(db.Boolean, nullable=False, default=False)
    updated_at              = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                                        onupdate=lambda: datetime.now(timezone.utc))
    updated_by_id           = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)

    updated_by = db.relationship("User", foreign_keys=[updated_by_id])

    def to_dict(self) -> dict:
        return {
            "allowMemberDirectory": self.allow_member_directory,
            "allowMemberInvite":    self.allow_member_invite,
            "allowExternalSharing": self.allow_external_sharing,
            "updatedAt":            self.updated_at.isoformat() if self.updated_at else None,
            "updatedBy":            self.updated_by.email if self.updated_by else None,
        }
