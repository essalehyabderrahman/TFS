from datetime import datetime, timezone
from app.extensions import db


class Contact(db.Model):
    __tablename__ = "contacts"

    id               = db.Column(db.String(36),  primary_key=True)
    owner_id         = db.Column(db.String(36),  db.ForeignKey("users.id"), nullable=False)
    contact_user_id  = db.Column(db.String(36),  db.ForeignKey("users.id"), nullable=True)  # null for external
    contact_email    = db.Column(db.String(255),  nullable=False)
    contact_name     = db.Column(db.String(255),  nullable=True)   # cached display name
    nickname         = db.Column(db.String(100),  nullable=True)   # user-set alias
    is_favorite      = db.Column(db.Boolean,      nullable=False, default=False)
    is_friend        = db.Column(db.Boolean,      nullable=False, default=False)
    source           = db.Column(db.String(20),   nullable=False, default="manual")
                                                  # manual | sent_to | received_from
    created_at       = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # One contact entry per (owner, email) pair
    __table_args__ = (
        db.UniqueConstraint("owner_id", "contact_email", name="uq_contact_owner_email"),
    )

    owner        = db.relationship("User", foreign_keys=[owner_id])
    contact_user = db.relationship("User", foreign_keys=[contact_user_id])

    def to_dict(self) -> dict:
        display_name = self.nickname or self.contact_name or self.contact_email
        return {
            "id":            self.id,
            "contactUserId": self.contact_user_id,
            "email":         self.contact_email,
            "name":          self.contact_name or self.contact_email,
            "displayName":   display_name,
            "nickname":      self.nickname,
            "isFavorite":    self.is_favorite,
            "isFriend":      self.is_friend,
            "source":        self.source,
            "isExternal":    self.contact_user_id is None,
            "createdAt":     self.created_at.isoformat(),
        }
