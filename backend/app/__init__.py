"""
TFS — Plateforme Collaborative Sécurisée pour le Partage de Fichiers
Mini-Projet ICCN INE1 — 2025/2026

Cahier des charges — Mapping de conformité :
  §1  Gestion utilisateurs/rôles  → models/user.py, services/auth_service.py, routes/auth.py
  §2  Partage de fichiers         → services/file_service.py, routes/transfers.py, routes/groups.py
  §3  ACL (Access Control Lists)  → models/audit_log.py (ACLEntry), middleware/acl_middleware.py
  §4  Accès concurrents           → file_service.py (locked_by_id), config.py (SQLite WAL)
  §5  Versioning                  → models/transfer.py (FileVersion), routes/groups.py (versions/restore)
  §6  Sécurité                    → Bcrypt, MFA TOTP, AES-256-GCM, _validate_file_content(), rate limiting
  §7  Journalisation              → models/audit_log.py (AuditLog), routes/other.py (audit_bp)
  §8  Interface utilisateur       → frontend/src/app/pages/ (React)
  §9  Technologies                → Flask + React + SQLite + Bcrypt
"""
import os
from flask import Flask, request, jsonify
from .config import get_config, validate_production_config
from .extensions import db, jwt, bcrypt, cors, limiter, init_talisman
from .middleware.csrf_middleware import init_csrf


