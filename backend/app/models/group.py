from datetime import datetime, timezone
from app.extensions import db


class Group(db.Model):
    __tablename__ = "groups"

    id            = db.Column(db.String(36), primary_key=True)
    name          = db.Column(db.String(120), nullable=False, unique=True)
    description   = db.Column(db.String(255), nullable=True)
    created_by_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    created_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    created_by    = db.relationship("User", foreign_keys=[created_by_id])
    members       = db.relationship("GroupMember", back_populates="group",
                                    cascade="all, delete-orphan")
    settings      = db.relationship("GroupSettings", back_populates="group",
                                    uselist=False, cascade="all, delete-orphan")
    transfers     = db.relationship("Transfer", back_populates="group",
                                    foreign_keys="Transfer.group_id")

    def to_dict(self) -> dict:
        return {
            "id":          self.id,
            "name":        self.name,
            "description": self.description or "",
            "createdBy":   self.created_by.email if self.created_by else "system",
            "createdAt":   self.created_at.isoformat(),
            "memberCount": len(self.members),
        }


class GroupMember(db.Model):
    __tablename__ = "group_members"

    id            = db.Column(db.String(36), primary_key=True)
    group_id      = db.Column(db.String(36), db.ForeignKey("groups.id"), nullable=False)
    user_id       = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    role          = db.Column(db.String(20), nullable=False, default="member")  # admin | member
    joined_at     = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    invited_by_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)

    # Relationships
    group         = db.relationship("Group", back_populates="members")
    user          = db.relationship("User", foreign_keys=[user_id])
    invited_by    = db.relationship("User", foreign_keys=[invited_by_id])

    __table_args__ = (
        db.UniqueConstraint("group_id", "user_id", name="uq_group_member"),
    )

    def to_dict(self) -> dict:
        return {
            "id":          self.id,
            "groupId":     self.group_id,
            "userId":      self.user_id,
            "userEmail":   self.user.email if self.user else "",
            "userName":    self.user.name if self.user else "",
            "userAvatar":  self.user.avatar if self.user else "",
            "role":        self.role,
            "joinedAt":    self.joined_at.isoformat(),
            "invitedBy":   self.invited_by.email if self.invited_by else "",
        }


class GroupSettings(db.Model):
    __tablename__ = "group_settings"

    id                     = db.Column(db.String(36), primary_key=True)
    group_id               = db.Column(db.String(36), db.ForeignKey("groups.id"),
                                       nullable=False, unique=True)
    allow_member_directory = db.Column(db.Boolean, nullable=False, default=False)
    allow_member_invite    = db.Column(db.Boolean, nullable=False, default=False)
    allow_external_sharing = db.Column(db.Boolean, nullable=False, default=False)
    allow_group_transfers  = db.Column(db.Boolean, nullable=False, default=False)
    updated_by_id          = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    updated_at             = db.Column(db.DateTime,
                                       default=lambda: datetime.now(timezone.utc),
                                       onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    group      = db.relationship("Group", back_populates="settings")
    updated_by = db.relationship("User", foreign_keys=[updated_by_id])

    def to_dict(self) -> dict:
        return {
            "groupId":              self.group_id,
            "allowMemberDirectory": self.allow_member_directory,
            "allowMemberInvite":    self.allow_member_invite,
            "allowExternalSharing": self.allow_external_sharing,
            "allowGroupTransfers":  self.allow_group_transfers,
            "updatedAt":            self.updated_at.isoformat() if self.updated_at else None,
            "updatedBy":            self.updated_by.email if self.updated_by else None,
        }
