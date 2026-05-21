"""
Quota Service — Transfer storage quota calculation and enforcement.

Provides helpers to compute how much storage a user or group has consumed,
retrieve their quota information, and verify whether a new upload
would exceed their assigned quota.
"""

from app.extensions import db
from app.models.transfer import Transfer
from app.models.user import User


# ── User Quota ────────────────────────────────────────────────────────────────

def get_storage_used(user_id: str) -> int:
    """
    Returns the total size in bytes of all non-deleted transfers
    owned by the given user (personal transfers only — excludes group uploads).
    """
    total = (
        db.session.query(db.func.coalesce(db.func.sum(Transfer.size_bytes), 0))
        .filter_by(uploaded_by_id=user_id, is_deleted=False)
        .filter(Transfer.group_id.is_(None))
        .scalar()
    )
    return int(total)


def get_quota_info(user: User) -> dict:
    """
    Returns a summary dict describing the user's quota state.

    Keys:
        hasQuota      – True if the user has a storage limit set
        quotaBytes    – the limit in bytes (None if unlimited)
        usedBytes     – current storage consumed
        remainingBytes – bytes left (None if unlimited)
        usagePercent  – 0-100 float (None if unlimited)
    """
    used = get_storage_used(user.id)
    quota = user.storage_quota_bytes

    if quota is None:
        return {
            "hasQuota": False,
            "quotaBytes": None,
            "usedBytes": used,
            "remainingBytes": None,
            "usagePercent": None,
        }

    remaining = max(0, quota - used)
    percent = round((used / quota) * 100, 1) if quota > 0 else 0.0

    return {
        "hasQuota": True,
        "quotaBytes": quota,
        "usedBytes": used,
        "remainingBytes": remaining,
        "usagePercent": percent,
    }


def check_quota(user: User, incoming_size: int) -> dict:
    """
    Verify whether the user can upload `incoming_size` bytes.

    Returns:
        {"ok": True}  if allowed
        {"ok": False, "error": "QUOTA_EXCEEDED", ...}  if blocked
    """
    quota = user.storage_quota_bytes

    # No quota set → always allow
    if quota is None:
        return {"ok": True}

    used = get_storage_used(user.id)
    remaining = max(0, quota - used)

    if used + incoming_size > quota:
        return {
            "ok": False,
            "error": "QUOTA_EXCEEDED",
            "quotaBytes": quota,
            "usedBytes": used,
            "remainingBytes": remaining,
            "requiredBytes": incoming_size,
        }

    return {"ok": True}


# ── Group Quota ───────────────────────────────────────────────────────────────

def get_group_storage_used(group_id: str) -> int:
    """
    Returns the total size in bytes of all non-deleted transfers
    belonging to the given group (regardless of uploader).
    """
    total = (
        db.session.query(db.func.coalesce(db.func.sum(Transfer.size_bytes), 0))
        .filter_by(group_id=group_id, is_deleted=False)
        .scalar()
    )
    return int(total)


def get_group_quota_info(group) -> dict:
    """
    Returns a summary dict describing the group's quota state.
    Same structure as get_quota_info() for consistency.
    """
    used = get_group_storage_used(group.id)
    quota = group.storage_quota_bytes

    if quota is None:
        return {
            "hasQuota": False,
            "quotaBytes": None,
            "usedBytes": used,
            "remainingBytes": None,
            "usagePercent": None,
        }

    remaining = max(0, quota - used)
    percent = round((used / quota) * 100, 1) if quota > 0 else 0.0

    return {
        "hasQuota": True,
        "quotaBytes": quota,
        "usedBytes": used,
        "remainingBytes": remaining,
        "usagePercent": percent,
    }


def check_group_quota(group, incoming_size: int) -> dict:
    """
    Verify whether the group can accept `incoming_size` bytes.

    Returns:
        {"ok": True}  if allowed
        {"ok": False, "error": "GROUP_QUOTA_EXCEEDED", ...}  if blocked
    """
    quota = group.storage_quota_bytes

    # No quota set → always allow
    if quota is None:
        return {"ok": True}

    used = get_group_storage_used(group.id)
    remaining = max(0, quota - used)

    if used + incoming_size > quota:
        return {
            "ok": False,
            "error": "GROUP_QUOTA_EXCEEDED",
            "quotaBytes": quota,
            "usedBytes": used,
            "remainingBytes": remaining,
            "requiredBytes": incoming_size,
        }

    return {"ok": True}
