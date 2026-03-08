import { storage } from "./storage";
import { appendToSheet } from "./googleSheets";

interface AIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

interface AIProviderConfig {
  provider: string;
  apiKey: string;
  model?: string;
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_all_clients",
      description: "Get a list of all clients with their balances, statuses, executives, and ads accounts. Use this to answer questions about clients, find specific clients, or get an overview.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_details",
      description: "Get detailed information about a specific client by their client ID (the custom ID like 1439, not the database ID).",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "number", description: "The client's custom ID (e.g. 1439)" },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_transactions",
      description: "Get the transaction history for a specific client. Returns all payments and ad spends.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "number", description: "The client's custom ID (e.g. 1439)" },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_stats",
      description: "Get overall dashboard statistics including total balance, outstanding amounts, campaign due, and client counts by status.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_clients_by_status",
      description: "Get all clients filtered by their status (Active, Inactive, or Hold).",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["Active", "Inactive", "Hold"], description: "Client status to filter by" },
        },
        required: ["status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_clients_by_executive",
      description: "Get all clients assigned to a specific executive (Jisan or Saif).",
      parameters: {
        type: "object",
        properties: {
          executive: { type: "string", description: "Executive name (Jisan or Saif)" },
        },
        required: ["executive"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_client_status",
      description: "Update a client's status to Active, Inactive, or Hold.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "number", description: "The client's custom ID" },
          status: { type: "string", enum: ["Active", "Inactive", "Hold"], description: "New status" },
        },
        required: ["clientId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_payment",
      description: "Add a payment transaction for a client. This updates their balance and syncs to Google Sheets.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "number", description: "The client's custom ID" },
          amount: { type: "number", description: "Payment amount in BDT" },
          date: { type: "string", description: "Payment date in DD/MM/YYYY format" },
          method: { type: "string", description: "Payment method (e.g. bank, bkash, nagad)" },
        },
        required: ["clientId", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sync_client_sheet",
      description: "Sync a specific client's data from their Google Sheet. This reimports all transactions from the sheet.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "number", description: "The client's custom ID" },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sync_all_sheets",
      description: "Sync ALL client Google Sheets. This is a heavy operation that takes several minutes due to rate limiting. Only use when explicitly requested.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payment_history",
      description: "Get bulk payment history, optionally filtered by date range.",
      parameters: {
        type: "object",
        properties: {
          fromDate: { type: "string", description: "Start date filter (YYYY-MM-DD format)" },
          toDate: { type: "string", description: "End date filter (YYYY-MM-DD format)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_negative_balance_clients",
      description: "Get all clients who have a negative balance (owe money).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "update_client_executive",
      description: "Change the executive assigned to a client.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "number", description: "The client's custom ID" },
          executive: { type: "string", description: "New executive name (Jisan or Saif)" },
        },
        required: ["clientId", "executive"],
      },
    },
  },
];

async function executeTool(name: string, args: any): Promise<string> {
  try {
    switch (name) {
      case "get_all_clients": {
        const clients = await storage.getClients();
        const summary = clients.map(c => ({
          id: c.clientId,
          name: c.name,
          balance: c.balance,
          status: c.status,
          executive: c.executive,
          adsAccount: c.adsAccount,
          campaignDue: c.campaignDue,
        }));
        return JSON.stringify({ total: clients.length, clients: summary });
      }

      case "get_client_details": {
        const client = await storage.getClientByClientId(args.clientId);
        if (!client) return JSON.stringify({ error: `Client ${args.clientId} not found` });
        return JSON.stringify(client);
      }

      case "get_client_transactions": {
        const client = await storage.getClientByClientId(args.clientId);
        if (!client) return JSON.stringify({ error: `Client ${args.clientId} not found` });
        const txns = await storage.getTransactions(client.id);
        return JSON.stringify({ client: client.name, clientId: args.clientId, transactionCount: txns.length, transactions: txns.slice(0, 50) });
      }

      case "get_dashboard_stats": {
        const allClients = await storage.getClients();
        let totalBalance = 0, totalOutstanding = 0, totalPayReceived = 0, totalCampaignDue = 0;
        let activeCount = 0, inactiveCount = 0, holdCount = 0;
        for (const c of allClients) {
          const bal = parseFloat(c.balance) || 0;
          totalBalance += bal;
          if (bal < 0) totalOutstanding += bal;
          if (bal > 0) totalPayReceived += bal;
          totalCampaignDue += parseFloat(c.campaignDue) || 0;
          if (c.status === 'Active') activeCount++;
          else if (c.status === 'Inactive') inactiveCount++;
          else if (c.status === 'Hold') holdCount++;
        }
        return JSON.stringify({
          totalClients: allClients.length, activeCount, inactiveCount, holdCount,
          totalBalance: totalBalance.toFixed(2), totalOutstanding: totalOutstanding.toFixed(2),
          totalPayReceived: totalPayReceived.toFixed(2), totalCampaignDue: totalCampaignDue.toFixed(2),
        });
      }

      case "get_clients_by_status": {
        const all = await storage.getClients();
        const filtered = all.filter(c => c.status === args.status);
        return JSON.stringify({
          status: args.status, count: filtered.length,
          clients: filtered.map(c => ({ id: c.clientId, name: c.name, balance: c.balance, executive: c.executive })),
        });
      }

      case "get_clients_by_executive": {
        const all = await storage.getClients();
        const filtered = all.filter(c => c.executive.toLowerCase() === args.executive.toLowerCase());
        return JSON.stringify({
          executive: args.executive, count: filtered.length,
          clients: filtered.map(c => ({ id: c.clientId, name: c.name, balance: c.balance, status: c.status })),
        });
      }

      case "update_client_status": {
        const validStatuses = ["Active", "Inactive", "Hold"];
        if (!validStatuses.includes(args.status)) {
          return JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
        }
        const client = await storage.getClientByClientId(args.clientId);
        if (!client) return JSON.stringify({ error: `Client ${args.clientId} not found` });
        const updated = await storage.updateClient(client.id, { status: args.status });
        return JSON.stringify({ success: true, client: updated?.name, newStatus: args.status });
      }

      case "add_payment": {
        if (!args.clientId || typeof args.clientId !== "number") {
          return JSON.stringify({ error: "Valid clientId is required" });
        }
        const parsedAmount = parseFloat(args.amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          return JSON.stringify({ error: "Amount must be a positive number" });
        }
        const client = await storage.getClientByClientId(args.clientId);
        if (!client) return JSON.stringify({ error: `Client ${args.clientId} not found` });

        const today = new Date();
        const date = args.date || `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
        const method = args.method || "bank";
        const amount = String(args.amount);
        const paymentNote = `${date.replace(/20(\d{2})$/, '$1')}/cli-${args.clientId}/lst-${method}/pay-${amount}`;

        const existing = await storage.findTransactionByNote(client.id, paymentNote);
        if (existing) {
          return JSON.stringify({ error: "Duplicate payment already exists", existingId: existing.id });
        }

        const txnData = {
          clientId: client.id, date, bdtAmount: amount, usdAmount: "0",
          platform: "Facebook", remainingBdt: "0", platformSpend: "0", paymentNote,
        };

        await storage.createTransaction(txnData);
        const currentBalance = parseFloat(client.balance) || 0;
        const newBalance = (currentBalance + parseFloat(amount)).toFixed(2);
        await storage.updateClient(client.id, { balance: newBalance, totalDue: newBalance });

        let sheetSynced = false;
        if (client.googleSheetId) {
          try {
            await appendToSheet(client.googleSheetId, {
              date, bdtAmount: amount, usdAmount: "0", platform: "Facebook",
              remainingBdt: "0", platformSpend: "0", paymentNote,
            });
            sheetSynced = true;
          } catch (e: any) {
            console.error(`AI payment sheet sync failed: ${e.message}`);
          }
        }

        return JSON.stringify({
          success: true, client: client.name, amount, date, method,
          newBalance, sheetSynced,
        });
      }

      case "sync_client_sheet": {
        const { readClientSheetData } = await import("./googleSheets");
        const client = await storage.getClientByClientId(args.clientId);
        if (!client) return JSON.stringify({ error: `Client ${args.clientId} not found` });
        if (!client.googleSheetId) return JSON.stringify({ error: `Client ${client.name} has no Google Sheet linked` });

        const { txns, sheetBalance } = await readClientSheetData(client.googleSheetId);
        await storage.deleteTransactionsByClientId(client.id);
        for (const txn of txns) {
          await storage.createTransaction({ clientId: client.id, ...txn });
        }
        const balance = sheetBalance || "0";
        await storage.updateClient(client.id, { balance, totalDue: balance });

        return JSON.stringify({ success: true, client: client.name, transactionsCount: txns.length, balance });
      }

      case "sync_all_sheets": {
        const { readClientSheetData } = await import("./googleSheets");
        const allClients = await storage.getClients();
        const syncable = allClients.filter(c => c.googleSheetId);
        let succeeded = 0, failed = 0;

        for (let i = 0; i < syncable.length; i += 2) {
          if (i > 0) await new Promise(r => setTimeout(r, 5000));
          const batch = syncable.slice(i, i + 2);
          const results = await Promise.allSettled(batch.map(async (client) => {
            const { txns, sheetBalance } = await readClientSheetData(client.googleSheetId!);
            await storage.deleteTransactionsByClientId(client.id);
            for (const txn of txns) {
              await storage.createTransaction({ clientId: client.id, ...txn });
            }
            const balance = sheetBalance || "0";
            await storage.updateClient(client.id, { balance, totalDue: balance });
          }));
          for (const r of results) {
            if (r.status === "fulfilled") succeeded++; else failed++;
          }
        }

        return JSON.stringify({ success: true, total: syncable.length, succeeded, failed, skipped: allClients.length - syncable.length });
      }

      case "get_payment_history": {
        const history = await storage.getBulkPaymentHistory(args.fromDate, args.toDate);
        const allClients = await storage.getClients();
        const clientMap = new Map(allClients.map(c => [c.id, c]));
        const totalAmount = history.reduce((sum, t) => sum + (parseFloat(t.bdtAmount) || 0), 0);
        const enriched = history.slice(0, 50).map(t => ({
          ...t,
          clientName: clientMap.get(t.clientId)?.name || "Unknown",
          clientCode: clientMap.get(t.clientId)?.clientId || 0,
        }));
        return JSON.stringify({ count: history.length, totalAmount: totalAmount.toFixed(2), payments: enriched });
      }

      case "get_negative_balance_clients": {
        const all = await storage.getClients();
        const negative = all.filter(c => parseFloat(c.balance) < 0)
          .map(c => ({ id: c.clientId, name: c.name, balance: c.balance, status: c.status, executive: c.executive }))
          .sort((a, b) => parseFloat(a.balance) - parseFloat(b.balance));
        return JSON.stringify({ count: negative.length, totalOwed: negative.reduce((s, c) => s + parseFloat(c.balance), 0).toFixed(2), clients: negative });
      }

      case "update_client_executive": {
        if (!args.executive || typeof args.executive !== "string" || args.executive.trim().length === 0) {
          return JSON.stringify({ error: "Executive name is required" });
        }
        const client = await storage.getClientByClientId(args.clientId);
        if (!client) return JSON.stringify({ error: `Client ${args.clientId} not found` });
        const updated = await storage.updateClient(client.id, { executive: args.executive.trim() });
        return JSON.stringify({ success: true, client: updated?.name, newExecutive: args.executive.trim() });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (error: any) {
    return JSON.stringify({ error: error.message });
  }
}

function getProviderEndpoint(provider: string): { url: string; defaultModel: string } {
  switch (provider.toLowerCase()) {
    case "deepseek":
      return { url: "https://api.deepseek.com/v1/chat/completions", defaultModel: "deepseek-chat" };
    case "gemini":
      return { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", defaultModel: "gemini-2.0-flash" };
    case "openai":
      return { url: "https://api.openai.com/v1/chat/completions", defaultModel: "gpt-4o-mini" };
    case "openrouter":
      return { url: "https://openrouter.ai/api/v1/chat/completions", defaultModel: "deepseek/deepseek-chat" };
    default:
      return { url: "https://api.openai.com/v1/chat/completions", defaultModel: "gpt-4o-mini" };
  }
}

const SYSTEM_PROMPT = `You are the AI assistant for an advertising agency CRM system. You help manage 73+ clients who run Facebook/TikTok ad campaigns.

Key facts about this system:
- Currency is BDT (৳) for payments and USD ($) for ad spend
- Clients have statuses: Active, Inactive, or Hold
- Two executives manage accounts: Jisan and Saif
- Each client may have a linked Google Sheet for transaction records
- Bulk payments come in WhatsApp format: DD/MM/YY/cli-XXXX/lst-method/pay-amount

You can:
- Look up any client data, balances, transactions, and stats
- Add payments and update client information
- Sync data from Google Sheets
- Filter clients by status, executive, or balance
- Provide summaries and insights about the business

When providing financial data, always format BDT amounts with ৳ symbol and USD with $ symbol.
Be concise but thorough. When asked about multiple clients, present data in a clear organized format.
If asked to perform an action that could modify data (payments, status changes, syncs), confirm what you're about to do before executing.`;

export async function processAIChat(
  messages: AIMessage[],
  config: AIProviderConfig,
): Promise<{ reply: string; toolsUsed: string[] }> {
  const { url, defaultModel } = getProviderEndpoint(config.provider);
  const model = config.model || defaultModel;
  const toolsUsed: string[] = [];

  const fullMessages: AIMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  let maxIterations = 10;

  while (maxIterations-- > 0) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error("No response from AI provider");

    const assistantMsg = choice.message;
    fullMessages.push(assistantMsg);

    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      for (const toolCall of assistantMsg.tool_calls) {
        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments || "{}");
        console.log(`[AI] Calling tool: ${fnName}`, fnArgs);
        toolsUsed.push(fnName);

        const result = await executeTool(fnName, fnArgs);

        fullMessages.push({
          role: "tool",
          content: result,
          tool_call_id: toolCall.id,
        });
      }
      continue;
    }

    return { reply: assistantMsg.content || "I couldn't generate a response.", toolsUsed };
  }

  return { reply: "I hit the maximum number of tool calls. Please try a simpler request.", toolsUsed };
}
