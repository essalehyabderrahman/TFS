# TFS — Trusted File System

Dashboard sécurisé de transfert de fichiers, construit avec React + Vite + TypeScript + Tailwind.

## Structure

```
TFS/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .env.example          ← copier en .env pour configurer le backend
└── src/
    ├── main.tsx
    ├── types/            ← interfaces TypeScript partagées
    ├── mocks/            ← données de développement
    ├── styles/
    └── app/
        ├── App.tsx
        ├── routes.ts     ← / /signin /signup publics | /app/* protégés
        ├── context/      ← AuthContext (useAuth)
        ├── hooks/        ← useTransfers, useTeam
        ├── api/          ← client HTTP + fallback mock automatique
        ├── pages/
        └── components/
```

## Démarrage

```bash
npm install
npm run dev
```

## Backend (optionnel)

Sans backend, l'app tourne entièrement avec des données mock.
Pour brancher un vrai backend, créez `.env` :

```env
VITE_API_BASE_URL=https://votre-api.com
```

## Routes

| Chemin         | Accès     | Page                |
| -------------- | --------- | ------------------- |
| `/`            | Public    | Landing (Welcome)   |
| `/signin`      | Public    | Connexion           |
| `/signup`      | Public    | Inscription         |
| `/app`         | Protégé   | Transferts actifs   |
| `/app/team`    | Protégé   | Gestion équipe      |
| `/app/security`| Protégé   | Paramètres sécurité |
| `/app/audit`   | Protégé   | Journaux d'audit    |
| `/app/account` | Protégé   | Mon compte          |

## Stack

- **React 18** + **TypeScript** strict
- **Vite 6** — build et dev server
- **React Router 7** — routing côté client
- **Zod** — validation des formulaires
- **Tailwind 4** — styles utilitaires
- **shadcn/ui** — composants Radix UI
- **date-fns** — formatage des dates