def create_app() -> Flask:
    app = Flask(__name__, instance_relative_config=True)

    # ── Config ────────────────────────────────────────────────────────────────
    app.config.from_object(get_config())
    validate_production_config()

    # Ensure instance + upload folders exist, create them if they don't exist.
    os.makedirs(app.instance_path, exist_ok=True)
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    # ── Extensions ────────────────────────────────────────────────────────────
    db.init_app(app)

    # [Concurrency] SQLite WAL mode — enables concurrent reads during writes
    # Required by cahier des charges §4 (Gestion des accès concurrents)
    from sqlalchemy import event, engine as sa_engine
    @event.listens_for(sa_engine.Engine, "connect")
    def _configure_sqlite(dbapi_conn, connection_record):
        import sqlite3
        if isinstance(dbapi_conn, sqlite3.Connection):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    jwt.init_app(app)
    bcrypt.init_app(app)
    cors.init_app(app, resources={r"/*": {"origins": app.config["FRONTEND_URL"]}}, supports_credentials=True)
    
    # [Security] Rate limit storage configuration
    # In production, Redis is MANDATORY. In development, we fallback to memory.
    flask_env = os.environ.get("FLASK_ENV", "development")
    if flask_env == "production":
        # Force Redis in production; if REDIS_URL is missing, limiter will fail to init which is desired
        app.config["RATELIMIT_STORAGE_URI"] = os.environ.get("REDIS_URL", "redis://localhost:6379")
    else:
        # Development/Testing fallback to memory to avoid Redis dependency
        app.config["RATELIMIT_STORAGE_URI"] = "memory://"
        
    limiter.init_app(app)


    @jwt.expired_token_loader
    def my_expired_token_callback(jwt_header, jwt_payload):
        from .services.auth_service import _log
        ip = request.remote_addr
        # Attempt to grab user ID since the signature was still perfectly valid, just expired
        uid = jwt_payload.get("sub", "unknown")
        # [Audit] Log session expiry
        _log("SESSION_EXPIRED", "unknown", uid, "info", ip, details="Session reached its normal idle expiry limit.")
        # Commit manually since outside normal route context it might not be bound appropriately
        db.session.commit()
        return jsonify({"error": "TOKEN_EXPIRED", "message": "The token has expired"}), 401


    # ── Blueprints ────────────────────────────────────────────────────────────
    from .routes.auth import auth_bp
    from .routes.transfers import transfers_bp
    from .routes.other import team_bp, audit_bp, account_bp, security_bp
    from .routes.notifications import notifications_bp
    from .routes.groups import groups_bp
    from .routes.other import app_bp
    from .routes.contacts import contacts_bp
    from .routes.explorer import explorer_bp
    from .routes.quota_requests import quota_requests_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(transfers_bp)
    app.register_blueprint(team_bp)
    app.register_blueprint(app_bp)
    app.register_blueprint(audit_bp)
    app.register_blueprint(account_bp)
    app.register_blueprint(security_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(groups_bp)
    app.register_blueprint(contacts_bp)
    app.register_blueprint(explorer_bp)
    app.register_blueprint(quota_requests_bp)

    # [Security] Register CSRF Double Submit Cookie protection
    init_csrf(app)

    # ── Security Headers ──────────────────────────────────────────────────────
    # Removed legacy hooks — now handled by Flask-Talisman in create_app()

    # ── DB init ───────────────────────────────────────────────────────────────
    with app.app_context():
        # Import models here (after extensions are bound) so SQLAlchemy
        # registers the tables before create_all() is called.
        from .models.user import User                      # noqa: F401
        from .models.transfer import Transfer, FileVersion # noqa: F401
        from .models.audit_log import AuditLog, ACLEntry   # noqa: F401
        from .models.notification import Notification      # noqa: F401
        from .models.team_settings import TeamSettings     # noqa: F401
        from .models.group import Group, GroupMember, GroupSettings  # noqa: F401
        from .models.contact import Contact                          # noqa: F401
        from .models.user_file import UserFile                       # noqa: F401
        from .models.quota_request import QuotaRequest                # noqa: F401

        # [DB] Idempotent column additions MUST run before create_all() queries
        # so that existing DBs gain the new columns before SQLAlchemy touches them.
        _migrate_columns(app)
        db.create_all()
        
        # Seed singleton TeamSettings row with secure defaults
        if not TeamSettings.query.first():
            db.session.add(TeamSettings())
            db.session.commit()

        # Seed default admin from environment variables
        _seed_default_admin(app)

    # [Security] Initialize Talisman last because it wraps the WSGI app
    init_talisman(app)

    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

    # ── Cleanup Scheduler ─────────────────────────────────────────────────────
    # Skip in reloader child process to avoid duplicate schedulers
    import os as _os
    if not app.debug or _os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        from .services.cleanup_service import init_scheduler
        init_scheduler(app)
        
    return app


def _migrate_columns(app) -> None:
    """
    Idempotent schema migrations for columns added during the V1/V2 merge.
    Runs ALTER TABLE … ADD COLUMN only if the column does not already exist.
    Safe for both SQLite and PostgreSQL.
    """
    from .extensions import db
    import sqlalchemy

    migrations = [
        ("users",     "storage_quota_bytes", "BIGINT"),
        ("groups",    "storage_quota_bytes", "BIGINT"),
        ("acl_entries", "can_download",      "BOOLEAN DEFAULT 1"),
        ("transfers", "trashed_at",          "DATETIME"),
        ("transfers", "content_hash",        "VARCHAR(64)"),
        ("user_files",  "content_hash",      "VARCHAR(64)"),
        ("transfers",   "thumbnail_path",    "VARCHAR(500)"),
        ("user_files",  "thumbnail_path",    "VARCHAR(500)"),
    ]

    for table, column, col_type in migrations:
        try:
            db.session.execute(sqlalchemy.text(f"SELECT {column} FROM {table} LIMIT 1"))
        except Exception:
            db.session.rollback()
            try:
                db.session.execute(sqlalchemy.text(
                    f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"
                ))
                db.session.commit()
                app.logger.info(f"[TFS] Migration: added {table}.{column}")
            except Exception as e:
                db.session.rollback()
                app.logger.warning(f"[TFS] Migration skipped {table}.{column}: {e}")


def _seed_default_admin(app) -> None:
    """
    Creates the default app-level admin account on first boot.
    Credentials are read from ADMIN_EMAIL and ADMIN_PASSWORD env vars.
    Skipped entirely if any admin already exists in the DB.
    """
    import os, uuid
    from .models.user import User
    from .extensions import db

    try:
        if User.query.filter_by(role="admin").first():
            return  # At least one admin exists — nothing to seed
    except Exception:
        # DB schema might be outdated (missing columns) or tables don't exist yet.
        # We skip seeding and let the application (or init_db script) handle it.
        return

    email    = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("ADMIN_PASSWORD", "").strip()

    if not email or not password:
        app.logger.warning(
            "[TFS] No admin exists and ADMIN_EMAIL/ADMIN_PASSWORD are not set. "
            "Set these env vars to auto-create the default admin on next boot."
        )
        return

    from .services.auth_service import _validate_password
    if _validate_password(password):
        app.logger.warning(
            "[TFS] ADMIN_PASSWORD does not meet complexity requirements. "
            "Default admin was NOT created."
        )
        return

    admin = User(
        id=str(uuid.uuid4()),
        name="Administrator",
        email=email,
        role="admin",
        status="active",
        is_root=True,   # [Security] Superadmin — cannot be deleted, demoted, or suspended
    )
    admin.set_password(password)
    db.session.add(admin)
    db.session.commit()
    app.logger.info(f"[TFS] Default admin account created: {email}")