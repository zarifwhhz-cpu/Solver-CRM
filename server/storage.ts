import { db } from "./db";
import { clients, transactions, type Client, type InsertClient, type Transaction, type InsertTransaction } from "@shared/schema";
import { eq, like, desc, and, sql, type SQL } from "drizzle-orm";

export interface IStorage {
  getClients(): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  getClientByClientId(clientId: number): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, data: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: number): Promise<void>;
  getTransactions(clientId: number): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  deleteTransaction(id: number): Promise<void>;
  deleteTransactionsByClientId(clientId: number): Promise<void>;
  getBulkPaymentHistory(fromDate?: string, toDate?: string): Promise<Transaction[]>;
  findTransactionByNote(clientId: number, paymentNote: string): Promise<Transaction | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getClients(): Promise<Client[]> {
    return await db.select().from(clients);
  }

  async getClient(id: number): Promise<Client | undefined> {
    const result = await db.select().from(clients).where(eq(clients.id, id));
    return result[0];
  }

  async getClientByClientId(clientId: number): Promise<Client | undefined> {
    const result = await db.select().from(clients).where(eq(clients.clientId, clientId));
    return result[0];
  }

  async createClient(client: InsertClient): Promise<Client> {
    const result = await db.insert(clients).values(client).returning();
    return result[0];
  }

  async updateClient(id: number, data: Partial<InsertClient>): Promise<Client | undefined> {
    const result = await db.update(clients).set(data).where(eq(clients.id, id)).returning();
    return result[0];
  }

  async deleteClient(id: number): Promise<void> {
    await db.delete(transactions).where(eq(transactions.clientId, id));
    await db.delete(clients).where(eq(clients.id, id));
  }

  async getTransactions(clientId: number): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.clientId, clientId));
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const result = await db.insert(transactions).values(transaction).returning();
    return result[0];
  }

  async deleteTransaction(id: number): Promise<void> {
    await db.delete(transactions).where(eq(transactions.id, id));
  }

  async deleteTransactionsByClientId(clientId: number): Promise<void> {
    await db.delete(transactions).where(eq(transactions.clientId, clientId));
  }

  async findTransactionByNote(clientId: number, paymentNote: string): Promise<Transaction | undefined> {
    const result = await db.select().from(transactions)
      .where(and(eq(transactions.clientId, clientId), eq(transactions.paymentNote, paymentNote)));
    return result[0];
  }

  async getBulkPaymentHistory(fromDate?: string, toDate?: string): Promise<Transaction[]> {
    const allPayments = await db.select().from(transactions)
      .where(like(transactions.paymentNote, '%/cli-%/lst-%/pay-%'))
      .orderBy(desc(transactions.id));

    if (!fromDate && !toDate) return allPayments;

    return allPayments.filter(t => {
      const noteDate = this.extractDateFromNote(t.paymentNote || '');
      if (!noteDate) return true;

      if (fromDate && noteDate < fromDate) return false;
      if (toDate && noteDate > toDate) return false;
      return true;
    });
  }

  private extractDateFromNote(note: string): string | null {
    const match = note.match(/^(\d{1,2})\/(\d{2})\/(\d{2,4})\/cli-/);
    if (!match) return null;
    const [, dd, mm, yy] = match;
    const fullYear = yy.length === 2 ? `20${yy}` : yy;
    return `${fullYear}-${mm}-${dd.padStart(2, '0')}`;
  }
}

export const storage = new DatabaseStorage();
