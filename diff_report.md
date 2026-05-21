# TFS Project Comparison Report

| | Local Workspace (`d:\TFS`) | Cloned Repo (`d:\TFS\tfs1\TFS`) |
|---|---|---|
| **Version** | v2.9 (latest local commit) | Initial commit (from GitHub) |
| **Git commits** | 5 local commits | 10 commits (older history shared) |

> [!IMPORTANT]
> The **cloned GitHub repo** (`tfs1/TFS`) is the **more developed version**. It replaces the password recovery management system with a **storage quota management system**, and adds several backend security/architecture improvements.

---

## 1. Files Exclusive to Each Version

### Only in Local Workspace (A) — **Removed in GitHub version**
These files exist locally but are **absent** from the GitHub repo (i.e. the feature was dropped or replaced):

| File | Purpose |
|---|---|
| `backend/app/models/recovery_request.py` | DB model for password recovery requests |
| `frontend/src/app/pages/RecoveryManagement.tsx` | Admin UI for managing recovery requests |
| `frontend/public/index.html` | Static public HTML (not present in cloned repo) |

### Only in GitHub Repo (B) — **New features added**
These files are **new** in the cloned version and don't exist locally:

| File | Purpose |
|---|---|
| `backend/app/middleware/acl_middleware.py` | New ACL middleware — resolves effective user permissions on a file |
| `backend/app/models/quota_request.py` | DB model for user storage quota increase requests |
| `backend/app/routes/quota_requests.py` | REST endpoints for quota request management |
| `backend/app/services/quota_service.py` | Business logic: check/enforce user and group storage quotas |
| `frontend/src/app/api/quota-requests.ts` | Frontend API client for quota requests |
| `frontend/src/app/components/QuotaBar.tsx` | Visual storage quota progress bar component |
| `frontend/src/app/pages/QuotaRequests.tsx` | Admin/group-admin UI for managing quota requests |

---

## 2. Modified Files — Backend

### `backend/app/__init__.py` (+3.2 KB)
- **Added project docblock** with full _cahier des charges_ compliance mapping (§1–§9).
- **SQLite WAL mode**: New `_configure_sqlite()` listener that applies `PRAGMA journal_mode=WAL`, `PRAGMA busy_timeout=5000`, and `PRAGMA foreign_keys=ON` on every connection — enables concurrent reads during writes (§4 concurrency requirement).
- **New blueprint registered**: `quota_requests_bp` imported and registered.
- **New model imported**: `QuotaRequest` added to `create_all()` context.
- **New `_migrate_columns()` function**: Idempotent schema migration that adds `storage_quota_bytes` (BIGINT) to both `users` and `groups` tables if they don't already exist — safe for SQLite and PostgreSQL.

### `backend/app/config.py` (+1.5 KB)
- **SQLAlchemy engine options added**: `connect_args={"timeout": 15}` and `pool_pre_ping=True` for WAL/concurrency support.
- **`ALLOWED_EXTENSIONS` massively expanded**: From ~10 extensions to 60+, now covering:
  - Office/documents: `rtf`, `xls`, `xlsx`, `ppt`, `pptx`, `odt`, `ods`, `odp`
  - Images: `webp`, `svg`, `bmp`, `ico`
  - Video/audio: `mov`, `avi`, `mkv`, `webm`, `mp3`, `wav`, `ogg`
  - Archives: `tar`, `gz`, `rar`, `7z`, `bz2`
  - **Full developer source code support**: `py`, `js`, `ts`, `tsx`, `jsx`, `java`, `c`, `cpp`, `go`, `rs`, `rb`, `php`, etc.
  - Config/data: `json`, `xml`, `yaml`, `toml`, `ini`, `env`, `md`
  - DevOps: `dockerfile`, `tf`, `hcl`
  - Database: `sql`, `db`, `sqlite`, `log`
  - Design: `sketch`, `fig`, `ai`, `psd`

### `backend/app/middleware/auth_middleware.py` (minor)
- Simplified `password_reset_required` allowed endpoints: removed `"auth.signout"` from the bypass list. Only `"account.change_password"` and `"account.get_account"` are now permitted.

### `backend/app/models/__init__.py`
- Removed the `RecoveryRequest` import (recovery system dropped).

