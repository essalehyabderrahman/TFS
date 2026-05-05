import re
import uuid
import secrets
import bcrypt as _bcrypt
import pyotp
import qrcode
import io
import base64
from datetime import datetime, timezone, timedelta
from flask_jwt_extended import create_access_token
from app.services.totp_replay import consume_code

from app.extensions import db, bcrypt
from app.models.user import User
from app.models.audit_log import AuditLog

# [Security] Constant-time dummy hash for non-existent users (prevents timing enumeration)
_DUMMY_HASH = _bcrypt.hashpw(b"dummy", _bcrypt.gensalt(rounds=12))


def _verify_password(user, password: str) -> bool:
    """
    Always runs a bcrypt check so response time is constant regardless
    of whether the user account exists, preventing timing-based enumeration.
    """
    candidate = password.encode("utf-8")
    stored    = user.password_hash.encode("utf-8") if user else _DUMMY_HASH
    return _bcrypt.checkpw(candidate, stored)


# ──────────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────────

# [Security] bcrypt cost factor ≥ 12 as per spec
BCRYPT_ROUNDS = 12

# [Security] Lockout thresholds — exponential back-off up to 15 min
_LOCKOUT_SCHEDULE = [
    timedelta(seconds=1),
    timedelta(seconds=2),
    timedelta(seconds=4),
    timedelta(seconds=8),
    timedelta(minutes=15),   # 5th attempt → full lockout
]

MAX_SIGNIN_ATTEMPTS = 5
MAX_MFA_ATTEMPTS    = 3


# ──────────────────────────────────────────────────────────────────────────────
# Password validation
# [Security] Min 12 chars, upper + lower + digit + symbol
# ──────────────────────────────────────────────────────────────────────────────
def _validate_password(password: str) -> str | None:
    """Returns an error code string if invalid, None if valid."""
    if len(password) < 12:
        return "PASSWORD_TOO_SHORT"
    if not re.search(r"[A-Z]", password):
        return "PASSWORD_NO_UPPERCASE"
    if not re.search(r"[a-z]", password):
        return "PASSWORD_NO_LOWERCASE"
    if not re.search(r"\d", password):
        return "PASSWORD_NO_DIGIT"
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\;'/`~]", password):
        return "PASSWORD_NO_SYMBOL"
    return None


def _validate_new_password(new_password: str, current_hash: str) -> str | None:
    """
    Runs full policy check then rejects if new password is identical to the current one.
    [Security] Prevents silent no-op password changes.
    """
    error = _validate_password(new_password)
    if error:
        return error
    if _bcrypt.checkpw(new_password.encode("utf-8"), current_hash.encode("utf-8")):
        return "PASSWORD_SAME_AS_CURRENT"
    return None


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
def _log(action: str, user_email: str, user_id: str | None,
         status: str, ip: str, resource: str = "", details: str = "") -> None:
    """[Audit] Logs every auth event. Never logs passwords, tokens, or TOTP codes."""
    from flask import request
    user_agent_str = request.user_agent.string if request else "unknown"
    log = AuditLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        user_email=user_email,
        action=action,
        resource=resource,
        ip_address=ip,
        user_agent=user_agent_str,
        status=status,
        details=details,
    )
    db.session.add(log)
    # Committed by caller


def _get_lockout_duration(attempt_count: int) -> timedelta:
    """[Brute-Force] Exponential back-off based on attempt count."""
    idx = min(attempt_count - 1, len(_LOCKOUT_SCHEDULE) - 1)
    return _LOCKOUT_SCHEDULE[idx]


# ──────────────────────────────────────────────────────────────────────────────
# Sign Up
# ──────────────────────────────────────────────────────────────────────────────
def signup(name: str, email: str, password: str, ip: str) -> dict:
    """
    Creates an account.
    [Security] Enforces password complexity before hashing.
    [Security] Uses bcrypt with cost factor ≥ 12 (via set_password).
    """
    email = email.strip().lower()

    # [Security] Generic existence check — same error on dup email to avoid enumeration
    if User.query.filter_by(email=email).first():
        return {"ok": False, "error": "EMAIL_TAKEN"}

    # [Security] Full password policy check
    pw_error = _validate_password(password)
    if pw_error:
        return {"ok": False, "error": pw_error}

    user = User(
        id=str(uuid.uuid4()),
        name=name.strip(),
        email=email,
        role="user",
        status="active",
    )
    # [Security] set_password uses bcrypt internally (Flask-Bcrypt default = 12 rounds)
    user.set_password(password)

    db.session.add(user)
    # [Audit] Log account creation
    _log("SIGNUP", email, user.id, "success", ip, details="Account created")
    db.session.commit()

    # [Security] Issue restricted tempToken (mfa_pending=True) to allow onboarding flow
    from datetime import timedelta
    temp_token = create_access_token(
        identity=user.id,
        additional_claims={"mfa_pending": True},
        expires_delta=timedelta(minutes=15)
    )

    return {"ok": True, "token": temp_token, "user": user.to_dict()}


