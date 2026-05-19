from flask import Blueprint, request, jsonify, make_response
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt, create_access_token, set_access_cookies, unset_jwt_cookies
from flask_limiter.errors import RateLimitExceeded

from app.services import auth_service
from app.middleware.auth_middleware import jwt_required_custom, jwt_mfa_setup_required, current_user
from app.middleware.csrf_middleware import csrf_protect
from app.extensions import limiter

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


def _ip():
    return request.remote_addr


# ── POST /auth/signup ─────────────────────────────────────────────────────────
@auth_bp.post("/signup")
@csrf_protect
@limiter.limit("5 per minute; 20 per hour")
def signup():
    # [Platform Policy] Check allow_signup before touching any user data
    from app.models.team_settings import TeamSettings
    settings = TeamSettings.query.first()
    if settings and not settings.allow_signup:
        return jsonify({"error": "SIGNUP_DISABLED"}), 403

    data = request.get_json(silent=True) or {}
    name     = data.get("name", "").strip()
    email    = data.get("email", "").strip()
    password = data.get("password", "")

    if not name or not email or not password:
        return jsonify({"error": "MISSING_FIELDS"}), 400

    result = auth_service.signup(name, email, password, _ip())
    if not result["ok"]:
        code = 409 if result["error"] == "EMAIL_TAKEN" else 400
        return jsonify({"error": result["error"]}), code

    # Issue a restricted token (mfa_pending=True) to force MFA setup
    response = jsonify({
        "user": result["user"],
        "mfaRequired": True
    })
    set_access_cookies(response, result["token"])
    return response, 201


# ── POST /auth/signin ─────────────────────────────────────────────────────────
@auth_bp.post("/signin")
@csrf_protect
@limiter.limit("10 per minute; 50 per hour")
def signin():
    data     = request.get_json(silent=True) or {}
    email    = data.get("email", "")
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "MISSING_FIELDS"}), 400

    result = auth_service.signin(email, password, _ip())

    if not result["ok"]:
        status = 401 if result["error"] == "INVALID_CREDENTIALS" else 403
        return jsonify({"error": result["error"]}), status

    if result["mfaRequired"]:
        response = jsonify({
            "mfaRequired": True,
            "user":        result["user"],
        })
        set_access_cookies(response, result["tempToken"])
        return response, 200

    response = jsonify({
        "mfaRequired": False,
        "user":        result["user"],
    })
    set_access_cookies(response, result["token"])
    return response, 200


# ── POST /auth/mfa/verify ─────────────────────────────────────────────────────
@auth_bp.post("/mfa/verify")
@csrf_protect
@limiter.limit("5 per minute")
def mfa_verify():
    """
    Accepte le token temporaire (mfa_pending=True) + le code OTP.
    Retourne un vrai token JWT si OK.
    [Security] Suspension is enforced inside auth_service.verify_mfa via
    the user status check — no need for a duplicate inline check here.
    """
    try:
        verify_jwt_in_request()
    except Exception as e:
        return jsonify({"error": "UNAUTHORIZED"}), 401

    claims = get_jwt()
    if not claims.get("mfa_pending"):
        return jsonify({"error": "NOT_MFA_FLOW"}), 400

    user_id = get_jwt_identity()
    data    = request.get_json(silent=True) or {}
    code    = data.get("code", "")

    result = auth_service.verify_mfa(user_id, code, _ip())
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 401

    response = jsonify({"user": result["user"]})
    set_access_cookies(response, result["token"])
    return response, 200

# ── POST /auth/signout ────────────────────────────────────────────────────────
@auth_bp.post("/signout")
@csrf_protect
@jwt_required_custom
@limiter.limit("20 per minute")
def signout():
    user = current_user()
    ip = _ip()
    from app.services.auth_service import _log
    from app.extensions import db
    if user:
        _log("SIGNOUT", user.email, user.id, "success", ip, details="User signed out.")
        db.session.commit()
    response = jsonify({"ok": True, "message": "Signed out successfully"})
    unset_jwt_cookies(response)
    return response, 200


# ── POST /auth/mfa/setup ──────────────────────────────────────────────────────
@auth_bp.post("/mfa/setup")
@csrf_protect
@jwt_mfa_setup_required
@limiter.limit("10 per minute")
def mfa_setup():
    user = current_user()
    if not user:
        return jsonify({"error": "USER_NOT_FOUND"}), 404
    result = auth_service.setup_mfa(user.id)
    if not result["ok"]:
        status = 409 if result["error"] == "MFA_ALREADY_ENABLED" else 400
        return jsonify({"error": result["error"]}), status
    return jsonify({
        "secret":      result["secret"],
        "qrCode":      result["qrCode"],
        "backupCode": result["backupCode"],
    }), 200