### `backend/app/models/audit_log.py` (`ACLEntry` model)
- **New `can_download` column** added to `ACLEntry` (boolean, default `True`) — separate download permission from read permission.
- **Two new DB indexes** added on `ACLEntry`: `ix_acl_transfer` and `ix_acl_user` for query performance.
- `to_dict()` now includes `canDownload`.
- `__repr__` now shows `DL` flag.

### `backend/app/models/group.py`
- **`Group` model**: Added `storage_quota_bytes` (BigInteger, nullable) — `None` = unlimited.
  - `to_dict()` now includes `storageQuotaBytes`.
- **`GroupSettings` model**: Added `allow_group_transfers` (boolean, default `False`) — new group-level toggle controlling whether non-admin members can see/upload group files.
  - `to_dict()` now includes `allowGroupTransfers`.

### `backend/app/models/user.py`
- **New `storage_quota_bytes` column** (BigInteger, nullable — `None` = unlimited).
- `to_dict()` now includes `storageQuotaBytes`.

### `backend/app/routes/auth.py` (major rewrite of recovery section, −300/+90 lines)
The **entire password recovery admin workflow was removed** and replaced with a simpler email-forwarding mechanism:

| Removed (Local) | Replaced With (GitHub) |
|---|---|
| `RecoveryRequest` DB storage | Stateless — sends email directly to admin |
| `GET /auth/recovery-requests` | _(gone)_ |
| `POST /auth/recovery-requests/<id>/reject` | _(gone)_ |
| `POST /auth/recovery-requests/<id>/set-password` | _(gone)_ |
| `POST /auth/recovery-requests/<id>/send-email` | _(gone)_ |
| MFA verification gate on recovery requests | _(gone)_ |
| Admin notifications via `Notification` model | _(gone)_ |

The new `POST /auth/recovery-request` simply constructs a French-language email and sends it via SMTP directly to the admin's inbox. No DB storage, no multi-step approval workflow.

### `backend/app/routes/groups.py` (+3 KB)
- **`GET /groups`**: Now includes `quotaInfo` (from `quota_service.get_group_quota_info()`) in each group's response.
- **`GET /groups/<id>/transfers`**: Now gated by `allow_group_transfers` setting — non-admin members are blocked with `GROUP_TRANSFERS_DISABLED` if the setting is off. Returns per-file `permissions` dict using new ACL middleware.
- **`POST /groups/<id>/transfers`** (upload): Also gated by `allow_group_transfers`. Now returns `413` on `QUOTA_EXCEEDED` / `GROUP_QUOTA_EXCEEDED` errors.
- **New `GET /groups/<id>/quota`** endpoint: Returns quota info for a group.
- **`PATCH /groups/<id>/settings`**: Now handles `allowGroupTransfers` field and `storageQuotaBytes` (with MB/GB conversion).
- **New Group Quota Management Dialog** in `GroupWorkspace.tsx` is wired to this endpoint.

### `backend/app/routes/other.py` (net −88/+40 lines)
- **New `GET /team/search`** endpoint: Email-prefix search (admin-only, min 2 chars, returns ≤5 users) for invite autocomplete.
- **`PATCH /team/<user_id>`**: Now supports `storageQuota` field — admin can set/remove user-level quota.
- **Removed**: Entire `POST /team/<user_id>/send-password-email` endpoint (the SMTP password-email-sending workflow for admins was dropped).
- **`GET /team/account`**: Now includes `quotaInfo` and `pendingQuotaRequest` in the response.

### `backend/app/routes/transfers.py` (+1 KB)
- Now imports `requires_permission` and `resolve_effective_permissions` from new ACL middleware.
- Upload (`POST`) now returns `413` on quota errors.
- Download/preview: Context is now hardcoded (`"download"` / `"preview"`) instead of taken from query param.
- **New `GET /transfers/<id>/permissions`** endpoint: Returns effective permissions for the authenticated user on a given transfer.
- **`PUT /transfers/<id>/acl`** (grant): Now includes `canDownload` flag in both bulk and individual grant flows. External sharing policy enforcement was removed (no longer blocks cross-group shares in this route).

