# Ads CRM - Campaign Management System

A full-stack web CRM for managing advertising agency clients. Tracks client balances (BDT/USD), statuses, executive assignments, ad accounts, and integrates with Google Sheets for two-way transaction sync.

## Features

- **Client Dashboard** — View all clients with balance, status (Active/Inactive/Hold), executive assignments, and search/filter
- **Transaction Tracking** — Per-client payment history with BDT amounts, USD ad spend, platform breakdown
- **Google Sheets Sync** — Two-way sync: import transactions from client sheets, push new payments back
- **Bulk Payments** — Paste WhatsApp-format payment notes to process multiple payments at once with automatic sheet sync
- **Duplicate Prevention** — Automatic detection of duplicate payment entries
- **Dashboard Stats** — Total balance, outstanding, campaign due, client counts by status

## Tech Stack

- **Frontend**: React + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Integration**: Google Sheets API (Service Account or Replit Connector)

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Google Cloud Service Account with Sheets API enabled (for Google Sheets integration)

## Setup

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd ads-crm
npm install
```

### 2. Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Random string for session encryption
- `GOOGLE_SERVICE_ACCOUNT_JSON` — Google Service Account credentials (JSON string)

### 3. Database Setup

Push the schema to your database:

```bash
npm run db:push
```

### 4. Google Sheets Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project and enable the **Google Sheets API**
3. Create a **Service Account** and download the JSON key
4. Paste the JSON key content into `GOOGLE_SERVICE_ACCOUNT_JSON` in your `.env` file
5. Share your Google Sheets with the service account email (found in the JSON key as `client_email`)

### 5. Run

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

The app runs on `http://localhost:5000` by default (configurable via `PORT`).

## Deployment

### Docker

```bash
docker build -t ads-crm .
docker run -p 5000:5000 --env-file .env ads-crm
```

### Railway / Render / Fly.io

1. Connect your GitHub repo
2. Set the environment variables from `.env.example`
3. Set build command: `npm run build`
4. Set start command: `npm start`

### VPS / Self-hosting

1. Install Node.js 20+ and PostgreSQL
2. Clone the repo and run `npm install`
3. Set up `.env` with your database URL and credentials
4. Run `npm run build && npm start`
5. Use a reverse proxy (nginx/caddy) to serve on port 80/443

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/          # Dashboard, Client Detail, Bulk Payments
│   │   ├── components/     # Sidebar, UI components (shadcn)
│   │   ├── hooks/          # Custom hooks
│   │   └── lib/            # Utilities (formatting, query client)
│   └── index.html
├── server/                 # Express backend
│   ├── index.ts            # Entry point
│   ├── routes.ts           # API routes
│   ├── storage.ts          # Data access layer
│   ├── googleSheets.ts     # Google Sheets integration
│   ├── db.ts               # Database connection
│   ├── vite.ts             # Dev server setup
│   └── static.ts           # Production static file serving
├── shared/
│   └── schema.ts           # Database schema (Drizzle)
├── script/
│   └── build.ts            # Production build script
└── migrations/             # Database migrations
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/clients` | List all clients |
| GET | `/api/clients/:id` | Get single client |
| POST | `/api/clients` | Create client |
| PUT | `/api/clients/:id` | Update client |
| DELETE | `/api/clients/:id` | Delete client |
| GET | `/api/clients/:id/transactions` | Get client transactions |
| POST | `/api/clients/:id/transactions` | Add transaction |
| POST | `/api/clients/:id/sync` | Sync from Google Sheet |
| POST | `/api/sync-all` | Sync all client sheets |
| POST | `/api/bulk-payments` | Process bulk payment notes |
| GET | `/api/bulk-payments/history` | Payment history |
| POST | `/api/bulk-payments/push-to-sheet` | Push transaction to sheet |
| GET | `/api/stats` | Dashboard statistics |
| POST | `/api/import-sheet` | Import clients from main sheet |

## Bulk Payment Format

Payments are pasted as WhatsApp-style notes:
```
DD/MM/YY/cli-XXXX/lst-method/pay-amount
```

Example:
```
08/03/26/cli-1439/lst-bank/pay-1500
07/03/26/cli-1395/lst-bkash/pay-500
```

## License

MIT