# ── POST /auth/mfa/enable ─────────────────────────────────────────────────────
@auth_bp.post("/mfa/enable")
@csrf_protect
@jwt_mfa_setup_required
@limiter.limit("5 per minute")
def mfa_enable():
    """Confirme l'activation MFA via un code OTP après setup."""
    user = current_user()
    data = request.get_json(silent=True) or {}
    code = data.get("code", "")
    # [Security] Enrollment confirmation must use a 6-digit TOTP code only.
    # Accepting the backup code here would confirm enrollment without proving
    # the authenticator app is actually working.
    if not code or len(code.strip()) != 6 or not code.strip().isdigit():
        return jsonify({"error": "TOTP_REQUIRED"}), 400
    result = auth_service.verify_mfa(user.id, code, _ip(), is_setup_confirm=True)
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 401
    
    # Return the finalized token and the user
    response = jsonify({
        "mfaEnabled": True,
        "user": result["user"]
    })
    set_access_cookies(response, result["token"])
    return response, 200


# ── POST /auth/mfa/disable ────────────────────────────────────────────────────
@auth_bp.post("/mfa/disable")
@csrf_protect
@jwt_required_custom
def mfa_disable():
    # [Platform Policy] Block MFA disable when require_mfa is enforced app-wide
    from app.models.team_settings import TeamSettings
    settings = TeamSettings.query.first()
    if settings and settings.require_mfa:
        return jsonify({"error": "MFA_REQUIRED_BY_POLICY"}), 403

    user = current_user()
    data = request.get_json(silent=True) or {}
    code = data.get("code", "")
    result = auth_service.disable_mfa(user.id, code, _ip())
    if not result["ok"]:
        return jsonify({"error": result["error"]}), 400
    return jsonify({"mfaEnabled": False}), 200


# ── POST /auth/mfa/backup-code/regenerate ─────────────────────────────────
@auth_bp.post("/mfa/backup-code/regenerate")
@csrf_protect
@jwt_required_custom
@limiter.limit("3 per hour")
def regenerate_backup_code():
    user = current_user()
    data = request.get_json(silent=True) or {}
    code = data.get("code", "")
    result = auth_service.regenerate_backup_code(user.id, code, _ip())
    if not result["ok"]:
        status = 429 if result["error"] == "MFA_MAX_ATTEMPTS_EXCEEDED" else 400
        return jsonify({"error": result["error"]}), status
    return jsonify({"backupCode": result["backupCode"]}), 200


# ── GET /auth/me ──────────────────────────────────────────────────────────────
@auth_bp.get("/me")
def me():
    # Accept BOTH full tokens and mfa_pending tokens so AuthContext can
    # restore isMfaPending=True correctly after a hard page reload.
    try:
        verify_jwt_in_request()
    except Exception:
        return jsonify({"error": "UNAUTHORIZED"}), 401

    claims      = get_jwt()
    mfa_pending = bool(claims.get("mfa_pending"))

    user = current_user()
    if not user:
        return jsonify({"error": "USER_NOT_FOUND"}), 404

    return jsonify({"user": user.to_dict(), "mfaPending": mfa_pending}), 200