### `backend/app/services/file_service.py` (+3.8 KB)
- **`has_permission()`** refactored:
  - Supports new `"download"` permission type.
  - **Recipient email check added**: If user's email matches `transfer.recipient_email`, read is granted implicitly.
  - ACL flag mapping expanded with `"download": "can_download"`.
  - `can_write` implies `can_read` (write users can always see content).
  - Group members now get `read` AND `download` by default (previously only `read`).
- **New `_DANGEROUS_MAGIC_BYTES` list + `_validate_file_content()` function**: Detects executables/scripts by magic bytes (PE, ELF, Mach-O, shell scripts) even if renamed — blocks malicious uploads (§6 security requirement).
- **Quota check before disk write**: Before saving any file, calls `check_group_quota()` for group uploads or `check_quota()` for personal uploads. Returns `QUOTA_EXCEEDED` / `GROUP_QUOTA_EXCEEDED` on failure.
- Transfer `status` now defaults to `"Delivered"` for both recipient_email **and** group_id uploads (previously only recipient_email).
- Download permission check now uses `"download"` perm type; preview uses `"read"`.

### `backend/init_db.py`
- Removed `RecoveryRequest` import.
- Both test `GroupSettings` now have `allow_group_transfers=True` seeded.

---

## 3. Modified Files — Frontend

### `frontend/index.html`
- Favicon changed from `favicon.png` → `favicon.svg`.

### `frontend/package.json` / `package-lock.json`
- **New dependency added**: `mammoth ^1.12.0` — a Word `.docx`-to-HTML converter, used in the file viewer for Word document preview.
- Several `@types/*` packages changed from `dev` to `devOptional`.

### `frontend/src/styles/theme.css` (major)
- **Complete dark-mode theme overhaul** — `:root` variables replaced from a light-mode palette to a **dark-mode-first** design:
  - Background: `#0a0e1a` (deep navy)
  - Foreground: `#e8eaf0`
  - Card: `rgba(255,255,255,0.04)` (glassmorphism)
  - Primary: `#00d2ff` (cyan)
  - Border: `rgba(255,255,255,0.08)`
  - Chart colors: cyan, purple, pink, emerald, amber
  - Sidebar: matches main dark background
  - Glass tokens updated to dark-glass
- Removed the `.dark input[type="date"]` calendar picker hack (no longer needed as dark is now default).

### `frontend/src/app/routes.tsx`
- `RecoveryManagement` page **removed** from routes.
- `QuotaRequests` page **added** at `/quota-requests`, wrapped in `AdminOrGroupAdminRoute`.

### `frontend/src/app/context/AuthContext.tsx`
- Changes to auth context (details in raw diff — likely quota-related fields added to user context).

### `frontend/src/app/api/auth.ts`
- Recovery request API calls updated to match simpler payload (`fullName`, `email`, `registrationDate`, `lastFile`, `message` — removed MFA code field).

### `frontend/src/app/api/team.ts`
- Removed `apiAdminSendPasswordEmail` export (feature dropped).

### `frontend/src/app/api/transfers.ts`
- Updated to support `canDownload` in ACL grant payloads.

### `frontend/src/app/api/groups.ts`
- Updated to include quota-related fields in group settings update calls.

### `frontend/src/app/api/client.ts`
- Minor client changes (likely error handling for `413` quota errors).

### `frontend/src/app/components/Header.tsx`
- Changes likely related to quota display or navigation updates.

### `frontend/src/app/components/Sidebar.tsx`
- `RecoveryManagement` nav link replaced with `QuotaRequests` link.

### `frontend/src/app/components/MainLayout.tsx`
- Layout changes (likely theme/CSS variable updates).

### `frontend/src/app/components/StatsBar.tsx`
- Likely now shows quota usage alongside storage stats.

### `frontend/src/app/components/ProtectedRoute.tsx`
- Added `AdminOrGroupAdminRoute` guard (used for `QuotaRequests` page).

### `frontend/src/app/components/SessionExpiredModal.tsx`
- Minor changes (likely theme variable references).

### `frontend/src/app/components/TransfersTable.tsx`
- Updated to conditionally show Download button based on `canDownload` permission.

### `frontend/src/app/components/UploadZone.tsx`
- Likely handles `413 QUOTA_EXCEEDED` error responses.

### `frontend/src/app/components/EncryptionChoiceModal.tsx`
- Minor changes.

