# Sales CRM Deployment on sPanel

This project has:

- `crm-frontend`: Vite + React frontend
- `crm-backend`: Node.js + MySQL backend that also serves the built frontend

## Recommended setup

- Single domain: `https://crm.hiqain.com`
- Frontend routes: `/`
- API routes: `/api/*`

This repo is now configured so the backend serves the frontend build directly. You do not need a second subdomain.

## 1. Push code to GitHub

Push the full `sales-crm` repository to GitHub first.

## 2. Prepare production env files

Backend `.env`:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=your_cpanel_database_name
DB_USER=your_cpanel_database_user
DB_PASSWORD=your_cpanel_database_password
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d
ALLOWED_ORIGINS=https://crm.hiqain.com
```

Frontend `.env.production`:

```env
VITE_API_URL=/api
```

## 3. Create MySQL database in sPanel

In the database section:

1. Create a database
2. Create a database user
3. Assign the user to the database with all privileges
4. Put those values into `crm-backend/.env`

The backend auto-creates required tables on startup through `ensureTables()`.

## 4. Deploy on sPanel

Use the Git or File Manager flow in sPanel to place the full repo on the server.

Then:

1. Open terminal/SSH in sPanel
2. Go to the project root
3. Install backend dependencies in `crm-backend`
4. Install frontend dependencies in `crm-frontend`
5. Build the frontend
6. Start or restart the Node.js app from `crm-backend/server.js`

Commands:

```bash
cd sales-crm/crm-backend
npm install

cd ../crm-frontend
npm install
npm run build
```

Set the Node app startup file to:

```text
server.js
```

And the app root to:

```text
crm-backend
```

## 5. Test

After restart, verify:

- `https://crm.hiqain.com/api/health`
- `https://crm.hiqain.com`

If both open, the CRM is deployed correctly.
