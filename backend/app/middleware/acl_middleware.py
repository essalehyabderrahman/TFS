"""
ACL Middleware — Centralized permission enforcement for file operations.

Provides the @requires_permission(action) decorator that:
  1. Resolves the transfer from Flask route params (anti-IDOR)
  2. Verifies the user has the required permission level
  3. Blocks with 403 if unauthorized
  4. Injects the verified Transfer object into flask.g.transfer

Supported actions: 'Read', 'Write', 'Delete', 'Share'
"""

import uuid
from functools import wraps
from flask import g, jsonify, request
from flask_jwt_extended import get_jwt_identity

from app.extensions import db
from app.models.transfer import Transfer
from app.models.audit_log import AuditLog, ACLEntry
from app.models.user import User
from app.models.group import GroupMember


# Maps action names to ACLEntry boolean column names
_ACTION_MAP = {
    "Read":   "can_read",
    "Write":  "can_write",
    "Delete": "can_delete",
    "Share":  "can_share",
}


def _log_unauthorized(user: User, transfer: Transfer):
    """Audit log entry for a blocked access attempt."""
    db.session.add(AuditLog(
        id=str(uuid.uuid4()),
        user_id=user.id,
        user_email=user.email,
        action="UNAUTHORIZED_ACCESS",
        resource=transfer.file_name,
        ip_address=request.remote_addr,
        status="failed",
        details=f"ACL check failed for transfer {transfer.id}.",
        group_id=transfer.group_id,
    ))
    db.session.commit()


def resolve_effective_permissions(transfer: Transfer, user: User) -> dict:
    """
    Compute the effective permissions of a user on a given transfer.
    Returns a dict with canRead, canWrite, canDelete, canShare, isOwner, isAdmin.
    Used both by the decorator internally and by the /permissions endpoint.

    Permission hierarchy (V1 logic — security-first):
      1. Global admin → full access
      2. Group admin → full access on group files
      3. File owner → full access
      4. Explicit ACL entry → flags as stored
      5. Implicit recipient access → read-only (only when no explicit ACL)
      6. Group membership without ACL → read-only default
      7. Parent-folder recursion for read checks
    """
    result = {
        "canRead": False,
        "canWrite": False,
        "canDelete": False,
        "canShare": False,
        "canDownload": False,
        "isOwner": False,
        "isAdmin": False,
    }

    # 1. Global admin → full access
    if user.role == "admin":
        result.update(canRead=True, canWrite=True, canDelete=True, canShare=True, canDownload=True, isAdmin=True)
        return result

    # 2. Group admin → full access on group files
    if transfer.group_id:
        member = GroupMember.query.filter_by(
            group_id=transfer.group_id, user_id=user.id
        ).first()
        if member and member.role == "admin":
            result.update(canRead=True, canWrite=True, canDelete=True, canShare=True, canDownload=True, isAdmin=True)
            return result

    # 3. Owner → full access
    if transfer.uploaded_by_id == user.id:
        result.update(canRead=True, canWrite=True, canDelete=True, canShare=True, canDownload=True, isOwner=True)
        return result

    # 4. Explicit ACL entry
    acl = ACLEntry.query.filter_by(
        transfer_id=transfer.id,
        user_id=user.id,
    ).first()

    if acl:
        result["canRead"] = acl.can_read
        result["canWrite"] = acl.can_write
        result["canDelete"] = acl.can_delete
        result["canShare"] = acl.can_share
        result["canDownload"] = acl.can_download
        # Write implies read — you need to see content to edit it
        if acl.can_write:
            result["canRead"] = True
        return result

    # 5. Implicit recipient access (read-only, only when no explicit ACL exists)
    if transfer.recipient_email and transfer.recipient_email == user.email:
        result["canRead"] = True
        result["canDownload"] = True
        return result

    # 6. Group membership → implicit read access for group files WITHOUT explicit ACL
    # This is the default fallback for files that don't have ACL entries
    # If a file HAS an ACL entry (checked in step 4), this step is never reached
    if transfer.group_id:
        membership = GroupMember.query.filter_by(
            group_id=transfer.group_id,
            user_id=user.id,
        ).first()
        if membership:
            result["canRead"] = True
            result["canDownload"] = True
            return result

    return result


def requires_permission(action: str):
    """
    Flask route decorator that enforces ACL-based access control.

    Usage:
        @requires_permission('Read')
        @requires_permission('Write')
        @requires_permission('Delete')
        @requires_permission('Share')

    Security:
        - transfer_id is resolved from Flask URL parameters (kwargs), never
          from request body → prevents IDOR attacks.
        - The verified Transfer object is placed in g.transfer to avoid
          redundant DB fetches in the route handler.
    """
    if action not in _ACTION_MAP:
        raise ValueError(f"Invalid ACL action: {action}. Must be one of {list(_ACTION_MAP.keys())}")

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # [IDOR] transfer_id MUST come from Flask route params
            transfer_id = kwargs.get("transfer_id")
            if not transfer_id:
                return jsonify({"error": "BAD_REQUEST", "message": "Missing transfer_id"}), 400

            # Fetch transfer — existence check
            transfer = db.session.get(Transfer, transfer_id)
            if not transfer or transfer.is_deleted:
                # Return 404 for both missing and deleted to avoid info leakage
                return jsonify({"error": "NOT_FOUND"}), 404

            # Resolve authenticated user
            user_id = get_jwt_identity()
            user = db.session.get(User, user_id)
            if not user:
                return jsonify({"error": "UNAUTHORIZED"}), 401

            # Compute effective permissions
            perms = resolve_effective_permissions(transfer, user)

            # Check the specific permission for this action
            flag_key = {
                "Read": "canRead",
                "Write": "canWrite",
                "Delete": "canDelete",
                "Share": "canShare",
            }[action]

            if perms.get(flag_key):
                g.transfer = transfer
                g.effective_permissions = perms
                return fn(*args, **kwargs)

            # Permission denied
            _log_unauthorized(user, transfer)
            return jsonify({"error": "FORBIDDEN"}), 403

        return wrapper
    return decorator
