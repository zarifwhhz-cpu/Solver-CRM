# Ads CRM - Campaign Management System

## Overview
A web-based CRM for managing Facebook/TikTok ad campaign clients. Integrates with Google Sheets for two-way data sync.

## Architecture
- **Frontend**: React + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Integration**: Google Sheets API (via Google Service Account)
- **AI**: Multi-provider AI assistant (DeepSeek, Gemini, OpenAI, OpenRouter) with tool calling

## Key Features
1. **Client Management**: CRUD operations for ad campaign clients with status tracking (Active/Inactive/Hold)
2. **Transaction Tracking**: Per-client transaction logs with BDT/USD amounts, platform breakdown
3. **Google Sheet Sync**: Two-way sync - read transactions from client sheets, write new transactions back
4. **Bulk Import**: Import clients from a main Google Sheet
5. **Dashboard**: Summary stats with filtering by status, search, and executive
6. **Bulk Payments**: Parse WhatsApp-format payment notes, process multiple payments with duplicate detection
7. **AI Assistant**: Natural language interface to query data, add payments, sync sheets, update statuses — supports DeepSeek, Gemini, OpenAI, and OpenRouter
8. **Ad Platform Integration**: Connect Facebook/Meta, Google Ads, and TikTok ad accounts to view campaigns, spend, and performance metrics live
11. **Campaigns Page**: Dedicated view to browse all campaigns across connected ad accounts with search, status/platform/account filtering, and sortable columns
9. **Facebook OAuth Login**: One-click "Login with Facebook" to auto-discover and connect all ad accounts
10. **Custom Logo Support**: Place logo.png in client/public/ to replace the default icon

## Production / Deployment
- **Build**: `npm run build` → `dist/index.cjs` (server) + `dist/public/` (frontend)
- **Start**: `NODE_ENV=production node dist/index.cjs`
- **Docker**: `docker build -t ads-crm . && docker run -p 5000:5000 --env-file .env ads-crm`
- **Heroku**: `Procfile` included
- **Google Sheets Auth**: Set `GOOGLE_SERVICE_ACCOUNT_JSON` env var with service account JSON.
- **Facebook OAuth**: Set `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` env vars. Redirect URI: `https://yourdomain.com/api/facebook/callback`
- **Files**: `.env.example`, `Dockerfile`, `.dockerignore`, `.gitignore`, `Procfile`, `README.md` all present
- **Vite Config**: Uses React plugin and path aliases only.

## Data Model
- `clients`: id, clientId (custom), name, balance, totalDue, campaignDue, status, executive, adsAccount, googleSheetUrl, googleSheetId
- `transactions`: id, clientId (FK), date, bdtAmount, usdAmount, platform, remainingBdt, platformSpend, paymentNote
- `adAccounts`: id, platform, accountId, accountName, accessToken, status
- `aiSettings`: id, provider, apiKey, model

## API Routes
- `GET /api/clients` - List all clients
- `GET /api/clients/:id` - Get single client
- `POST /api/clients` - Create client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client
- `GET /api/clients/:id/transactions` - Get client transactions
- `POST /api/clients/:id/transactions` - Add transaction (syncs to Google Sheet)
- `DELETE /api/transactions/:id` - Delete transaction
- `POST /api/clients/:id/sync` - Sync from Google Sheet (deletes all DB transactions, reimports fresh)
- `POST /api/import-sheet` - Bulk import clients from main sheet
- `POST /api/sync-all` - Sync all client sheets (parallel batches of 2 with 5s delay for rate limiting)
- `POST /api/bulk-payments` - Parse WhatsApp payment notes, create transactions, update balances, sync to sheets
- `POST /api/bulk-payments/push-to-sheet` - Push a single transaction to its client's Google Sheet
- `GET /api/bulk-payments/history` - Get payment history with optional date filtering
- `POST /api/sheet-cleanup` - Admin: read/delete/clear specific sheet rows
- `GET /api/stats` - Dashboard statistics
- `GET /api/ai/settings` - Get AI provider configuration
- `POST /api/ai/settings` - Save AI provider, API key, and model selection
- `POST /api/ai/chat` - Send messages to AI assistant
- `GET /api/ad-accounts` - List connected ad platform accounts
- `POST /api/ad-accounts` - Add a new ad platform account
- `POST /api/ad-accounts/discover` - Auto-discover accounts from access token
- `PUT /api/ad-accounts/:id` - Update account name, token, or status
- `DELETE /api/ad-accounts/:id` - Remove an ad account
- `GET /api/ad-accounts/:id/campaigns` - Fetch live campaign data from the platform API
- `GET /api/facebook/login` - Start Facebook OAuth flow
- `GET /api/facebook/callback` - Handle Facebook OAuth callback
- `GET /api/facebook/status` - Check if Facebook OAuth is configured

## File Structure
- `shared/schema.ts` - Database schema (Drizzle)
- `server/db.ts` - Database connection
- `server/googleSheets.ts` - Google Sheets integration (Service Account)
- `server/ai.ts` - AI assistant with tool-calling (multi-provider)
- `server/adPlatforms.ts` - Facebook, Google Ads, TikTok API integrations
- `server/storage.ts` - Data access layer
- `server/routes.ts` - API routes (includes Facebook OAuth)
- `client/src/pages/dashboard.tsx` - Main dashboard
- `client/src/pages/client-detail.tsx` - Client detail with transactions
- `client/src/pages/bulk-payments.tsx` - Bulk payment upload
- `client/src/pages/ai-assistant.tsx` - AI chat interface
- `client/src/pages/ad-accounts.tsx` - Ad platform management with Facebook login, Quick Connect, campaign viewer
- `client/src/components/app-sidebar.tsx` - Navigation sidebar (supports custom logo)
- `client/src/lib/format.ts` - Currency formatting utilities

## Google Sheets Integration
- Authentication: Google Service Account (via `GOOGLE_SERVICE_ACCOUNT_JSON` env var)
- Client sheets follow format: Date | BDT Amount | USD Amount | Platform | Remaining | Spend | Payment Note
- Client sheet row 2 cell D2 contains the BDT balance
- **Sheet Write Rules**: appendToSheet writes ONLY columns A-D and G (plain numbers). Columns E-F left untouched for formulas.
- **Row Targeting**: Scans column A bottom-up for last date row, writes to next row

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (required)
- `GOOGLE_SERVICE_ACCOUNT_JSON` - Google Sheets auth (required for sheet sync)
- `FACEBOOK_APP_ID` - Facebook OAuth app ID (optional, for Login with Facebook)
- `FACEBOOK_APP_SECRET` - Facebook OAuth app secret (optional)
- `GOOGLE_ADS_DEVELOPER_TOKEN` - Google Ads developer token (optional)
- `PORT` - Server port (default: 5000)