### `frontend/src/app/components/ui/AclModal.tsx`
- Now includes `canDownload` toggle in the ACL permission editor UI.

### `frontend/src/app/components/ui/FileViewer.tsx`
- Added Word document (`.docx`) preview support via `mammoth` library.

### `frontend/src/app/components/ui/BackgroundParticles.tsx`
- Minor changes.

### `frontend/src/app/components/ui/ParticleLock.tsx`
- Minor changes.

### `frontend/src/app/pages/AccountManagement.tsx`
- Now displays `quotaInfo` and `pendingQuotaRequest` from the account endpoint. Likely shows a quota bar and quota request button.

### `frontend/src/app/pages/ActiveTransfers.tsx`
- Updates to match new permission model (`canDownload`).

### `frontend/src/app/pages/Contacts.tsx`
- Minor changes.

### `frontend/src/app/pages/FileExplorer.tsx`
- Major changes: Now uses `canRead()` / `canDownload()` permission helper functions to conditionally show Preview/Download buttons. Adds Group Quota Management dialog for admins (allows setting MB/GB quota per group with unlimited toggle).

### `frontend/src/app/pages/ForgotPassword.tsx`
- Simplified — removed MFA code field from recovery form. Now just `fullName`, `email`, `registrationDate`, `lastFile`, `message`.

### `frontend/src/app/pages/GroupWorkspace.tsx`
- Significant update: per-file permission display, quota-gated upload/listing with `GROUP_TRANSFERS_DISABLED` error handling, Group Quota Management dialog.

### `frontend/src/app/pages/TeamManagement.tsx`
- Added `allowGroupTransfers` toggle in group settings panel (alongside existing `allowExternalSharing`).

### `frontend/src/app/pages/UserManagement.tsx` (major rewrite)
- **Removed**: Multi-step "set password + compose email + send" workflow with copy/regenerate buttons, email composer UI, SMTP warning banner.
- **Added**: Simple "Set Password" dialog (just an input + button).
- **Added**: "Configure Storage Quota" dialog (MB/GB input with unit toggle, unlimited checkbox, current quota display).
- New `HardDrive` icon button added per user row to open quota dialog.
- Password flow no longer auto-generates a preview password or opens an email composer after setting.

---

## 4. Summary of Feature Changes

| Feature | Local Workspace | GitHub Repo |
|---|---|---|
| Password Recovery System | ✅ Full DB-backed workflow (request, approve, reject, set-pw, send-email) | ❌ Replaced — simple email-forward only |
| Admin Recovery Management UI | ✅ `RecoveryManagement.tsx` page | ❌ Removed |
| Storage Quota (User) | ❌ No quota | ✅ Per-user quota (`storage_quota_bytes`) |
| Storage Quota (Group) | ❌ No quota | ✅ Per-group quota with request/approval flow |
| Quota Requests Page | ❌ | ✅ `QuotaRequests.tsx` (admin/group-admin) |
| QuotaBar Component | ❌ | ✅ Visual quota progress bar |
| `canDownload` ACL permission | ❌ | ✅ Separate from `canRead` |
| ACL Middleware | ❌ | ✅ `acl_middleware.py` with `resolve_effective_permissions()` |
| Malicious file detection | ❌ | ✅ Magic-byte scanner in `file_service.py` |
| SQLite WAL mode | ❌ | ✅ WAL + busy_timeout + foreign_keys |
| Idempotent DB migrations | ❌ | ✅ `_migrate_columns()` |
| Allowed file extensions | ~10 types | 60+ types (full dev stack support) |
| Group file access toggle | ❌ | ✅ `allow_group_transfers` setting |
| `GET /team/search` endpoint | ❌ | ✅ Email-prefix search for invite autocomplete |
| Admin set-password + send email | ✅ Combined workflow | ❌ Simplified — set password only, no email |
| Word document preview | ❌ | ✅ Via `mammoth` library |
| Theme | Light-mode default | Dark-mode default (`#0a0e1a` navy) |
| Favicon | `.png` | `.svg` |

---

## 5. Statistics

| Metric | Count |
|---|---|
| Total common files compared | 147 |
| Files with differences | **45** |
| Files only in local workspace | 3 |
| Files only in GitHub repo | 7 |
| Net new files in GitHub repo | +4 |
