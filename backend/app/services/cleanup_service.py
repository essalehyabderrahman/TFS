"""
TFS — Automated Cleanup Service
Runs daily background tasks:
  1. purge_expired_transfers  — hard-delete files whose expiry_date has passed
  2. purge_old_trash          — hard-delete trash items older than 30 days
  3. prune_audit_logs         — delete AuditLog rows older than 1 year
  4. remove_orphaned_files    — delete physical files with no DB record
"""
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta

from flask import Flask

log = logging.getLogger("tfs.cleanup")


# ── helpers ───────────────────────────────────────────────────────────────────

def _system_log(app, action: str, details: str, status: str = "success") -> None:
    """Write a system-level AuditLog row (no user, no IP)."""
    with app.app_context():
        from app.extensions import db
        from app.models.audit_log import AuditLog
        db.session.add(AuditLog(
            id=str(uuid.uuid4()),
            user_id=None,
            user_email="system",
            action=action,
            resource="cleanup_service",
            ip_address="127.0.0.1",
            status=status,
            details=details,
        ))
        db.session.commit()


def _hard_delete(app, transfer) -> list[str]:
    """
    Physically remove all on-disk paths for a Transfer and its FileVersions,
    then delete the DB row (cascade handles children and ACL entries).
    Returns the list of paths that were successfully removed.
    """
    from app.extensions import db
    from app.models.transfer import Transfer, FileVersion

    deleted: list[str] = []

    def _gather(item):
        if item.stored_path:
            yield item.stored_path
        for v in item.versions:
            if v.stored_path:
                yield v.stored_path
        for child in Transfer.query.filter_by(parent_id=item.id).all():
            yield from _gather(child)

    for path in _gather(transfer):
        if path and os.path.exists(path):
            from app.services.file_service import _is_path_shared
            if _is_path_shared(path):
                continue  # another record still references this file
            try:
                os.remove(path)
                deleted.append(path)
            except Exception as exc:
                log.warning("[cleanup] Could not remove %s: %s", path, exc)

    db.session.delete(transfer)
    return deleted


# ── task 1 — expired transfers ────────────────────────────────────────────────

def purge_expired_transfers(app: Flask) -> None:
    """Hard-delete transfers whose expiry_date has passed and are not yet deleted."""
    with app.app_context():
        from app.extensions import db
        from app.models.transfer import Transfer

        now = datetime.now(timezone.utc)
        expired = Transfer.query.filter(
            Transfer.is_deleted == False,
            Transfer.expiry_date.isnot(None),
            Transfer.expiry_date < now,
        ).all()

        if not expired:
            log.info("[cleanup] purge_expired_transfers: nothing to do")
            return

        count = 0
        for t in expired:
            try:
                _hard_delete(app, t)
                count += 1
            except Exception as exc:
                db.session.rollback()
                log.error("[cleanup] Failed to purge expired transfer %s: %s", t.id, exc)

        db.session.commit()
        msg = f"Purged {count} expired transfer(s)."
        log.info("[cleanup] %s", msg)
        _system_log(app, "CLEANUP_EXPIRED_TRANSFERS", msg)


# ── task 2 — old trash ────────────────────────────────────────────────────────

TRASH_RETENTION_DAYS = 30

def purge_old_trash(app: Flask) -> None:
    """Hard-delete trashed items that have been in the bin for >30 days."""
    with app.app_context():
        from app.extensions import db
        from app.models.transfer import Transfer

        cutoff = datetime.now(timezone.utc) - timedelta(days=TRASH_RETENTION_DAYS)

        stale = Transfer.query.filter(
            Transfer.is_deleted == True,
            Transfer.trashed_at.isnot(None),
            Transfer.trashed_at < cutoff,
            Transfer.parent_id.is_(None),   # top-level only; children cascade
        ).all()

        if not stale:
            log.info("[cleanup] purge_old_trash: nothing to do")
            return

        count = 0
        for t in stale:
            try:
                _hard_delete(app, t)
                count += 1
            except Exception as exc:
                db.session.rollback()
                log.error("[cleanup] Failed to purge trashed transfer %s: %s", t.id, exc)

        db.session.commit()
        msg = f"Permanently deleted {count} item(s) older than {TRASH_RETENTION_DAYS} days."
        log.info("[cleanup] %s", msg)
        _system_log(app, "CLEANUP_OLD_TRASH", msg)


# ── task 3 — audit log pruning ────────────────────────────────────────────────

