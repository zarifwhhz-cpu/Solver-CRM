import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertClientSchema, insertTransactionSchema } from "@shared/schema";
import { extractSheetId, readClientSheetData, readMainSheetClients, appendToSheet } from "./googleSheets";
import { z } from "zod";

const importSheetSchema = z.object({
  url: z.string().url(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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

      const sheetData = await readClientSheetData(client.googleSheetId);

      await storage.deleteTransactionsByClientId(client.id);

      for (const txn of sheetData) {
        await storage.createTransaction({ clientId: client.id, ...txn });
      }

      let totalPayments = 0;
      let totalSpend = 0;
      for (const txn of sheetData) {
        totalPayments += parseFloat(txn.bdtAmount) || 0;
        totalSpend += parseFloat(txn.platformSpend) || 0;
      }
      const balance = (totalPayments - totalSpend).toFixed(2);

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

      const BATCH_SIZE = 5;
      for (let i = 0; i < syncableClients.length; i += BATCH_SIZE) {
        const batch = syncableClients.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(batch.map(async (client) => {
          const sheetData = await readClientSheetData(client.googleSheetId!);
          await storage.deleteTransactionsByClientId(client.id);
          for (const txn of sheetData) {
            await storage.createTransaction({ clientId: client.id, ...txn });
          }
          let totalPayments = 0;
          let totalSpend = 0;
          for (const txn of sheetData) {
            totalPayments += parseFloat(txn.bdtAmount) || 0;
            totalSpend += parseFloat(txn.platformSpend) || 0;
          }
          const balance = (totalPayments - totalSpend).toFixed(2);
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

  app.get("/api/bulk-payments/history", async (_req, res) => {
    try {
      const allClients = await storage.getClients();
      const clientMap = new Map(allClients.map(c => [c.id, c]));
      const history = await storage.getBulkPaymentHistory();
      const enriched = history.map(t => ({
        ...t,
        clientName: clientMap.get(t.clientId)?.name || "Unknown",
        clientCode: clientMap.get(t.clientId)?.clientId || 0,
      }));
      res.json(enriched);
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

      res.json({ success: true, totalLines: lines.length, processed: results.length, succeeded, partial, failed: failedCount, unparsed: failed, results });
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

  return httpServer;
}