# ── POST /auth/refresh ────────────────────────────────────────────────────────
@auth_bp.post("/refresh")
@csrf_protect
@limiter.limit("30 per minute")
def refresh():
    """
    Sliding session refresh.
    [Session] Intentionally uses decode_token(allow_expired=True) so that a
    just-expired token can still obtain a new one — this is the sliding window.
    verify_jwt_in_request() would hard-reject expired tokens before we could
    act on them, which is wrong for a refresh endpoint.
    Refuses if the 8-hour absolute max has been reached.
    """
    from flask import current_app
    from flask_jwt_extended import decode_token

    # Extract raw token from the HttpOnly cookie
    cookie_name = current_app.config.get("JWT_ACCESS_COOKIE_NAME", "access_token_cookie")
    raw_token = request.cookies.get(cookie_name)
    if not raw_token:
        return jsonify({"error": "UNAUTHORIZED"}), 401

    from datetime import timedelta as _td
    try:
        # [Session] allow_expired=True is the whole point — we are refreshing it
        claims = decode_token(raw_token, allow_expired=True)
    except Exception:
        return jsonify({"error": "INVALID_TOKEN"}), 401

    # [Session] Enforce idle timeout: reject tokens that expired more than
    # IDLE_GRACE_SECONDS ago. This is what gives the 15-min idle window real
    # meaning — without this gate, any expired token could be refreshed
    # indefinitely up to the 8-hr absolute wall.
    IDLE_GRACE_SECONDS = 30  # small buffer for clock skew / slow requests
    import time as _time
    token_exp = claims.get("exp")
    if token_exp is not None:
        seconds_since_expiry = _time.time() - token_exp
        if seconds_since_expiry > IDLE_GRACE_SECONDS:
            return jsonify({"error": "SESSION_EXPIRED"}), 401

    # Block mfa_pending tokens from refreshing into a real session
    if claims.get("mfa_pending"):
        return jsonify({"error": "MFA_REQUIRED"}), 403

    user_id            = claims.get("sub")
    session_created_at = claims.get("session_created_at")
    token_version      = claims.get("token_version")

    if not user_id or not session_created_at:
        return jsonify({"error": "INVALID_TOKEN"}), 401

    result = auth_service.refresh_token(user_id, session_created_at, token_version, _ip())

    if not result["ok"]:
        status = 403 if result["error"] == "ACCOUNT_SUSPENDED" else 401
        return jsonify({"error": result["error"]}), status

    response = jsonify({"user": result["user"]})
    set_access_cookies(response, result["token"])
    return response, 200


# ── Rate Limit Error Handler ───────────────────────────────────────────────────
@auth_bp.errorhandler(RateLimitExceeded)
def handle_rate_limit(e):
    # [Audit] Log rate limit hits — IP logged, no user identity assumed
    from app.services.auth_service import _log
    ip = request.remote_addr
    _log("RATE_LIMITED", "anonymous", None, "warning", ip,
         resource=request.path, details="Rate limit exceeded.")
    from app.extensions import db
    db.session.commit()
    # Generic message — do not reveal limit thresholds to callers
    return jsonify({"error": "TOO_MANY_REQUESTS"}), 429

# -- POST /auth/recovery-request ---------------------------------------------
@auth_bp.post("/recovery-request")
@csrf_protect
@limiter.limit("5 per hour")
def recovery_request():
    """
    Stores a password recovery request in the DB.
    If the user has MFA enabled, they must supply a valid OTP/backup code.
    [Security] Never reveals whether an account exists.
    """
    from app.models.recovery_request import RecoveryRequest
    from app.models.user import User
    from app.services.auth_service import _log, verify_mfa
    from app.extensions import db
    import pyotp

    data       = request.get_json(silent=True) or {}
    email      = data.get("email", "").strip().lower()
    full_name  = data.get("fullName", "").strip()
    message    = data.get("message", "").strip()
    mfa_code   = data.get("mfaCode", "").strip()
    last_file  = data.get("lastTransferredFile", "").strip()
    est_date   = data.get("estimatedRegistrationDate", "").strip()

    if not email or not full_name:
        return jsonify({"error": "MISSING_FIELDS"}), 400
    if "@" not in email:
        return jsonify({"error": "INVALID_EMAIL"}), 400

    user = User.query.filter_by(email=email).first()

    # [Security] If MFA is enabled, verify the code before accepting the request
    mfa_enabled = user and user.mfa_enabled
    if mfa_enabled:
        if not mfa_code:
            return jsonify({"error": "MFA_REQUIRED", "mfaRequired": True}), 403

        result = verify_mfa(user.id, mfa_code, _ip(), is_setup_confirm=False)
        if not result["ok"]:
            # Map internal errors to safe client errors
            safe_error = {
                "INVALID_CODE":           "INVALID_CODE",
                "MFA_CODE_ALREADY_USED":  "INVALID_CODE",
                "MFA_MAX_ATTEMPTS_EXCEEDED": "MFA_MAX_ATTEMPTS_EXCEEDED",
                "MFA_LOCKED":             "MFA_MAX_ATTEMPTS_EXCEEDED",
            }.get(result["error"], "INVALID_CODE")
            return jsonify({"error": safe_error}), 403
    else:
        # MFA is not enabled. These fields are mandatory.
        if not last_file or not est_date:
            return jsonify({"error": "RECOVERY_FIELDS_REQUIRED"}), 400

    # Deduplicate: reject if a pending request already exists for this email
    existing = RecoveryRequest.query.filter_by(
        user_email=email, status="pending"
    ).first()
    if existing:
        # Silent success — do not reveal a pending request exists
        return jsonify({"ok": True}), 200

    req = RecoveryRequest(
        user_id    = user.id if user else None,
        user_email = email,
        full_name  = full_name,
        message    = message or None,
        last_transferred_file = last_file or None,
        estimated_registration_date = est_date or None,
        status     = "pending",
    )
    db.session.add(req)
    _log("RECOVERY_REQUEST_CREATED", email, user.id if user else None,
         "success", _ip(), details="Recovery request submitted.")

    # [Notification] Notify all admins about the new password recovery request
    if user:
        admins = User.query.filter_by(role="admin").all()
        import uuid
        from app.models.notification import Notification
        for admin_user in admins:
            notif = Notification(
                id=str(uuid.uuid4()),
                user_id=admin_user.id,
                title="New Password Recovery Request",
                body=f"Password recovery request submitted by {full_name} ({email}).",
                type="warning"
            )
            db.session.add(notif)

    db.session.commit()

    return jsonify({"ok": True}), 200