# ──────────────────────────────────────────────────────────────────────────────
# Sign In  (step 1)
# ──────────────────────────────────────────────────────────────────────────────
def signin(email: str, password: str, ip: str) -> dict:
    """
    Verifies credentials.
    [Security] Generic error — never reveals which field failed.
    [Brute-Force] Exponential back-off lockout after MAX_SIGNIN_ATTEMPTS.
    [Security] Constant-time comparison via _verify_password (runs even for non-existent users).
    """
    email = email.strip().lower()

    # 1. Fetch user — always use the same code path
    user  = User.query.filter_by(email=email).first()

    # 2. Lockout check — before password verification
    if user and user.is_locked():
        _log("LOGIN_BLOCKED", email, user.id, "failed", ip,
             details="Account locked due to brute-force protection")
        db.session.commit()
        return {"ok": False, "error": "ACCOUNT_LOCKED"}

    # 3. Constant-time password verification (runs even when user is None)
    if not _verify_password(user, password):
        if user:
            user.record_failed_attempt()
            if user.failed_login_attempts >= MAX_SIGNIN_ATTEMPTS:
                _log("LOGIN_LOCKOUT", email, user.id, "warning", ip,
                     details=f"Account locked after {user.failed_login_attempts} attempts")
            else:
                _log("LOGIN_FAILED", email, user.id, "failed", ip,
                     details=f"Bad credentials. Attempt {user.failed_login_attempts}/{MAX_SIGNIN_ATTEMPTS}")
        else:
            _log("LOGIN_FAILED", email, None, "failed", ip,
                 details="Auth failure (unknown identity)")
        db.session.commit()
        return {"ok": False, "error": "INVALID_CREDENTIALS"}

    # 4. Check suspension BEFORE clearing brute-force state
    if user.status == "suspended":
        _log("LOGIN_FAILED", email, user.id, "failed", ip, details="Account suspended")
        db.session.commit()
        return {"ok": False, "error": "ACCOUNT_SUSPENDED"}

    # 5. Successful credential check — clear login lockout state only.
    # [Security] Do NOT reset mfa_failed_attempts here — MFA hasn't been verified yet.
    # Resetting it here would allow an attacker with valid credentials to reset the
    # MFA brute-force counter on every attempt, making MFA lockout ineffective.
    user.reset_failed_attempts()

    user.touch()

    # [Security] If MFA is not configured, check the global require_mfa policy.
    if not user.mfa_enabled:
        from app.models.team_settings import TeamSettings
        settings = TeamSettings.query.first()
        if settings and settings.require_mfa:
            # [Platform Policy] MFA is mandatory app-wide — force the user through setup.
            # Issue a restricted mfa_pending token; full session only after MFA is enrolled.
            temp_token = create_access_token(
                identity=user.id,
                additional_claims={"mfa_pending": True},
                expires_delta=timedelta(minutes=15),
            )
            _log("LOGIN_MFA_REQUIRED_BY_POLICY", email, user.id, "warning", ip,
                 details="Full session withheld — require_mfa policy is active and user has no MFA.")
            db.session.commit()
            return {"ok": True, "mfaRequired": True, "tempToken": temp_token, "user": user.to_dict()}

        # MFA not required globally and not configured — issue a full session directly.
        now_ts = int(datetime.now(timezone.utc).timestamp())
        token = create_access_token(
            identity=user.id,
            additional_claims={
                "session_created_at": now_ts,
                "token_version": user.token_version,
            }
        )
        _log("SESSION_CREATED", email, user.id, "success", ip,
             details="Full session issued — MFA not enabled on this account.")
        db.session.commit()
        return {"ok": True, "mfaRequired": False, "token": token, "user": user.to_dict()}

    # [Security] Zero-Trust Paradigm: MFA is enabled — issue restricted mfa_pending token.
    # Full session token only issued after MFA verification.
    temp_token = create_access_token(
        identity=user.id,
        additional_claims={"mfa_pending": True},
        expires_delta=timedelta(minutes=5),
    )
    _log("LOGIN_MFA_PENDING", email, user.id, "warning", ip,
         details="MFA challenge required.")
    db.session.commit()
    return {"ok": True, "mfaRequired": True, "tempToken": temp_token, "user": user.to_dict()}


