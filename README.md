# TFS — Trusted File System

TFS is a secure, end-to-end encrypted file transfer dashboard with robust authentication, role-based access control, and team management capabilities. 

## 🌟 Features

- **Secure Transfers**: AES-256 encryption for all file transfers.
- **Team & Group Management**: Group administrators can manage file sharing and team members.
- **Role-Based Access Control (RBAC)**: Distinct User, Admin, and Root Admin roles, with route-level authorization to restrict sensitive pages (like `/recovery-management`).
- **Audit Logging**: Comprehensive logging of user actions (logins, file uploads, downloads, permission changes).
- **Security & MFA**: 2FA/MFA support, session expiration handling, and granular account security settings.
- **Trash & File Lifecycle**: Soft-deletion for files with a centralized Trash/Recovery interface for admins and users.
- **Modern UI/UX**: Built with React, Tailwind CSS, shadcn/ui, fluid micro-animations (GSAP), and dynamic Light/Dark theme support.

## 🛠️ Technology Stack

**Frontend:**
- React 18 & TypeScript
- Vite 6
- React Router 7
- Tailwind CSS 4 & shadcn/ui (Radix UI)
- Zod for form validation
- GSAP & Three.js for interactive animations
- next-themes for Light/Dark mode

**Backend:**
- Python 3
- Flask 3
- Flask-SQLAlchemy & SQLite (for data storage)
- Flask-JWT-Extended (authentication)
- Flask-Bcrypt (password hashing)
- Flask-Limiter & Flask-Talisman (security)
- pyotp (MFA/2FA)

---

## 🚀 Getting Started

To run the full stack locally, follow these steps:

### 1. Backend Setup

The backend handles the API, authentication, database, and secure file encryption.

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
```

**Initialize the Database:**
Run the initialization script to create the SQLite database, tables, seed initial mock data, and generate encrypted physical mock files.

```bash
# Important: This will drop existing tables and recreate them.
python init_db.py
```

*Seed User Credentials (default from init_db):*
- Admin (Root): `admin@tfs.com` / `Admin@Secure#2026`
- User: `sarah.chen@tfs.com` / `Sarah@Secure#2026`

**Run the Backend Server:**
```bash
python run.py
```
*The API will run on `http://127.0.0.1:5000`.*

### 2. Frontend Setup

The frontend provides the interactive user dashboard.

```bash
cd frontend

# Install Node dependencies
npm install

# Configure environment variables
cp .env.example .env
# Make sure VITE_API_BASE_URL=http://127.0.0.1:5000 in your .env
```

**Run the Frontend Development Server:**
```bash
npm run dev
```
*The app will be accessible at `http://localhost:5173` (or port specified by Vite).*

---

## 📂 Project Structure

```
TFS/
├── backend/                  ← Flask API, Models, Routes, Database
│   ├── app/                  
│   ├── instance/             ← SQLite database (tfs.db)
│   ├── uploads/              ← Encrypted physical file storage
│   ├── init_db.py            ← Database reset and seeding script
│   ├── requirements.txt      ← Python dependencies
│   └── run.py                ← Application entry point
│
└── frontend/                 ← React SPA
    ├── src/
    │   ├── app/              ← Pages, Routes, Hooks, API client
    │   ├── components/       ← UI Components (shadcn/ui)
    │   ├── context/          ← React Context (AuthContext)
    │   ├── types/            ← TypeScript interfaces
    │   └── main.tsx          
    ├── package.json          
    └── vite.config.ts        
```

## 🔒 Security & Roles

- **Admin Routes**: Access to sensitive sections like Admin Settings, Team directory overrides, and Recovery Management is strictly protected by `AuthContext` (checking `isAppAdmin` and `isRootAdmin`).
- **File Encryption**: Files are encrypted at rest using AES-256 before being placed in the `backend/uploads` directory.

## 📝 Important Notes

- **Data Mocking**: If the frontend cannot reach the backend API, it will fallback to using mock data (handled in `frontend/src/app/api`). To ensure you're interacting with real database items, verify the backend is running.
- **Themes**: The application supports dynamic dark and light mode, controlled via `ThemeProvider`. 