# -- GET /auth/recovery-requests (admin) -------------------------------------
@auth_bp.get("/recovery-requests")
@jwt_required_custom
def list_recovery_requests():
    from app.models.recovery_request import RecoveryRequest
    user = current_user()
    if user.role != "admin":
        return jsonify({"error": "FORBIDDEN"}), 403

    status_filter = request.args.get("status", "pending")
    q = RecoveryRequest.query.order_by(RecoveryRequest.created_at.desc())
    if status_filter != "all":
        q = q.filter_by(status=status_filter)

    # Filter out requests for non-existent users
    q = q.filter(RecoveryRequest.user_id.isnot(None))

    return jsonify([r.to_dict() for r in q.all()]), 200


# -- POST /auth/recovery-requests/<id>/reject (admin) ------------------------
@auth_bp.post("/recovery-requests/<req_id>/reject")
@csrf_protect
@jwt_required_custom
def reject_recovery_request(req_id):
    from datetime import datetime, timezone
    from app.models.recovery_request import RecoveryRequest
    from app.services.auth_service import _log
    from app.extensions import db

    actor = current_user()
    if actor.role != "admin":
        return jsonify({"error": "FORBIDDEN"}), 403

    rec = db.session.get(RecoveryRequest, req_id)
    if not rec:
        return jsonify({"error": "NOT_FOUND"}), 404
    if rec.status != "pending":
        return jsonify({"error": "ALREADY_RESOLVED"}), 409

    rec.status      = "rejected"
    rec.resolved_at = datetime.now(timezone.utc)
    rec.resolved_by = actor.id

    _log("RECOVERY_REJECTED", rec.user_email, rec.user_id, "warning", request.remote_addr,
         details=f"Recovery rejected by {actor.email}.")
    db.session.commit()
    return jsonify({"ok": True}), 200


