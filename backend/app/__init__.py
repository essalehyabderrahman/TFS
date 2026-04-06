import os
from flask import Flask
from .config import get_config
from .extensions import db, jwt, bcrypt, cors


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
    cors.init_app(app, resources={r"/*": {"origins": app.config["FRONTEND_URL"]}})

    # ── Blueprints ────────────────────────────────────────────────────────────
    from .routes.auth import auth_bp
    from .routes.transfers import transfers_bp
    from .routes.other import team_bp, audit_bp, account_bp, security_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(transfers_bp)
    app.register_blueprint(team_bp)
    app.register_blueprint(audit_bp)
    app.register_blueprint(account_bp)
    app.register_blueprint(security_bp)

    # ── DB init ───────────────────────────────────────────────────────────────
    with app.app_context():
        # Import models here (after extensions are bound) so SQLAlchemy
        # registers the tables before create_all() is called.
        from .models.user import User          # noqa: F401
        from .models.transfer import Transfer, FileVersion  # noqa: F401
        from .models.audit_log import AuditLog, ACLEntry   # noqa: F401
        db.create_all()

    return app