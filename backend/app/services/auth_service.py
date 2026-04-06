import uuid
import pyotp
import qrcode
import io
import base64
from datetime import datetime, timezone
from flask_jwt_extended import create_access_token

from app.extensions import db
from app.models.user import User
from app.models.audit_log import AuditLog


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
def _log(action: str, user_email: str, user_id: str | None,
         status: str, ip: str, resource: str = "", details: str = "") -> None:
    log = AuditLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        user_email=user_email,
        action=action,
        resource=resource,
        ip_address=ip,
        status=status,
        details=details,
    )
    db.session.add(log)
    # Committed by caller


# ──────────────────────────────────────────────────────────────────────────────
# Sign Up
# ──────────────────────────────────────────────────────────────────────────────
def signup(name: str, email: str, password: str, ip: str) -> dict:
    """
    Crée un compte. Retourne {'ok': True, 'user': {...}} ou {'ok': False, 'error': '...'}.
    """
    email = email.strip().lower()

    if User.query.filter_by(email=email).first():
        return {"ok": False, "error": "EMAIL_TAKEN"}

    if len(password) < 8:
        return {"ok": False, "error": "PASSWORD_TOO_SHORT"}

    user = User(
        id=str(uuid.uuid4()),
        name=name.strip(),
        email=email,
        role="viewer",
        status="active",
    )
    user.set_password(password)

    db.session.add(user)
    _log("SIGNUP", email, user.id, "success", ip, details="Account created")
    db.session.commit()

    return {"ok": True, "user": user.to_dict()}


# ──────────────────────────────────────────────────────────────────────────────
# Sign In  (step 1)
# ──────────────────────────────────────────────────────────────────────────────
def signin(email: str, password: str, ip: str) -> dict:
    """
    Vérifie les credentials.
    - Si MFA désactivé → retourne le token JWT directement.
    - Si MFA activé    → retourne {'mfaRequired': True, 'tempToken': ...}
    """
    email = email.strip().lower()
    user  = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        _log("LOGIN_FAILED", email, None, "failed", ip, details="Bad credentials")
        db.session.commit()
        return {"ok": False, "error": "INVALID_CREDENTIALS"}

    if user.status == "suspended":
        _log("LOGIN_FAILED", email, user.id, "failed", ip, details="Account suspended")
        db.session.commit()
        return {"ok": False, "error": "ACCOUNT_SUSPENDED"}

    user.touch()

    if user.mfa_enabled:
        # Émet un token temporaire (courte durée, claim spécial)
        from datetime import timedelta
        temp_token = create_access_token(
            identity=user.id,
            additional_claims={"mfa_pending": True},
            expires_delta=timedelta(minutes=5),
        )
        _log("LOGIN_MFA_PENDING", email, user.id, "warning", ip)
        db.session.commit()
        return {"ok": True, "mfaRequired": True, "tempToken": temp_token, "user": user.to_dict()}

    token = create_access_token(identity=user.id)
    _log("LOGIN_SUCCESS", email, user.id, "success", ip)
    db.session.commit()
    return {"ok": True, "mfaRequired": False, "token": token, "user": user.to_dict()}


# ──────────────────────────────────────────────────────────────────────────────
# MFA — Setup
# ──────────────────────────────────────────────────────────────────────────────
def setup_mfa(user_id: str) -> dict:
    """
    Génère un secret TOTP + QR code base64 à afficher dans l'UI.
    N'active pas encore le MFA — l'utilisateur doit confirmer avec un code OTP.
    """
    user = db.session.get(User, user_id)
    if not user:
        return {"ok": False, "error": "USER_NOT_FOUND"}

    secret = pyotp.random_base32()
    user.mfa_secret = secret  # pas encore activé
    db.session.commit()

    totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=user.email, issuer_name="TFS"
    )

    img = qrcode.make(totp_uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    return {"ok": True, "secret": secret, "qrCode": f"data:image/png;base64,{qr_b64}"}


# ──────────────────────────────────────────────────────────────────────────────
# MFA — Vérification (step 2 du login)
# ──────────────────────────────────────────────────────────────────────────────
def verify_mfa(user_id: str, otp_code: str, ip: str) -> dict:
    user = db.session.get(User, user_id)
    if not user or not user.mfa_secret:
        return {"ok": False, "error": "MFA_NOT_CONFIGURED"}

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(otp_code, valid_window=1):
        _log("MFA_FAILED", user.email, user.id, "failed", ip)
        db.session.commit()
        return {"ok": False, "error": "INVALID_OTP"}

    # Active MFA si ce n'est pas encore fait (cas setup)
    if not user.mfa_enabled:
        user.mfa_enabled = True

    user.touch()
    token = create_access_token(identity=user.id)
    _log("LOGIN_SUCCESS", user.email, user.id, "success", ip, details="MFA verified")
    db.session.commit()
    return {"ok": True, "token": token, "user": user.to_dict()}


# ──────────────────────────────────────────────────────────────────────────────
# MFA — Désactivation
# ──────────────────────────────────────────────────────────────────────────────
def disable_mfa(user_id: str, otp_code: str, ip: str) -> dict:
    user = db.session.get(User, user_id)
    if not user or not user.mfa_enabled:
        return {"ok": False, "error": "MFA_NOT_ENABLED"}

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(otp_code, valid_window=1):
        return {"ok": False, "error": "INVALID_OTP"}

    user.mfa_enabled = False
    user.mfa_secret  = None
    _log("MFA_DISABLED", user.email, user.id, "warning", ip)
    db.session.commit()
    return {"ok": True}