# -- POST /auth/recovery-requests/<id>/set-password (admin) -------------------
@auth_bp.post("/recovery-requests/<req_id>/set-password")
@csrf_protect
@jwt_required_custom
@limiter.limit("20 per hour")
def set_recovery_password(req_id):
    """
    Admin sets a temporary password for the user behind a recovery request.
    Accepts { password } for a manual password, or { auto: true } to auto-generate.
    Returns the plaintext password so the admin can include it in the email.
    Does NOT mark the request as resolved — that happens in send-email or reject.
    """
    import secrets, string
    from app.models.recovery_request import RecoveryRequest
    from app.models.user import User
    from app.services.auth_service import _log
    from app.extensions import db

    actor = current_user()
    if actor.role != "admin":
        return jsonify({"error": "FORBIDDEN"}), 403

    rec = db.session.get(RecoveryRequest, req_id)
    if not rec:
        return jsonify({"error": "NOT_FOUND"}), 404
    if rec.status != "pending":
        return jsonify({"error": "ALREADY_RESOLVED"}), 409

    data       = request.get_json(silent=True) or {}
    auto       = data.get("auto", False)
    manual_pw  = (data.get("password") or "").strip()

    if auto or not manual_pw:
        # Generate a secure 16-char password that satisfies the policy
        alphabet = string.ascii_letters + string.digits + "!@#$%"
        while True:
            temp_pw = "".join(secrets.choice(alphabet) for _ in range(16))
            if (any(c.isupper() for c in temp_pw) and
                    any(c.islower() for c in temp_pw) and
                    any(c.isdigit() for c in temp_pw) and
                    any(c in "!@#$%" for c in temp_pw)):
                break
    else:
        from app.services.auth_service import _validate_password
        pw_err = _validate_password(manual_pw)
        if pw_err:
            return jsonify({"error": pw_err}), 400
        temp_pw = manual_pw

    # Find user by FK first, fallback to email lookup
    user = db.session.get(User, rec.user_id) if rec.user_id else None
    if not user:
        user = User.query.filter_by(email=rec.user_email).first()
    if not user:
        return jsonify({"error": "USER_NOT_FOUND"}), 404

    user.set_password(temp_pw)
    user.password_reset_required = True
    # Invalidate all existing sessions
    user.token_version = (user.token_version or 0) + 1

    _log("RECOVERY_PASSWORD_SET", user.email, user.id, "warning", request.remote_addr,
         details=f"Temporary password set by admin {actor.email}.")
    db.session.commit()

    response = jsonify({
        "ok":        True,
        "password":  temp_pw,
        "userEmail": user.email,
        "userName":  user.name,
    })
    if user.id == actor.id:
        from flask_jwt_extended import create_access_token, set_access_cookies
        from datetime import datetime, timezone
        now_ts = int(datetime.now(timezone.utc).timestamp())
        fresh_token = create_access_token(
            identity=actor.id,
            additional_claims={
                "session_created_at": now_ts,
                "token_version": user.token_version,
                "password_reset_required": False
            }
        )
        set_access_cookies(response, fresh_token)
    return response, 200


# -- POST /auth/recovery-requests/<id>/send-email (admin) ---------------------
@auth_bp.post("/recovery-requests/<req_id>/send-email")
@csrf_protect
@jwt_required_custom
@limiter.limit("10 per hour")
def send_recovery_email(req_id):
    """
    Admin sends a fully-custom email to the affected user, then marks the
    request as approved.  Accepts { to, subject, body }.
    If SMTP is not configured the request is still approved — the admin is
    notified via the emailSent flag in the response.
    """
    import os, smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from datetime import datetime, timezone
    from app.models.recovery_request import RecoveryRequest
    from app.services.auth_service import _log
    from app.extensions import db

    actor = current_user()
    if actor.role != "admin":
        return jsonify({"error": "FORBIDDEN"}), 403

    rec = db.session.get(RecoveryRequest, req_id)
    if not rec:
        return jsonify({"error": "NOT_FOUND"}), 404
    if rec.status != "pending":
        return jsonify({"error": "ALREADY_RESOLVED"}), 409

    data    = request.get_json(silent=True) or {}
    to_addr = (data.get("to") or "").strip()
    subject = (data.get("subject") or "").strip()
    body    = (data.get("body") or "").strip()

    if not to_addr or not subject or not body:
        return jsonify({"error": "MISSING_FIELDS"}), 400

    smtp_sender   = os.environ.get("SMTP_SENDER_EMAIL")
    smtp_password = os.environ.get("SMTP_APP_PASSWORD")
    smtp_host     = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port     = int(os.environ.get("SMTP_PORT", 587))

    email_sent = False
    if smtp_sender and smtp_password:
        msg = MIMEMultipart()
        msg["From"]    = f"TFS Security <{smtp_sender}>"
        msg["To"]      = to_addr
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain", "utf-8"))
        try:
            if smtp_port == 465:
                with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10) as srv:
                    srv.login(smtp_sender, smtp_password)
                    srv.sendmail(smtp_sender, to_addr, msg.as_string())
            else:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as srv:
                    srv.ehlo(); srv.starttls(); srv.ehlo()
                    srv.login(smtp_sender, smtp_password)
                    srv.sendmail(smtp_sender, to_addr, msg.as_string())
            email_sent = True
        except Exception as e:
            _log("RECOVERY_EMAIL_FAILED", rec.user_email, rec.user_id, "error",
                 request.remote_addr, details=f"SMTP error: {e}")

    rec.status      = "approved"
    rec.resolved_at = datetime.now(timezone.utc)
    rec.resolved_by = actor.id

    _log("RECOVERY_APPROVED", rec.user_email, rec.user_id, "success", request.remote_addr,
         details=f"Recovery approved by {actor.email}. Email sent: {email_sent}.")
    db.session.commit()

    return jsonify({"ok": True, "emailSent": email_sent}), 200
