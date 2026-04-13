import os
from flask import Flask, request, jsonify
from .config import get_config
from .extensions import db, jwt, bcrypt, cors, limiter, init_talisman
from .middleware.csrf_middleware import init_csrf


def create_app() -> Flask:
    app = Flask(__name__, instance_relative_config=True)

    # ── Config ────────────────────────────────────────────────────────────────
    app.config.from_object(get_config())

    # Ensure instance + upload folders exist
    os.makedirs(app.instance_path, exist_ok=True)
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    # ── Extensions ────────────────────────────────────────────────────────────
    db.init_app(app)
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
        ip = request.headers.get("X-Forwarded-For", request.remote_addr)
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

    app.register_blueprint(auth_bp)
    app.register_blueprint(transfers_bp)
    app.register_blueprint(team_bp)
    app.register_blueprint(audit_bp)
    app.register_blueprint(account_bp)
    app.register_blueprint(security_bp)
    app.register_blueprint(notifications_bp)

    # [Security] Register CSRF Double Submit Cookie protection
    init_csrf(app)

    # ── Security Headers ──────────────────────────────────────────────────────
    # Removed legacy hooks — now handled by Flask-Talisman in create_app()

    # ── DB init ───────────────────────────────────────────────────────────────
    with app.app_context():
        # Import models here (after extensions are bound) so SQLAlchemy
        # registers the tables before create_all() is called.
        from .models.user import User          # noqa: F401
        from .models.transfer import Transfer, FileVersion  # noqa: F401
        from .models.audit_log import AuditLog, ACLEntry   # noqa: F401
        from .models.notification import Notification # noqa: F401
        db.create_all()

    # [Security] Initialize Talisman last because it wraps the WSGI app
    init_talisman(app)

    return app