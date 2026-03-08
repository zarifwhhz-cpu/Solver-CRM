# Ads CRM - Campaign Management System

## Overview
A web-based CRM for managing Facebook/TikTok ad campaign clients. Integrates with Google Sheets for two-way data sync.

## Architecture
- **Frontend**: React + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Integration**: Google Sheets API (dual-mode: Google Service Account or Replit Connector)
- **AI**: Multi-provider AI assistant (DeepSeek, Gemini, OpenAI, OpenRouter) with tool calling

## Key Features
1. **Client Management**: CRUD operations for ad campaign clients with status tracking (Active/Inactive/Hold)
2. **Transaction Tracking**: Per-client transaction logs with BDT/USD amounts, platform breakdown
3. **Google Sheet Sync**: Two-way sync - read transactions from client sheets, write new transactions back
4. **Bulk Import**: Import clients from a main Google Sheet
5. **Dashboard**: Summary stats with filtering by status, search, and executive
6. **Bulk Payments**: Parse WhatsApp-format payment notes, process multiple payments with duplicate detection
7. **AI Assistant**: Natural language interface to query data, add payments, sync sheets, update statuses — supports DeepSeek, Gemini, OpenAI, and OpenRouter

## Production / Deployment
- **Build**: `npm run build` → `dist/index.cjs` (server) + `dist/public/` (frontend)
- **Start**: `NODE_ENV=production node dist/index.cjs`
- **Docker**: `docker build -t ads-crm . && docker run -p 5000:5000 --env-file .env ads-crm`
- **Google Sheets Auth**: Set `GOOGLE_SERVICE_ACCOUNT_JSON` env var with service account JSON for self-hosting. On Replit, uses the connector automatically.
- **Files**: `.env.example`, `Dockerfile`, `.dockerignore`, `README.md`, `.gitignore` all present
- **Vite Config**: Clean — no Replit-specific plugins. Uses React, path aliases only.

## Data Model
- `clients`: id, clientId (custom), name, balance, totalDue, campaignDue, status, executive, adsAccount, googleSheetUrl, googleSheetId
- `transactions`: id, clientId (FK), date, bdtAmount, usdAmount, platform, remainingBdt, platformSpend, paymentNote

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
- `POST /api/bulk-payments` - Parse WhatsApp payment notes, create transactions, update balances, sync to sheets. Has duplicate detection (checks paymentNote match before creating).
- `POST /api/bulk-payments/push-to-sheet` - Push a single transaction to its client's Google Sheet
- `GET /api/bulk-payments/history` - Get payment history with optional date filtering
- `POST /api/sheet-cleanup` - Admin: read/delete/clear specific sheet rows
- `GET /api/stats` - Dashboard statistics
- `GET /api/ai/settings` - Get AI provider configuration (no sensitive data exposed)
- `POST /api/ai/settings` - Save AI provider, API key, and model selection
- `POST /api/ai/chat` - Send messages to AI; supports tool calling for data queries and actions

## File Structure
- `shared/schema.ts` - Database schema (Drizzle)
- `server/db.ts` - Database connection
- `server/googleSheets.ts` - Google Sheets integration (Service Account + Replit Connector dual-mode)
- `server/ai.ts` - AI assistant with tool-calling (multi-provider: DeepSeek, Gemini, OpenAI, OpenRouter)
- `server/storage.ts` - Data access layer
- `server/routes.ts` - API routes
- `client/src/pages/dashboard.tsx` - Main dashboard
- `client/src/pages/client-detail.tsx` - Client detail with transactions
- `client/src/pages/bulk-payments.tsx` - Bulk payment upload from WhatsApp notes
- `client/src/pages/ai-assistant.tsx` - AI chat interface with provider settings
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `client/src/lib/format.ts` - Currency formatting utilities

## Google Sheets Integration
- Dual authentication: Google Service Account (via `GOOGLE_SERVICE_ACCOUNT_JSON` env var) for self-hosting, or Replit Connector for Replit deployment
- Client sheets follow format: Date | BDT Amount | USD Amount | Platform | Remaining | Spend | Payment Note
- Client sheet row 2 cell D2 contains the BDT balance (read during sync instead of recalculating from transactions)
- Main sheet follows format: Client ID | Name | GO- | Balance | TotalDue | CampaignDue | Status | Executive | AdsAccount
- Dashboard Balance column (index 3) is read during import and used as balance/totalDue
- **Sheet Write Rules**: appendToSheet writes ONLY columns A-D and G (plain numbers, no currency symbols). Columns E-F (Remaining, Burnt) are left untouched to preserve sheet formulas.
- **Row Targeting**: Scans column A bottom-up for last date row, writes to next row (fills pre-filled template rows)
- **Sheet Cleanup**: deleteSheetRows removes rows by number, clearSheetRow resets to template format
