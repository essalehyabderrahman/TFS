import uuid
from flask import Blueprint, request, jsonify
from app.extensions import db
from app.models.contact import Contact
from app.models.user import User
from app.middleware.auth_middleware import jwt_required_custom, current_user
from app.middleware.csrf_middleware import csrf_protect

contacts_bp = Blueprint("contacts", __name__, url_prefix="/contacts")


def _auto_add_contact(owner_id: str, email: str, source: str) -> None:
    """
    Silently upsert a contact entry from a transfer event.
    If the contact already exists (any source), do nothing.
    If the email belongs to a platform user, resolve their name.
    Never raises — called from file_service as a fire-and-forget side effect.
    """
    try:
        existing = Contact.query.filter_by(
            owner_id=owner_id, contact_email=email
        ).first()
        if existing:
            return  # already known, don't overwrite manual data

        target = User.query.filter_by(email=email).first()
        contact = Contact(
            id=str(uuid.uuid4()),
            owner_id=owner_id,
            contact_user_id=target.id if target else None,
            contact_email=email,
            contact_name=target.name if target else None,
            source=source,
        )
        db.session.add(contact)
        # Caller commits — do not commit here to avoid nested transactions
    except Exception:
        pass  # Never break the upload flow


# ── GET /contacts ─────────────────────────────────────────────────────────────
@contacts_bp.get("")
@jwt_required_custom
def list_contacts():
    """
    Returns all contacts for the current user grouped into four sections:
    favorites, friends, sent_to, received_from.
    Contacts that appear in multiple sections are only included once
    (priority: favorites > friends > sent_to > received_from).
    """
    user = current_user()
    all_contacts = (
        Contact.query
        .filter_by(owner_id=user.id)
        .order_by(Contact.is_favorite.desc(), Contact.contact_name)
        .all()
    )

    seen = set()
    favorites     = []
    friends       = []
    sent_to       = []
    received_from = []

    def _add(bucket: list, c: Contact):
        if c.id not in seen:
            seen.add(c.id)
            bucket.append(c.to_dict())

    for c in all_contacts:
        if c.is_favorite:
            _add(favorites, c)
        elif c.is_friend:
            _add(friends, c)
        elif c.source == "sent_to":
            _add(sent_to, c)
        elif c.source == "received_from":
            _add(received_from, c)

    return jsonify({
        "favorites":    favorites,
        "friends":      friends,
        "sentTo":       sent_to,
        "receivedFrom": received_from,
        "all":          [c.to_dict() for c in all_contacts],
    }), 200


# ── POST /contacts ────────────────────────────────────────────────────────────
@contacts_bp.post("")
@csrf_protect
@jwt_required_custom
def add_contact():
    """Manually add a contact by email. Works for both platform and external users."""
    user = current_user()
    data = request.get_json(silent=True) or {}
    email    = data.get("email", "").strip().lower()
    nickname = data.get("nickname", "").strip() or None

    if not email:
        return jsonify({"error": "MISSING_EMAIL"}), 400

    if email == user.email:
        return jsonify({"error": "CANNOT_ADD_SELF"}), 400

    existing = Contact.query.filter_by(owner_id=user.id, contact_email=email).first()
    if existing:
        return jsonify({"error": "ALREADY_IN_CONTACTS"}), 409

    target = User.query.filter_by(email=email).first()
    contact = Contact(
        id=str(uuid.uuid4()),
        owner_id=user.id,
        contact_user_id=target.id if target else None,
        contact_email=email,
        contact_name=target.name if target else None,
        nickname=nickname,
        is_friend=True,
        source="manual",
    )
    db.session.add(contact)
    db.session.commit()
    return jsonify(contact.to_dict()), 201


# ── PATCH /contacts/<id> ──────────────────────────────────────────────────────
@contacts_bp.patch("/<contact_id>")
@csrf_protect
@jwt_required_custom
def update_contact(contact_id):
    """Update favorite, friend flag, or nickname."""
    user    = current_user()
    contact = db.session.get(Contact, contact_id)
    if not contact or contact.owner_id != user.id:
        return jsonify({"error": "NOT_FOUND"}), 404

    data = request.get_json(silent=True) or {}
    if "isFavorite" in data:
        contact.is_favorite = bool(data["isFavorite"])
    if "isFriend" in data:
        contact.is_friend = bool(data["isFriend"])
    if "nickname" in data:
        contact.nickname = data["nickname"].strip() or None

    db.session.commit()
    return jsonify(contact.to_dict()), 200


# ── DELETE /contacts/<id> ─────────────────────────────────────────────────────
@contacts_bp.delete("/<contact_id>")
@csrf_protect
@jwt_required_custom
def delete_contact(contact_id):
    user    = current_user()
    contact = db.session.get(Contact, contact_id)
    if not contact or contact.owner_id != user.id:
        return jsonify({"error": "NOT_FOUND"}), 404

    db.session.delete(contact)
    db.session.commit()
    return jsonify({"deleted": True}), 200
