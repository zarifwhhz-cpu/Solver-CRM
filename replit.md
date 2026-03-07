# Ads CRM - Campaign Management System

## Overview
A web-based CRM for managing Facebook/TikTok ad campaign clients. Integrates with Google Sheets for two-way data sync.

## Architecture
- **Frontend**: React + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Integration**: Google Sheets API via Replit connector

## Key Features
1. **Client Management**: CRUD operations for ad campaign clients with status tracking (Active/Inactive/Hold)
2. **Transaction Tracking**: Per-client transaction logs with BDT/USD amounts, platform breakdown
3. **Google Sheet Sync**: Two-way sync - read transactions from client sheets, write new transactions back
4. **Bulk Import**: Import clients from a main Google Sheet
5. **Dashboard**: Summary stats with filtering by status, search, and executive

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
- `POST /api/clients/:id/sync` - Sync from Google Sheet
- `POST /api/import-sheet` - Bulk import clients from main sheet
- `GET /api/stats` - Dashboard statistics

## File Structure
- `shared/schema.ts` - Database schema (Drizzle)
- `server/db.ts` - Database connection
- `server/googleSheets.ts` - Google Sheets integration
- `server/storage.ts` - Data access layer
- `server/routes.ts` - API routes
- `client/src/pages/dashboard.tsx` - Main dashboard
- `client/src/pages/client-detail.tsx` - Client detail with transactions
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `client/src/lib/format.ts` - Currency formatting utilities

## Google Sheets Integration
- Uses Replit Google Sheets connector (OAuth)
- Client sheets follow format: Date | BDT Amount | USD Amount | Platform | Remaining | Spend | Payment Note
- Main sheet follows format: Client ID | Name | GO- | Balance | TotalDue | CampaignDue | Status | Executive | AdsAccount
