# Ads CRM - Campaign Management System

A full-stack web CRM for managing advertising agency clients. Tracks client balances (BDT/USD), statuses, executive assignments, ad accounts, and integrates with Google Sheets for two-way transaction sync.

## Features

- **Client Dashboard** — View all clients with balance, status (Active/Inactive/Hold), executive assignments, and search/filter
- **Transaction Tracking** — Per-client payment history with BDT amounts, USD ad spend, platform breakdown
- **Google Sheets Sync** — Two-way sync: import transactions from client sheets, push new payments back
- **Bulk Payments** — Paste WhatsApp-format payment notes to process multiple payments at once with automatic sheet sync
- **Duplicate Prevention** — Automatic detection of duplicate payment entries
- **Dashboard Stats** — Total balance, outstanding, campaign due, client counts by status
- **AI Assistant** — Natural language chat to query data, add payments, sync sheets, update statuses (supports DeepSeek, Gemini, OpenAI, OpenRouter)
- **Ad Platform Integration** — Connect Facebook/Meta, Google Ads, and TikTok ad accounts to view campaigns and performance metrics
- **Facebook OAuth Login** — One-click login to auto-discover and connect all Facebook ad accounts
- **Responsive Design** — Works on desktop, tablet, and mobile

## Tech Stack

- **Frontend**: React + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Integration**: Google Sheets API (Service Account)

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
- `GOOGLE_SERVICE_ACCOUNT_JSON` — Google Service Account credentials (JSON string)

Optional variables:
- `FACEBOOK_APP_ID` — Facebook App ID for OAuth login
- `FACEBOOK_APP_SECRET` — Facebook App Secret for OAuth login
- `GOOGLE_ADS_DEVELOPER_TOKEN` — Google Ads developer token (for Google Ads campaign tracking)

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

### 5. Facebook Login Setup (optional)

1. Go to [Meta for Developers](https://developers.facebook.com)
2. Create an app → select "Create & manage ads with Marketing API"
3. Go to **Settings → Basic** to get your App ID and App Secret
4. Add **Facebook Login** product and set the redirect URI to: `https://yourdomain.com/api/facebook/callback`
5. Add `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` to your `.env`

### 6. Custom Logo (optional)

Place your logo file at `client/public/logo.png`. It will appear in the sidebar. If no logo is provided, a default icon is shown.

Replace the favicon at `client/public/favicon.png` with your own.

### 7. Run

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

# Run database migrations (one-time or on schema changes)
docker run --rm --env-file .env ads-crm npx drizzle-kit push --force

# Start the app
docker run -d -p 5000:5000 --env-file .env ads-crm
```

### Heroku

```bash
heroku create your-app-name
heroku addons:create heroku-postgresql:essential-0
heroku config:set SESSION_SECRET=your_secret_here
heroku config:set GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
git push heroku main
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
4. Run `npm run db:push` to create database tables
5. Run `npm run build && npm start`
6. Use a reverse proxy (nginx/caddy) to serve on port 80/443

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/          # Dashboard, Client Detail, Bulk Payments, AI Assistant, Ad Accounts
│   │   ├── components/     # Sidebar, UI components (shadcn)
│   │   ├── hooks/          # Custom hooks
│   │   └── lib/            # Utilities (formatting, query client)
│   ├── public/             # Static assets (favicon, logo)
│   └── index.html
├── server/                 # Express backend
│   ├── index.ts            # Entry point
│   ├── routes.ts           # API routes
│   ├── storage.ts          # Data access layer
│   ├── googleSheets.ts     # Google Sheets integration
│   ├── ai.ts               # AI assistant with tool-calling
│   ├── adPlatforms.ts      # Facebook, Google Ads, TikTok API integrations
│   ├── db.ts               # Database connection
│   ├── vite.ts             # Dev server setup
│   └── static.ts           # Production static file serving
├── shared/
│   └── schema.ts           # Database schema (Drizzle)
├── script/
│   └── build.ts            # Production build script
├── Dockerfile              # Docker container config
├── Procfile                # Heroku process file
└── .env.example            # Environment variable template
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
| GET | `/api/ai/settings` | Get AI provider config |
| POST | `/api/ai/settings` | Save AI provider settings |
| POST | `/api/ai/chat` | Send message to AI assistant |
| GET | `/api/ad-accounts` | List connected ad accounts |
| POST | `/api/ad-accounts` | Add ad account |
| POST | `/api/ad-accounts/discover` | Auto-discover accounts from token |
| DELETE | `/api/ad-accounts/:id` | Remove ad account |
| GET | `/api/ad-accounts/:id/campaigns` | Fetch live campaign data |
| GET | `/api/facebook/login` | Start Facebook OAuth login |
| GET | `/api/facebook/callback` | Facebook OAuth callback |

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
