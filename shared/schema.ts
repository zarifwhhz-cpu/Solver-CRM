import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().unique(),
  name: text("name").notNull(),
  balance: text("balance").notNull().default("0"),
  totalDue: text("total_due").notNull().default("0"),
  campaignDue: text("campaign_due").notNull().default("0"),
  status: text("status").notNull().default("Inactive"),
  executive: text("executive").notNull().default(""),
  adsAccount: text("ads_account").notNull().default(""),
  googleSheetUrl: text("google_sheet_url"),
  googleSheetId: text("google_sheet_id"),
});

export const insertClientSchema = createInsertSchema(clients).omit({ id: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  date: text("date"),
  bdtAmount: text("bdt_amount").notNull().default("0"),
  usdAmount: text("usd_amount").notNull().default("0"),
  platform: text("platform").notNull().default("Facebook"),
  remainingBdt: text("remaining_bdt").notNull().default("0"),
  platformSpend: text("platform_spend").notNull().default("0"),
  paymentNote: text("payment_note"),
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
