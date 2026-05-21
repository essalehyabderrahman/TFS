"""
Quota Requests routes — user submission and admin approval/rejection.
"""

import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from app.extensions import db
from app.models.quota_request import QuotaRequest
from app.models.user import User
from app.models.notification import Notification
from app.middleware.auth_middleware import jwt_required_custom, require_role, current_user
from app.middleware.csrf_middleware import csrf_protect


quota_requests_bp = Blueprint("quota_requests", __name__, url_prefix="/quota-requests")


def _format_bytes(b: int) -> str:
    """Human-readable byte size."""
    if b >= 1073741824:
        return f"{b / 1073741824:.1f} GB"
    return f"{b / 1048576:.0f} MB"


# ── POST /quota-requests — Submit a new request ──────────────────────────────
@quota_requests_bp.post("")
@csrf_protect
@jwt_required_custom
def submit_request():
    user = current_user()
    data = request.get_json(silent=True) or {}

    justification = (data.get("justification") or "").strip()
    if not justification or len(justification) < 20:
        return jsonify({"error": "JUSTIFICATION_TOO_SHORT"}), 400

    try:
        requested_bytes = int(data.get("requestedBytes", 0))
        if requested_bytes <= 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({"error": "INVALID_REQUESTED_AMOUNT"}), 400

    # Block if a pending request already exists
    existing = QuotaRequest.query.filter_by(user_id=user.id, status="pending").first()
    if existing:
        return jsonify({"error": "PENDING_REQUEST_EXISTS"}), 409

    qr = QuotaRequest(
        id=str(uuid.uuid4()),
        user_id=user.id,
        justification=justification,
        requested_bytes=requested_bytes,
        status="pending",
    )
    db.session.add(qr)

    # Notify all admins
    admins = User.query.filter_by(role="admin").all()
    for admin in admins:
        db.session.add(Notification(
            id=str(uuid.uuid4()),
            user_id=admin.id,
            title="New Quota Request",
            body=f"{user.name} requested +{_format_bytes(requested_bytes)} of storage.",
            type="info",
        ))

    db.session.commit()
    return jsonify(qr.to_dict()), 201


# ── GET /quota-requests/mine — User's own requests ──────────────────────────
@quota_requests_bp.get("/mine")
@jwt_required_custom
def my_requests():
    user = current_user()
    requests = (
        QuotaRequest.query
        .filter_by(user_id=user.id)
        .order_by(QuotaRequest.created_at.desc())
        .limit(20)
        .all()
    )
    return jsonify([r.to_dict() for r in requests]), 200


# ── GET /quota-requests — Admin: list pending requests ───────────────────────
@quota_requests_bp.get("")
@require_role("admin")
def list_pending():
    status_filter = request.args.get("status", "pending")
    query = QuotaRequest.query
    if status_filter != "all":
        query = query.filter_by(status=status_filter)
    requests = query.order_by(QuotaRequest.created_at.desc()).limit(100).all()
    return jsonify([r.to_dict() for r in requests]), 200


# ── PATCH /quota-requests/<id> — Admin: approve or reject ────────────────────
@quota_requests_bp.patch("/<request_id>")
@csrf_protect
@require_role("admin")
def resolve_request(request_id):
    admin = current_user()
    qr = db.session.get(QuotaRequest, request_id)
    if not qr:
        return jsonify({"error": "NOT_FOUND"}), 404

    if qr.status != "pending":
        return jsonify({"error": "ALREADY_RESOLVED"}), 409

    data = request.get_json(silent=True) or {}
    action = data.get("action")  # "approve" or "reject"
    admin_note = (data.get("adminNote") or "").strip() or None

    if action not in ("approve", "reject"):
        return jsonify({"error": "INVALID_ACTION"}), 400

    target_user = db.session.get(User, qr.user_id)
    if not target_user:
        return jsonify({"error": "USER_NOT_FOUND"}), 404

    qr.admin_id = admin.id
    qr.admin_note = admin_note
    qr.resolved_at = datetime.now(timezone.utc)

    if action == "approve":
        qr.status = "approved"
        # Update the user's quota
        current_quota = target_user.storage_quota_bytes or 0
        target_user.storage_quota_bytes = current_quota + qr.requested_bytes

        # Notify the user
        db.session.add(Notification(
            id=str(uuid.uuid4()),
            user_id=target_user.id,
            title="Quota Request Approved ✅",
            body=f"Your request for +{_format_bytes(qr.requested_bytes)} has been approved. "
                 f"New quota: {_format_bytes(target_user.storage_quota_bytes)}.",
            type="success",
        ))
    else:
        qr.status = "rejected"
        note_msg = f" Reason: {admin_note}" if admin_note else ""
        db.session.add(Notification(
            id=str(uuid.uuid4()),
            user_id=target_user.id,
            title="Quota Request Rejected",
            body=f"Your request for +{_format_bytes(qr.requested_bytes)} has been declined.{note_msg}",
            type="warning",
        ))

    db.session.commit()
    return jsonify(qr.to_dict()), 200