AUDIT_RETENTION_DAYS = 365

def prune_audit_logs(app: Flask) -> None:
    """Delete AuditLog rows older than 1 year to keep the table fast."""
    with app.app_context():
        from app.extensions import db
        from app.models.audit_log import AuditLog

        cutoff = datetime.now(timezone.utc) - timedelta(days=AUDIT_RETENTION_DAYS)
        deleted = (
            db.session.query(AuditLog)
            .filter(AuditLog.timestamp < cutoff)
            .delete(synchronize_session=False)
        )
        db.session.commit()

        msg = f"Pruned {deleted} audit log row(s) older than {AUDIT_RETENTION_DAYS} days."
        log.info("[cleanup] %s", msg)
        if deleted:
            _system_log(app, "CLEANUP_AUDIT_LOGS", msg)


# ── task 4 — orphaned file removal ────────────────────────────────────────────

def remove_orphaned_files(app: Flask) -> None:
    """
    Scan the uploads directory and delete any physical file that has no
    matching stored_path in transfers, file_versions, or user_files.
    """
    with app.app_context():
        from app.extensions import db
        from app.models.transfer import Transfer, FileVersion
        from app.models.user_file import UserFile

        upload_folder = app.config.get("UPLOAD_FOLDER", "")
        if not upload_folder or not os.path.isdir(upload_folder):
            log.warning("[cleanup] UPLOAD_FOLDER not set or missing; skipping orphan scan.")
            return

        # Build the set of all known on-disk paths from the DB
        known: set[str] = set()

        for (path,) in db.session.query(Transfer.stored_path).filter(
            Transfer.stored_path.isnot(None)
        ).all():
            known.add(os.path.normpath(path))

        for (path,) in db.session.query(FileVersion.stored_path).filter(
            FileVersion.stored_path.isnot(None)
        ).all():
            known.add(os.path.normpath(path))

        for (path,) in db.session.query(UserFile.stored_path).filter(
            UserFile.stored_path.isnot(None)
        ).all():
            known.add(os.path.normpath(path))

        orphans: list[str] = []
        for dirpath, _dirnames, filenames in os.walk(upload_folder):
            for fname in filenames:
                full_path = os.path.normpath(os.path.join(dirpath, fname))
                if full_path not in known:
                    orphans.append(full_path)

        if not orphans:
            log.info("[cleanup] remove_orphaned_files: no orphans found.")
            return

        removed = 0
        for path in orphans:
            try:
                os.remove(path)
                removed += 1
                log.info("[cleanup] Removed orphan: %s", path)
            except Exception as exc:
                log.warning("[cleanup] Could not remove orphan %s: %s", path, exc)

        msg = f"Removed {removed} orphaned file(s) from disk."
        log.info("[cleanup] %s", msg)
        _system_log(app, "CLEANUP_ORPHANED_FILES", msg)


# ── scheduler registration ────────────────────────────────────────────────────

def init_scheduler(app: Flask) -> None:
    """
    Register all cleanup tasks with APScheduler and start the background scheduler.
    Safe to call multiple times — skips if already running (e.g. Flask reloader).
    """
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger

    scheduler = BackgroundScheduler(timezone="UTC", daemon=True)

    scheduler.add_job(
        func=purge_expired_transfers,
        trigger=CronTrigger(hour=2, minute=0),
        args=[app],
        id="purge_expired_transfers",
        replace_existing=True,
    )
    scheduler.add_job(
        func=purge_old_trash,
        trigger=CronTrigger(hour=2, minute=15),
        args=[app],
        id="purge_old_trash",
        replace_existing=True,
    )
    scheduler.add_job(
        func=prune_audit_logs,
        trigger=CronTrigger(hour=2, minute=30),
        args=[app],
        id="prune_audit_logs",
        replace_existing=True,
    )
    scheduler.add_job(
        func=remove_orphaned_files,
        trigger=CronTrigger(hour=3, minute=0),
        args=[app],
        id="remove_orphaned_files",
        replace_existing=True,
    )

    from app.services.thumbnail_service import process_pending_thumbnails
    scheduler.add_job(
        func=process_pending_thumbnails,
        trigger=CronTrigger(minute="*/5"),
        args=[app],
        id="process_pending_thumbnails",
        replace_existing=True,
    )

    scheduler.start()
    app.logger.info("[TFS] Cleanup scheduler started (4 daily tasks registered).")