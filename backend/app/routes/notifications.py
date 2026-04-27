from flask import Blueprint, jsonify, request
from app.extensions import db
from app.models.notification import Notification
from app.middleware.auth_middleware import jwt_required_custom, current_user
from app.middleware.csrf_middleware import csrf_protect

notifications_bp = Blueprint("notifications", __name__, url_prefix="/notifications")

@notifications_bp.get("")
@jwt_required_custom
def get_notifications():
    user = current_user()
    limit = min(int(request.args.get("limit", 20)), 50)
    
    notifs = Notification.query.filter_by(user_id=user.id).order_by(Notification.created_at.desc()).limit(limit).all()
    unread_count = Notification.query.filter_by(user_id=user.id, is_read=False).count()
    
    return jsonify({
        "notifications": [n.to_dict() for n in notifs],
        "unreadCount": unread_count
    }), 200

@notifications_bp.patch("/<notif_id>/read")
@csrf_protect
@jwt_required_custom
def mark_read(notif_id):
    user = current_user()
    notif = Notification.query.filter_by(id=notif_id, user_id=user.id).first()
    if not notif:
        return jsonify({"error": "NOT_FOUND"}), 404
        
    notif.is_read = True
    db.session.commit()
    return jsonify(notif.to_dict()), 200

@notifications_bp.patch("/read-all")
@csrf_protect
@jwt_required_custom
def mark_all_read():
    user = current_user()
    # [Security] Explicit user_id and is_read filter — never rely on implicit scoping
    Notification.query.filter(
        Notification.user_id == user.id,
        Notification.is_read == False  # noqa: E712
    ).update({"is_read": True}, synchronize_session="fetch")
    db.session.commit()
    return jsonify({"ok": True}), 200
