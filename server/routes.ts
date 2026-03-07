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

      for (let idx = 0; idx < allClients.length; idx++) {
        const client = allClients[idx];
        if (!client.googleSheetId) {
          results.push({ clientId: client.clientId, name: client.name, status: "skipped", error: "No sheet linked" });
          continue;
        }

        if (idx > 0 && idx % 50 === 0) {
          await new Promise(resolve => setTimeout(resolve, 60000));
        }

        try {
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

          results.push({ clientId: client.clientId, name: client.name, status: "success", transactionsCount: sheetData.length, balance });
          console.log(`Synced ${client.name} (${client.clientId}): ${sheetData.length} transactions, balance: ${balance}`);
        } catch (err: any) {
          results.push({ clientId: client.clientId, name: client.name, status: "error", error: err.message });
          console.error(`Failed to sync ${client.name} (${client.clientId}): ${err.message}`);
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
