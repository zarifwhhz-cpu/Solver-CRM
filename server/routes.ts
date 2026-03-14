import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { insertClientSchema, insertTransactionSchema, transactions as transactionsTable, aiSettings, adAccounts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { extractSheetId, readClientSheetData, readMainSheetClients, appendToSheet, deleteSheetRows, clearSheetRow } from "./googleSheets";
import { processAIChat } from "./ai";
import { fetchCampaigns, discoverFacebookAdAccounts, discoverTikTokAdvertisers } from "./adPlatforms";
import { z } from "zod";
import crypto from "crypto";

const importSheetSchema = z.object({
  url: z.string().url(),
});

const oauthStates = new Map<string, { timestamp: number }>();
setInterval(() => {
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  for (const [key, val] of oauthStates) {
    if (val.timestamp < fiveMinAgo) oauthStates.delete(key);
  }
}, 60_000);

function getBaseUrl(req: any): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
  return `${proto}://${host}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/facebook/login", (req, res) => {
    const appId = process.env.FACEBOOK_APP_ID;
    if (!appId) {
      return res.status(500).json({ message: "Facebook App ID not configured. Please set the FACEBOOK_APP_ID environment variable." });
    }

    const state = crypto.randomBytes(32).toString("hex");
    oauthStates.set(state, { timestamp: Date.now() });

    const baseUrl = getBaseUrl(req);
    const redirectUri = `${baseUrl}/api/facebook/callback`;
    const scope = "ads_read,ads_management,business_management";

    const fbUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${scope}&response_type=code`;

    res.json({ url: fbUrl });
  });

  app.get("/api/facebook/callback", async (req, res) => {
    try {
      const { code, state, error, error_description } = req.query;

      if (error) {
        return res.redirect(`/?fb_error=${encodeURIComponent(String(error_description || error))}`);
      }

      if (!code || !state || !oauthStates.has(String(state))) {
        return res.redirect("/?fb_error=Invalid+or+expired+login+session.+Please+try+again.");
      }

      oauthStates.delete(String(state));

      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;
      if (!appId || !appSecret) {
        return res.redirect("/?fb_error=Facebook+App+credentials+not+configured.");
      }

      const baseUrl = getBaseUrl(req);
      const redirectUri = `${baseUrl}/api/facebook/callback`;

      const tokenRes = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
      );
      const tokenData = await tokenRes.json() as any;

      if (tokenData.error) {
        return res.redirect(`/?fb_error=${encodeURIComponent(tokenData.error.message || "Failed to get access token")}`);
      }

      const shortToken = tokenData.access_token;

      const longTokenRes = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
      );
      const longTokenData = await longTokenRes.json() as any;
      const accessToken = longTokenData.access_token || shortToken;

      const discovered = await discoverFacebookAdAccounts(accessToken);

      const existing = await db.select().from(adAccounts);
      const existingIds = new Set(existing.map(a => a.accountId));

      let addedCount = 0;
      for (const acct of discovered) {
        if (!existingIds.has(acct.id)) {
          await db.insert(adAccounts).values({
            platform: "facebook",
            accountId: acct.id,
            accountName: acct.name,
            accessToken,
            status: "connected",
          });
          addedCount++;
        } else {
          await db.update(adAccounts)
            .set({ accessToken, status: "connected", accountName: acct.name })
            .where(eq(adAccounts.accountId, acct.id));
        }
      }

      res.redirect(`/ad-accounts?fb_success=true&discovered=${discovered.length}&added=${addedCount}`);
    } catch (error: any) {
      res.redirect(`/?fb_error=${encodeURIComponent(error.message || "Login failed")}`);
    }
  });

  app.get("/api/facebook/status", (_req, res) => {
    const configured = !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
    res.json({ configured });
  });

  app.get("/api/clients", async (_req, res) => {
    try {
      const allClients = await storage.getClients();
      res.json(allClients);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/clients/:id", async (req, res) => {
    try {
      const client = await storage.getClient(parseInt(req.params.id));
      if (!client) return res.status(404).json({ message: "Client not found" });
      res.json(client);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/clients", async (req, res) => {
    try {
      const parsed = insertClientSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }
      const data = { ...parsed.data };
      if (data.googleSheetUrl) {
        data.googleSheetId = extractSheetId(data.googleSheetUrl);
      }
      const client = await storage.createClient(data);
      res.status(201).json(client);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/clients/:id", async (req, res) => {
    try {
      const data = { ...req.body };
      if (data.googleSheetUrl) {
        data.googleSheetId = extractSheetId(data.googleSheetUrl);
      } else if (data.googleSheetUrl === "" || data.googleSheetUrl === null) {
        data.googleSheetId = null;
        data.googleSheetUrl = null;
      }
      const client = await storage.updateClient(parseInt(req.params.id), data);
      if (!client) return res.status(404).json({ message: "Client not found" });
      res.json(client);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/clients/:id", async (req, res) => {
    try {
      await storage.deleteClient(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/clients/:id/transactions", async (req, res) => {
    try {
      const txns = await storage.getTransactions(parseInt(req.params.id));
      res.json(txns);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/clients/:id/transactions", async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      const client = await storage.getClient(clientId);
      if (!client) return res.status(404).json({ message: "Client not found" });

      const parsed = insertTransactionSchema.safeParse({ ...req.body, clientId });
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }

      const data = parsed.data;
      const transaction = await storage.createTransaction(data);

      const bdtPayment = parseFloat(data.bdtAmount || "0") || 0;
      const spend = parseFloat(data.platformSpend || "0") || 0;
      if (bdtPayment !== 0 || spend !== 0) {
        const currentBalance = parseFloat(client.balance) || 0;
        const newBalance = (currentBalance + bdtPayment - spend).toFixed(2);
        await storage.updateClient(clientId, { balance: newBalance, totalDue: newBalance });
      }

      if (client.googleSheetId) {
        try {
          await appendToSheet(client.googleSheetId, {
            date: data.date || '',
            bdtAmount: data.bdtAmount || '0',
            usdAmount: data.usdAmount || '0',
            platform: data.platform || 'Facebook',
            remainingBdt: data.remainingBdt || '0',
            platformSpend: data.platformSpend || '0',
            paymentNote: data.paymentNote || '',
          });
        } catch (sheetError: any) {
          console.error("Failed to sync to Google Sheet:", sheetError.message);
        }
      }

      res.status(201).json(transaction);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/transactions/:id", async (req, res) => {
    try {
      await storage.deleteTransaction(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/clients/:id/sync", async (req, res) => {
    try {
      const client = await storage.getClient(parseInt(req.params.id));
      if (!client) return res.status(404).json({ message: "Client not found" });
      if (!client.googleSheetId) return res.status(400).json({ message: "No Google Sheet linked" });

      const { txns: sheetData, sheetBalance } = await readClientSheetData(client.googleSheetId);

      await storage.deleteTransactionsByClientId(client.id);

      for (const txn of sheetData) {
        await storage.createTransaction({ clientId: client.id, ...txn });
      }

      const balance = sheetBalance || "0";
      await storage.updateClient(client.id, { balance, totalDue: balance });

      res.json({ success: true, transactionsCount: sheetData.length, balance });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/sync-all", async (req, res) => {
    try {
      const allClients = await storage.getClients();
      const results: Array<{ clientId: number; name: string; status: string; transactionsCount?: number; balance?: string; error?: string }> = [];

      const syncableClients = allClients.filter(c => c.googleSheetId);
      const skippedClients = allClients.filter(c => !c.googleSheetId);
      for (const c of skippedClients) {
        results.push({ clientId: c.clientId, name: c.name, status: "skipped", error: "No sheet linked" });
      }

      const BATCH_SIZE = 2;
      for (let i = 0; i < syncableClients.length; i += BATCH_SIZE) {
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        const batch = syncableClients.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(batch.map(async (client) => {
          const { txns: sheetData, sheetBalance } = await readClientSheetData(client.googleSheetId!);
          await storage.deleteTransactionsByClientId(client.id);
          for (const txn of sheetData) {
            await storage.createTransaction({ clientId: client.id, ...txn });
          }
          const balance = sheetBalance || "0";
          await storage.updateClient(client.id, { balance, totalDue: balance });
          return { transactionsCount: sheetData.length, balance };
        }));

        for (let j = 0; j < batch.length; j++) {
          const client = batch[j];
          const result = batchResults[j];
          if (result.status === "fulfilled") {
            results.push({ clientId: client.clientId, name: client.name, status: "success", ...result.value });
            console.log(`Synced ${client.name} (${client.clientId}): ${result.value.transactionsCount} txns, bal: ${result.value.balance}`);
          } else {
            results.push({ clientId: client.clientId, name: client.name, status: "error", error: result.reason?.message || "Unknown error" });
            console.error(`Failed to sync ${client.name} (${client.clientId}): ${result.reason?.message}`);
          }
        }
      }

      const succeeded = results.filter(r => r.status === "success").length;
      const failed = results.filter(r => r.status === "error").length;
      const skipped = results.filter(r => r.status === "skipped").length;

      res.json({ success: true, total: allClients.length, succeeded, failed, skipped, results });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/import-sheet", async (req, res) => {
    try {
      const parsed = importSheetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Valid Google Sheet URL is required" });
      }

      const sheetId = extractSheetId(parsed.data.url);
      if (!sheetId) return res.status(400).json({ message: "Invalid Google Sheet URL format" });

      const clientsData = await readMainSheetClients(sheetId);
      let imported = 0;
      let updated = 0;

      for (const c of clientsData) {
        const existing = await storage.getClientByClientId(c.clientId);
        if (existing) {
          await storage.updateClient(existing.id, c);
          updated++;
        } else {
          await storage.createClient(c);
          imported++;
        }
      }

      res.json({ success: true, imported, updated, total: clientsData.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/bulk-payments/history", async (req, res) => {
    try {
      const fromDate = typeof req.query.from === "string" ? req.query.from : undefined;
      const toDate = typeof req.query.to === "string" ? req.query.to : undefined;
      const allClients = await storage.getClients();
      const clientMap = new Map(allClients.map(c => [c.id, c]));
      const history = await storage.getBulkPaymentHistory(fromDate, toDate);
      const totalAmount = history.reduce((sum, t) => sum + (parseFloat(t.bdtAmount) || 0), 0);
      const extractNoteDate = (note: string): string | null => {
        const m = note.match(/^(\d{1,2})\/(\d{2})\/(\d{2,4})\/cli-/);
        if (!m) return null;
        const [, dd, mm, yy] = m;
        const fullYear = yy.length === 2 ? `20${yy}` : yy;
        return `${dd.padStart(2, '0')}/${mm}/${fullYear}`;
      };
      const extractNoteDateISO = (note: string): string => {
        const m2 = note.match(/^(\d{1,2})\/(\d{2})\/(\d{2,4})\/cli-/);
        if (!m2) return '0000-00-00';
        const [, dd2, mm2, yy2] = m2;
        const fy = yy2.length === 2 ? `20${yy2}` : yy2;
        return `${fy}-${mm2}-${dd2.padStart(2, '0')}`;
      };
      const enriched = history.map(t => ({
        ...t,
        date: extractNoteDate(t.paymentNote || '') || t.date,
        clientName: clientMap.get(t.clientId)?.name || "Unknown",
        clientCode: clientMap.get(t.clientId)?.clientId || 0,
        googleSheetId: clientMap.get(t.clientId)?.googleSheetId || null,
      }));
      enriched.sort((a, b) => {
        const da = extractNoteDateISO(a.paymentNote || '');
        const db = extractNoteDateISO(b.paymentNote || '');
        if (da !== db) return db.localeCompare(da);
        return b.id - a.id;
      });
      res.json({ payments: enriched, count: enriched.length, totalAmount: totalAmount.toFixed(2) });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/bulk-payments/push-to-sheet", async (req, res) => {
    try {
      const { transactionId } = req.body;
      if (!transactionId) return res.status(400).json({ message: "Transaction ID required" });

      const allTxns = await db.select().from(transactionsTable).where(eq(transactionsTable.id, transactionId));
      const txn = allTxns[0];
      if (!txn) return res.status(404).json({ message: "Transaction not found" });

      const client = await storage.getClient(txn.clientId);
      if (!client || !client.googleSheetId) {
        return res.status(400).json({ message: "Client has no linked Google Sheet" });
      }

      await appendToSheet(client.googleSheetId, {
        date: txn.date || '',
        bdtAmount: txn.bdtAmount || '0',
        usdAmount: txn.usdAmount || '0',
        platform: txn.platform || 'Facebook',
        remainingBdt: txn.remainingBdt || '0',
        platformSpend: txn.platformSpend || '0',
        paymentNote: txn.paymentNote || '',
      });

      res.json({ success: true, message: `Pushed to ${client.name}'s Google Sheet` });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/bulk-payments", async (req, res) => {
    try {
      const { notes } = req.body;
      if (!notes || typeof notes !== "string" || !notes.trim()) {
        return res.status(400).json({ message: "Payment notes text is required" });
      }

      const lines = notes.split("\n").filter((l: string) => l.trim());
      const paymentRegex = /(\d{2})\/(\d{2})\/(\d{2,4})\/cli-(\d+)\/lst-([^/]+)\/pay-(\d+(?:\.\d+)?)/;
      const parsed: Array<{ date: string; clientId: number; method: string; amount: string; raw: string }> = [];
      const failed: Array<{ line: string; error: string }> = [];

      for (const line of lines) {
        const match = line.match(paymentRegex);
        if (!match) {
          failed.push({ line: line.trim(), error: "Could not parse payment format" });
          continue;
        }
        const [, dd, mm, yy, cliId, method, amount] = match;
        const fullYear = yy.length === 2 ? `20${yy}` : yy;
        parsed.push({
          date: `${dd}/${mm}/${fullYear}`,
          clientId: parseInt(cliId),
          method,
          amount,
          raw: line.trim(),
        });
      }

      const allClients = await storage.getClients();
      const results: Array<{ clientId: number; name: string; amount: string; date: string; status: string; error?: string }> = [];

      for (const payment of parsed) {
        const client = allClients.find(c => c.clientId === payment.clientId);
        if (!client) {
          results.push({ clientId: payment.clientId, name: "Unknown", amount: payment.amount, date: payment.date, status: "error", error: `Client ${payment.clientId} not found` });
          continue;
        }

        try {
          const paymentNote = `${payment.date.replace(/20(\d{2})$/, '$1')}/cli-${payment.clientId}/lst-${payment.method}/pay-${payment.amount}`;

          const existing = await storage.findTransactionByNote(client.id, paymentNote);
          if (existing) {
            results.push({ clientId: payment.clientId, name: client.name, amount: payment.amount, date: payment.date, status: "skipped", error: `Duplicate: payment already exists (ID: ${existing.id})` });
            console.log(`Skipped duplicate: ${client.name} (${payment.clientId}) ${paymentNote}`);
            continue;
          }

          const txnData = {
            clientId: client.id,
            date: payment.date,
            bdtAmount: payment.amount,
            usdAmount: "0",
            platform: "Facebook",
            remainingBdt: "0",
            platformSpend: "0",
            paymentNote,
          };

          await storage.createTransaction(txnData);

          const currentBalance = parseFloat(client.balance) || 0;
          const newBalance = (currentBalance + parseFloat(payment.amount)).toFixed(2);
          await storage.updateClient(client.id, { balance: newBalance, totalDue: newBalance });
          client.balance = newBalance;

          let sheetError: string | undefined;
          if (client.googleSheetId) {
            try {
              await appendToSheet(client.googleSheetId, {
                date: payment.date,
                bdtAmount: payment.amount,
                usdAmount: "0",
                platform: "Facebook",
                remainingBdt: "0",
                platformSpend: "0",
                paymentNote,
              });
            } catch (sheetErr: any) {
              sheetError = sheetErr.message;
              console.error(`Sheet sync failed for ${client.name}: ${sheetErr.message}`);
            }
          }

          const status = sheetError ? "partial" : "success";
          results.push({ clientId: payment.clientId, name: client.name, amount: payment.amount, date: payment.date, status, error: sheetError ? `DB saved, sheet failed: ${sheetError}` : undefined });
          console.log(`Payment: ${client.name} (${payment.clientId}) +৳${payment.amount} via ${payment.method} [${status}]`);
        } catch (err: any) {
          results.push({ clientId: payment.clientId, name: client.name, amount: payment.amount, date: payment.date, status: "error", error: err.message });
        }
      }

      const succeeded = results.filter(r => r.status === "success").length;
      const partial = results.filter(r => r.status === "partial").length;
      const failedCount = results.filter(r => r.status === "error").length;
      const skipped = results.filter(r => r.status === "skipped").length;

      res.json({ success: true, totalLines: lines.length, processed: results.length, succeeded, partial, failed: failedCount, skipped, unparsed: failed, results });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/stats", async (_req, res) => {
    try {
      const allClients = await storage.getClients();

      let totalBalance = 0;
      let totalOutstanding = 0;
      let totalPayReceived = 0;
      let totalCampaignDue = 0;
      let activeCount = 0;
      let inactiveCount = 0;
      let holdCount = 0;

      for (const client of allClients) {
        const bal = parseFloat(client.balance) || 0;
        totalBalance += bal;
        if (bal < 0) totalOutstanding += bal;
        if (bal > 0) totalPayReceived += bal;
        totalCampaignDue += parseFloat(client.campaignDue) || 0;

        if (client.status === 'Active') activeCount++;
        else if (client.status === 'Inactive') inactiveCount++;
        else if (client.status === 'Hold') holdCount++;
      }

      res.json({
        totalBalance: totalBalance.toFixed(2),
        totalOutstanding: totalOutstanding.toFixed(2),
        totalPayReceived: totalPayReceived.toFixed(2),
        totalCampaignDue: totalCampaignDue.toFixed(2),
        totalClients: allClients.length,
        activeCount,
        inactiveCount,
        holdCount,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ai/settings", async (_req, res) => {
    try {
      const settings = await db.select().from(aiSettings);
      if (settings.length === 0) {
        return res.json({ configured: false });
      }
      const s = settings[0];
      return res.json({
        configured: true,
        provider: s.provider,
        model: s.model,
        hasApiKey: !!s.apiKey,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ai/settings", async (req, res) => {
    try {
      const { provider, apiKey, model } = req.body;
      if (!provider) {
        return res.status(400).json({ message: "Provider is required" });
      }

      const existing = await db.select().from(aiSettings);
      if (existing.length > 0) {
        const updateData: any = { provider, model: model || null };
        if (apiKey) updateData.apiKey = apiKey;
        await db.update(aiSettings).set(updateData).where(eq(aiSettings.id, existing[0].id));
      } else {
        if (!apiKey) {
          return res.status(400).json({ message: "API key is required for initial setup" });
        }
        await db.insert(aiSettings).values({ provider, apiKey, model: model || null });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: "Messages array is required" });
      }

      const settings = await db.select().from(aiSettings);
      if (settings.length === 0 || !settings[0].apiKey) {
        return res.status(400).json({ message: "AI is not configured. Please add your API key in settings." });
      }

      const config = {
        provider: settings[0].provider,
        apiKey: settings[0].apiKey,
        model: settings[0].model || undefined,
      };

      const result = await processAIChat(messages, config);
      res.json(result);
    } catch (error: any) {
      console.error("[AI Chat Error]", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ad-accounts", async (_req, res) => {
    try {
      const accounts = await db.select().from(adAccounts);
      const safe = accounts.map(a => ({
        id: a.id,
        platform: a.platform,
        accountId: a.accountId,
        accountName: a.accountName,
        status: a.status,
        hasToken: !!a.accessToken,
      }));
      res.json(safe);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ad-accounts", async (req, res) => {
    try {
      const { platform, accountId, accountName, accessToken } = req.body;
      if (!platform || !accountId || !accessToken) {
        return res.status(400).json({ message: "Platform, account ID, and access token are required" });
      }
      if (!["facebook", "google", "tiktok"].includes(platform)) {
        return res.status(400).json({ message: "Platform must be facebook, google, or tiktok" });
      }

      const result = await db.insert(adAccounts).values({
        platform,
        accountId,
        accountName: accountName || "",
        accessToken,
        status: "connected",
      }).returning();

      res.status(201).json({ id: result[0].id, platform, accountId, accountName: result[0].accountName, status: "connected" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/ad-accounts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { accountName, accessToken, status } = req.body;
      const updateData: any = {};
      if (accountName !== undefined) updateData.accountName = accountName;
      if (accessToken) updateData.accessToken = accessToken;
      if (status) updateData.status = status;

      const result = await db.update(adAccounts).set(updateData).where(eq(adAccounts.id, id)).returning();
      if (result.length === 0) return res.status(404).json({ message: "Account not found" });

      res.json({ id: result[0].id, platform: result[0].platform, accountId: result[0].accountId, accountName: result[0].accountName, status: result[0].status });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/ad-accounts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(adAccounts).where(eq(adAccounts.id, id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ad-accounts/discover", async (req, res) => {
    try {
      const { platform, accessToken } = req.body;
      if (!platform || !accessToken) {
        return res.status(400).json({ message: "Platform and access token are required" });
      }

      let discovered: Array<{ id: string; name: string; currency?: string; timezone?: string; status?: string; spend?: string }> = [];

      if (platform === "facebook") {
        discovered = await discoverFacebookAdAccounts(accessToken);
      } else if (platform === "tiktok") {
        discovered = await discoverTikTokAdvertisers(accessToken);
      } else {
        return res.status(400).json({ message: "Auto-discovery is available for Facebook and TikTok. For Google Ads, please add accounts manually." });
      }

      const existing = await db.select().from(adAccounts);
      const existingIds = new Set(existing.map(a => a.accountId));
      const newAccounts = discovered.filter(a => !existingIds.has(a.id));
      const skipped = discovered.filter(a => existingIds.has(a.id));

      const added = [];
      for (const acct of newAccounts) {
        const result = await db.insert(adAccounts).values({
          platform,
          accountId: acct.id,
          accountName: acct.name,
          accessToken,
          status: "connected",
        }).returning();
        added.push({
          id: result[0].id,
          platform,
          accountId: acct.id,
          accountName: acct.name,
          status: "connected",
          currency: acct.currency,
          spend: acct.spend,
        });
      }

      res.json({
        success: true,
        discovered: discovered.length,
        added: added.length,
        skipped: skipped.length,
        accounts: added,
        skippedAccounts: skipped.map(a => ({ id: a.id, name: a.name })),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ad-accounts/:id/campaigns", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const accounts = await db.select().from(adAccounts).where(eq(adAccounts.id, id));
      if (accounts.length === 0) return res.status(404).json({ message: "Account not found" });

      const acct = accounts[0];
      const data = await fetchCampaigns(acct.platform, acct.accessToken, acct.accountId);

      if (data.account.name && data.account.name !== acct.accountName) {
        await db.update(adAccounts).set({ accountName: data.account.name }).where(eq(adAccounts.id, id));
      }

      res.json(data);
    } catch (error: any) {
      const message = error.message || "Failed to fetch campaigns";
      if (message.includes("token") || message.includes("auth") || message.includes("401") || message.includes("403")) {
        await db.update(adAccounts).set({ status: "error" }).where(eq(adAccounts.id, parseInt(req.params.id)));
      }
      res.status(500).json({ message });
    }
  });

  app.get("/api/campaigns", async (req, res) => {
    try {
      const accountIds = req.query.accounts
        ? String(req.query.accounts).split(",").map(Number).filter(n => Number.isFinite(n) && n > 0)
        : [];
      const since = req.query.since ? String(req.query.since) : undefined;
      const until = req.query.until ? String(req.query.until) : undefined;
      const dateRange = since && until ? { since, until } : undefined;
      let accounts;
      if (accountIds.length > 0) {
        const { inArray } = await import("drizzle-orm");
        accounts = await db.select().from(adAccounts).where(inArray(adAccounts.id, accountIds));
      } else {
        accounts = await db.select().from(adAccounts);
      }

      const allCampaigns: Array<{
        id: string; name: string; status: string; objective?: string;
        spend?: string; impressions?: string; clicks?: string; ctr?: string; cpc?: string;
        startDate?: string; endDate?: string;
        accountId: number; accountName: string; platform: string;
      }> = [];

      const errors: Array<{ accountId: number; accountName: string; error: string }> = [];

      for (const acct of accounts) {
        try {
          const data = await fetchCampaigns(acct.platform, acct.accessToken, acct.accountId, dateRange);
          if (data.account.name && data.account.name !== acct.accountName) {
            await db.update(adAccounts).set({ accountName: data.account.name }).where(eq(adAccounts.id, acct.id));
          }
          for (const c of data.campaigns) {
            allCampaigns.push({
              ...c,
              accountId: acct.id,
              accountName: data.account.name || acct.accountName || acct.accountId,
              platform: acct.platform,
            });
          }
        } catch (err: any) {
          errors.push({ accountId: acct.id, accountName: acct.accountName || acct.accountId, error: err.message });
        }
      }

      res.json({ campaigns: allCampaigns, errors, totalAccounts: accounts.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/sheet-cleanup", async (req, res) => {
    try {
      const { spreadsheetId, deleteRows, clearRows, readRows } = req.body;
      if (!spreadsheetId) return res.status(400).json({ message: "spreadsheetId required" });

      const results: string[] = [];
      let readData: Record<number, any[]> = {};

      if (readRows && Array.isArray(readRows) && readRows.length > 0) {
        const { getUncachableGoogleSheetClient } = await import("./googleSheets");
        const sheets = await getUncachableGoogleSheetClient();
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetNames = meta.data.sheets?.map((s: any) => s.properties?.title) || [];
        const pnlSheet = sheetNames.includes('PNL') ? 'PNL' : (sheetNames[0] || 'Sheet1');
        for (const row of readRows) {
          const resp = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${pnlSheet}'!A${row}:G${row}`,
            valueRenderOption: 'FORMATTED_VALUE',
          });
          readData[row] = resp.data.values?.[0] || [];
        }
      }

      if (deleteRows && Array.isArray(deleteRows) && deleteRows.length > 0) {
        await deleteSheetRows(spreadsheetId, deleteRows);
        results.push(`Deleted ${deleteRows.length} rows: ${deleteRows.join(', ')}`);
      }

      if (clearRows && Array.isArray(clearRows) && clearRows.length > 0) {
        for (const row of clearRows) {
          await clearSheetRow(spreadsheetId, row);
        }
        results.push(`Cleared ${clearRows.length} rows: ${clearRows.join(', ')}`);
      }

      res.json({ success: true, results, readData });
    } catch (error: any) {
      console.error("[Sheet Cleanup] Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