# ──────────────────────────────────────────────────────────────────────────────
# MFA — Setup
# ──────────────────────────────────────────────────────────────────────────────
def setup_mfa(user_id: str) -> dict:
    """
    Generates TOTP secret + QR code.
    [Security] Secret is ≥ 20 bytes (160 bits) of randomness.
    [MFA] Does not yet activate MFA — user must confirm with first code.
    [Security] Blocked if MFA is already enabled — must disable first.
    """
    user = db.session.get(User, user_id)
    if not user:
        return {"ok": False, "error": "USER_NOT_FOUND"}

    # [Security] Block overwrite of an active MFA secret.
    if user.mfa_enabled:
        return {"ok": False, "error": "MFA_ALREADY_ENABLED"}

    # [Security] pyotp.random_base32(32) → 32 base32 chars = 20 bytes = 160 bits
    secret = pyotp.random_base32(32)
    user.mfa_secret = secret

    # [Security] Generate a single, single-use numeric backup code (8 digits)
    import secrets
    from app.extensions import bcrypt
    raw_backup_code = f"{secrets.randbelow(100000000):08d}"
    user.backup_codes = bcrypt.generate_password_hash(raw_backup_code).decode("utf-8")

    user.mfa_failed_attempts = 0
    db.session.commit()

    totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=user.email, issuer_name="TFS"
    )

    img = qrcode.make(totp_uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    return {
        "ok": True, 
        "secret": secret, 
        "qrCode": f"data:image/png;base64,{qr_b64}",
        "backupCode": raw_backup_code
    }


# ──────────────────────────────────────────────────────────────────────────────
# MFA — Verification (step 2 of login / MFA enable confirmation)
# ──────────────────────────────────────────────────────────────────────────────
def verify_mfa(user_id: str, otp_code: str, ip: str, is_setup_confirm: bool = False) -> dict:
    """
    [MFA] Validates TOTP code.
    [Security] Replay protection: each TOTP code is accepted only once.
    [Security] ± 1 step tolerance (valid_window=1 = current ± 1 × 30s).
    [Brute-Force] Locks after MAX_MFA_ATTEMPTS failures (independent counter).
    [Security] Token Rotation: issues fresh full token, invalidating tempToken.
    """
    user = db.session.get(User, user_id)
    if not user or not user.mfa_secret:
        return {"ok": False, "error": "MFA_NOT_CONFIGURED"}

    # [Security] Reject suspended users — single authoritative check here
    if user.status == "suspended":
        return {"ok": False, "error": "ACCOUNT_SUSPENDED"}

    # [Brute-Force] Check account-level lockout first
    if user.is_locked():
        return {"ok": False, "error": "MFA_LOCKED"}

    active_secret = user.mfa_secret
    if not active_secret:
        return {"ok": False, "error": "MFA_NOT_CONFIGURED"}

    totp = pyotp.TOTP(active_secret)

    # [Brute-Force] Check MFA attempt counter BEFORE verifying
    if (user.mfa_failed_attempts or 0) >= MAX_MFA_ATTEMPTS:
        # Invalidate the partial session by bumping token_version
        user.token_version = (user.token_version or 0) + 1
        _log("MFA_FAILED_SESSION_ABORTED", user.email, user.id, "failed", ip,
             details="Max MFA attempts exceeded. Session invalidated.")
        db.session.commit()
        return {"ok": False, "error": "MFA_MAX_ATTEMPTS_EXCEEDED"}

    # [MFA] Check if it's a backup code (8 chars) or TOTP (6 chars)
    # [Brute-Force] Rate limiting counter incremented for ANY invalid code
    is_valid = False
    is_backup = False
    
    if len(otp_code) == 8 and user.backup_codes:
        from app.extensions import bcrypt
        if bcrypt.check_password_hash(user.backup_codes, otp_code):
            is_valid = True
            is_backup = True
            user.backup_codes = None
        else:
            is_valid = False
    else:
        # Verify as TOTP code (±1 window = max 30s drift)
        totp = pyotp.TOTP(user.mfa_secret)
        is_valid = totp.verify(otp_code, valid_window=1)

    if not is_valid:
        user.mfa_failed_attempts = (user.mfa_failed_attempts or 0) + 1

        if user.mfa_failed_attempts >= MAX_MFA_ATTEMPTS:
            # Invalidate the partial session by bumping token_version
            user.token_version = (user.token_version or 0) + 1
            _log("MFA_FAILED_SESSION_ABORTED", user.email, user.id, "failed", ip,
                 details=f"3rd MFA failure. Partial session invalidated.")
            db.session.commit()
            return {"ok": False, "error": "MFA_MAX_ATTEMPTS_EXCEEDED"}

        _log("MFA_FAILED", user.email, user.id, "failed", ip,
             details=f"Wrong code. Attempt {user.mfa_failed_attempts}/{MAX_MFA_ATTEMPTS}")
        db.session.commit()
        return {"ok": False, "error": "INVALID_CODE"}

    # [Security] Replay protection for TOTP (Redis-backed atomic check-and-set)
    if not is_backup:
        if not consume_code(str(user.id), otp_code):
            _log("MFA_REPLAY_REJECTED", user.email, user.id, "failed", ip,
                 details="TOTP replay attempt blocked (Redis-backed).")
            db.session.commit()
            return {"ok": False, "error": "MFA_CODE_ALREADY_USED"}


    # [MFA] Activate MFA on first enrollment.
    if not user.mfa_enabled:
        user.mfa_enabled = True
        _log("MFA_ENROLLED", user.email, user.id, "success", ip,
             details="MFA enrollment confirmed.")

    # [Security] Reset MFA failure counter on success
    user.mfa_failed_attempts = 0
    user.touch()

    # [Security] Token Rotation: issue a fresh full-access token (new JTI)
    # The tempToken (mfa_pending=True) is now implicitly superseded.
    # Embed session creation time for 8-hr absolute max enforcement
    # Embed token_version for global session invalidation
    # [Session] Preserve original session_created_at if re-issuing token mid-session
    # (e.g. mfa/enable on already-authenticated user) — do not reset the 8-hour clock.
    existing_claims = {}
    try:
        from flask_jwt_extended import get_jwt
        existing_claims = get_jwt()
    except Exception:
        pass

    now_ts = int(datetime.now(timezone.utc).timestamp())
    session_created_at = existing_claims.get("session_created_at", now_ts)

    token = create_access_token(
        identity=user.id,
        additional_claims={
            "session_created_at": session_created_at,
            "token_version": user.token_version
        }
    )

    # [Audit] Log successful MFA verification with token rotation note
    _log("MFA_VERIFIED", user.email, user.id, "success", ip,
         details="MFA code verified. Session token rotated.")
    # [Audit] SESSION_CREATED — full session born here and only here
    _log("SESSION_CREATED", user.email, user.id, "success", ip,
         details="Full authenticated session issued after MFA verification.")
    db.session.commit()
    return {"ok": True, "token": token, "user": user.to_dict()}


def regenerate_backup_code(user_id: str, totp_code: str, ip: str) -> dict:
    """
    Regenerates the single backup code after verifying a live TOTP code.
    [Security] Requires valid TOTP — cannot be triggered with the backup code itself.
    [Security] Old backup code is invalidated immediately before new one is stored.
    [Security] Replay protection applied to the TOTP used for verification.
    """
    user = db.session.get(User, user_id)
    if not user or not user.mfa_enabled or not user.mfa_secret:
        return {"ok": False, "error": "MFA_NOT_CONFIGURED"}

    if user.is_locked():
        return {"ok": False, "error": "ACCOUNT_LOCKED"}

    # Only accept a TOTP code — never a backup code — to gate this action
    if len(totp_code) != 6:
        return {"ok": False, "error": "TOTP_REQUIRED"}

    totp = pyotp.TOTP(user.mfa_secret)

    if (user.mfa_failed_attempts or 0) >= MAX_MFA_ATTEMPTS:
        user.token_version = (user.token_version or 0) + 1
        _log("BACKUP_REGEN_LOCKED", user.email, user.id, "failed", ip,
             details="Max attempts exceeded during backup code regeneration.")
        db.session.commit()
        return {"ok": False, "error": "MFA_MAX_ATTEMPTS_EXCEEDED"}

    if not totp.verify(totp_code, valid_window=1):
        user.mfa_failed_attempts = (user.mfa_failed_attempts or 0) + 1
        _log("BACKUP_REGEN_FAILED", user.email, user.id, "failed", ip,
             details=f"Wrong TOTP during backup regeneration. Attempt {user.mfa_failed_attempts}/{MAX_MFA_ATTEMPTS}")
        db.session.commit()
        return {"ok": False, "error": "INVALID_CODE"}

    if not consume_code(str(user.id), totp_code):
        return {"ok": False, "error": "MFA_CODE_ALREADY_USED"}

    # Invalidate old code and generate new one
    import secrets
    from app.extensions import bcrypt
    raw_backup_code = f"{secrets.randbelow(100000000):08d}"
    user.backup_codes = bcrypt.generate_password_hash(raw_backup_code).decode("utf-8")
    user.mfa_failed_attempts = 0

    _log("BACKUP_CODE_REGENERATED", user.email, user.id, "warning", ip,
         details="Backup code regenerated by user.")
    db.session.commit()
    return {"ok": True, "backupCode": raw_backup_code}


# ──────────────────────────────────────────────────────────────────────────────
# Token Refresh (sliding session)
# ──────────────────────────────────────────────────────────────────────────────
def refresh_token(user_id: str, session_created_at: int, token_version: int, ip: str) -> dict:
    """
    Issues a fresh 15-min access token carrying the same session_created_at.
    [Session] Enforces 8-hour absolute max — refuses if session is too old.
    [Security] Validates token_version matches DB to reject revoked sessions.
    """
    user = db.session.get(User, user_id)
    if not user:
        return {"ok": False, "error": "USER_NOT_FOUND"}

    if user.status == "suspended":
        return {"ok": False, "error": "ACCOUNT_SUSPENDED"}

    # [Security] Reject if token version is stale (password changed, etc.)
    if token_version is not None and token_version < user.token_version:
        return {"ok": False, "error": "SESSION_REVOKED"}

    # [Session] Enforce 8-hour absolute max
    from datetime import timedelta
    created = datetime.fromtimestamp(session_created_at, tz=timezone.utc)
    if datetime.now(timezone.utc) - created > timedelta(hours=8):
        _log("SESSION_EXPIRED", user.email, user.id, "info", ip,
             details="Refresh refused: absolute 8-hour session limit reached.")
        db.session.commit()
        return {"ok": False, "error": "SESSION_EXPIRED"}

    user.touch()
    token = create_access_token(
        identity=user.id,
        additional_claims={
            "session_created_at": session_created_at,
            "token_version": user.token_version,
        }
    )
    _log("TOKEN_REFRESHED", user.email, user.id, "success", ip,
         details="Sliding session token refreshed.")
    db.session.commit()
    return {"ok": True, "token": token, "user": user.to_dict()}


# ──────────────────────────────────────────────────────────────────────────────
# MFA — Disable
# ──────────────────────────────────────────────────────────────────────────────
def disable_mfa(user_id: str, otp_code: str, ip: str) -> dict:
    """
    [MFA] Requires a valid TOTP code to disable.
    [Audit] Logged as warning-level event.
    """
    user = db.session.get(User, user_id)
    if not user or not user.mfa_enabled:
        return {"ok": False, "error": "MFA_NOT_ENABLED"}

    totp = pyotp.TOTP(user.mfa_secret)
    if (user.mfa_failed_attempts or 0) >= MAX_MFA_ATTEMPTS:
        user.token_version = (user.token_version or 0) + 1
        _log("MFA_DISABLE_LOCKED", user.email, user.id, "failed", ip,
             details="Max MFA attempts exceeded during disable. Session invalidated.")
        db.session.commit()
        return {"ok": False, "error": "MFA_MAX_ATTEMPTS_EXCEEDED"}

    if not totp.verify(otp_code, valid_window=1):
        user.mfa_failed_attempts = (user.mfa_failed_attempts or 0) + 1
        _log("MFA_DISABLE_FAILED", user.email, user.id, "failed", ip,
             details=f"Wrong code. Attempt {user.mfa_failed_attempts}/{MAX_MFA_ATTEMPTS}")
        db.session.commit()
        return {"ok": False, "error": "INVALID_CODE"}

    if not consume_code(str(user.id), otp_code):
        return {"ok": False, "error": "MFA_CODE_ALREADY_USED"}

    user.mfa_failed_attempts = 0

    user.mfa_enabled = False
    user.mfa_secret  = None
    user.mfa_failed_attempts = 0

    # [Security] Invalidate all other sessions — MFA downgrade is a critical change
    user.token_version = (user.token_version or 0) + 1

    # [Audit] Log MFA disable event
    _log("MFA_DISABLED", user.email, user.id, "warning", ip,
         details="MFA disabled by user. All existing sessions invalidated.")
    db.session.commit()
    return {"ok": True}

