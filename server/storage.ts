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

  async getBulkPaymentHistory(fromDate?: string, toDate?: string): Promise<Transaction[]> {
    const conditions: SQL[] = [
      like(transactions.paymentNote, '%/cli-%/lst-%/pay-%'),
    ];

    if (fromDate) {
      const [fy, fm, fd] = fromDate.split('-');
      const fromDDMMYYYY = `${fd}/${fm}/${fy}`;
      conditions.push(sql`to_date(${transactions.date}, 'DD/MM/YYYY') >= to_date(${fromDDMMYYYY}, 'DD/MM/YYYY')`);
    }
    if (toDate) {
      const [ty, tm, td] = toDate.split('-');
      const toDDMMYYYY = `${td}/${tm}/${ty}`;
      conditions.push(sql`to_date(${transactions.date}, 'DD/MM/YYYY') <= to_date(${toDDMMYYYY}, 'DD/MM/YYYY')`);
    }

    return await db.select().from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.id));
  }
}

export const storage = new DatabaseStorage();
