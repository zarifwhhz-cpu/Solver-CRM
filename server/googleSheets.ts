import { google, sheets_v4 } from 'googleapis';
import { db } from './db';
import { appSettings } from '@shared/schema';
import { eq, like } from 'drizzle-orm';

async function getServiceAccountJSON(): Promise<string | null> {
  try {
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, 'google_service_account_json'));
    if (rows.length > 0 && rows[0].value) {
      return rows[0].value;
    }
  } catch (e) {
  }
  return process.env.GOOGLE_SERVICE_ACCOUNT_JSON || null;
}

async function getAllServiceAccountJSONs(): Promise<string[]> {
  const results: string[] = [];
  try {
    const rows = await db.select().from(appSettings).where(like(appSettings.key, 'google_service_account_json%'));
    for (const row of rows) {
      if (row.value) results.push(row.value);
    }
  } catch (e) {}
  if (results.length === 0) {
    const env = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (env) results.push(env);
  }
  return results;
}

const clientCache = new Map<string, sheets_v4.Sheets>();

function buildCacheKey(json: string): string {
  return json.slice(0, 100) + json.length;
}

async function buildSheetClient(json: string): Promise<sheets_v4.Sheets> {
  const key = buildCacheKey(json);
  const cached = clientCache.get(key);
  if (cached) return cached;

  let credentials;
  try {
    credentials = JSON.parse(json);
  } catch (e) {
    throw new Error('Google Service Account JSON is not valid.');
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  const client = google.sheets({ version: 'v4', auth: authClient as any });
  clientCache.set(key, client);
  return client;
}

export async function getGoogleSheetClient(): Promise<sheets_v4.Sheets> {
  const json = await getServiceAccountJSON();
  if (!json) {
    throw new Error('Google Service Account is not configured. Go to Settings to connect your Google account, or set GOOGLE_SERVICE_ACCOUNT_JSON in .env.');
  }
  return buildSheetClient(json);
}

export async function getAllGoogleSheetClients(): Promise<sheets_v4.Sheets[]> {
  const jsons = await getAllServiceAccountJSONs();
  if (jsons.length === 0) {
    throw new Error('No Google Service Account configured.');
  }
  const clients = await Promise.all(jsons.map(j => buildSheetClient(j)));
  return clients;
}

export function clearSheetClientCache() {
  clientCache.clear();
}

export async function getServiceAccountEmail(): Promise<string | null> {
  const json = await getServiceAccountJSON();
  if (!json) return null;
  try {
    const creds = JSON.parse(json);
    return creds.client_email || null;
  } catch {
    return null;
  }
}

export async function getAllServiceAccountEmails(): Promise<string[]> {
  const jsons = await getAllServiceAccountJSONs();
  const emails: string[] = [];
  for (const json of jsons) {
    try {
      const creds = JSON.parse(json);
      if (creds.client_email) emails.push(creds.client_email);
    } catch {}
  }
  return emails;
}

export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function cleanAmount(value: string): string {
  if (!value || value.trim() === '') return "0";
  const cleaned = value.replace(/[৳$,\s]/g, '').trim();
  return cleaned || "0";
}

async function resolvePnlSheetName(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<{ pnlSheet: string; sheetId: number }> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const sheetsList = meta.data.sheets || [];
  const pnlSheetMeta = sheetsList.find(s => s.properties?.title === 'PNL') || sheetsList[0];
  const pnlSheet = pnlSheetMeta?.properties?.title || 'Sheet1';
  const sheetId = pnlSheetMeta?.properties?.sheetId || 0;
  return { pnlSheet, sheetId };
}

export async function readClientSheetData(spreadsheetId: string, sheetsClient?: sheets_v4.Sheets) {
  const sheets = sheetsClient || await getGoogleSheetClient();

  const { pnlSheet } = await resolvePnlSheetName(sheets, spreadsheetId);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${pnlSheet}'!A:G`,
  });

  const rows = response.data.values || [];

  let sheetBalance: string | null = null;
  if (rows.length > 1) {
    const row2 = rows[1];
    if (row2 && row2[3]) {
      sheetBalance = cleanAmount(row2[3]);
    }
  }

  const txns: Array<{
    date: string;
    bdtAmount: string;
    usdAmount: string;
    platform: string;
    remainingBdt: string;
    platformSpend: string;
    paymentNote: string;
  }> = [];

  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;

    const date = row[0]?.trim() || '';
    const bdtAmount = cleanAmount(row[1] || '');
    const usdAmount = cleanAmount(row[2] || '');
    const platform = row[3]?.trim() || 'Facebook';
    const remainingBdt = cleanAmount(row[4] || '');
    const platformSpend = cleanAmount(row[5] || '');
    const paymentNote = row[6]?.trim() || '';

    if (!date && bdtAmount === '0' && usdAmount === '0' && !paymentNote) continue;

    txns.push({ date, bdtAmount, usdAmount, platform, remainingBdt, platformSpend, paymentNote });
  }

  return { txns, sheetBalance };
}

export async function readMainSheetClients(spreadsheetId: string) {
  const sheets = await getGoogleSheetClient();

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title) || [];
  const hasDashboard = sheetNames.includes('Client Dashboard');

  const range = hasDashboard ? "'Client Dashboard'!A1:K200" : 'A1:K200';
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });

  const rows = response.data.values || [];
  const clients: Array<{
    clientId: number;
    name: string;
    balance: string;
    totalDue: string;
    campaignDue: string;
    status: string;
    executive: string;
    adsAccount: string;
    googleSheetUrl: string | null;
    googleSheetId: string | null;
  }> = [];

  const row0 = rows[0] || [];
  const row1 = rows[1] || [];
  const hasStatusRow0 = row0.some((h: string) => h?.toLowerCase().includes('status'));
  const hasStatusRow1 = row1.some((h: string) => h?.toLowerCase().includes('status'));
  const hasStatus = hasStatusRow0 || hasStatusRow1;
  const dataStart = hasStatus ? (hasStatusRow0 ? 2 : (hasStatusRow1 ? 3 : 2)) : 1;

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const clientIdRaw = parseInt(row[0]?.trim());
    if (isNaN(clientIdRaw)) continue;

    const name = row[1]?.trim() || '';
    if (!name) continue;

    let googleSheetUrl: string | null = null;
    let googleSheetId: string | null = null;

    if (hasStatus) {
      const dashBalance = cleanAmount(row[3] || '');
      const campDue = cleanAmount(row[4] || '');
      const status = (row[6] || 'Inactive').trim();
      const executive = (row[7] || '').trim();
      const adsAccount = (row[8] || '').trim();

      clients.push({
        clientId: clientIdRaw,
        name,
        balance: dashBalance,
        totalDue: dashBalance,
        campaignDue: campDue,
        status: ['Active', 'Inactive', 'Hold'].includes(status) ? status : 'Inactive',
        executive,
        adsAccount,
        googleSheetUrl: null,
        googleSheetId: null,
      });
    } else {
      const rawUrl = (row[3] || '').trim().replace(/^-/, '');
      if (rawUrl && rawUrl.includes('docs.google.com/spreadsheets')) {
        googleSheetUrl = rawUrl;
        googleSheetId = extractSheetId(rawUrl);
      }

      clients.push({
        clientId: clientIdRaw,
        name,
        balance: "0",
        totalDue: "0",
        campaignDue: "0",
        status: "Active",
        executive: "",
        adsAccount: "",
        googleSheetUrl,
        googleSheetId,
      });
    }
  }

  return clients;
}

export async function deleteSheetRows(spreadsheetId: string, rowNumbers: number[]) {
  const sheets = await getGoogleSheetClient();

  const { sheetId, pnlSheet: pnlSheetName } = await resolvePnlSheetName(sheets, spreadsheetId);

  const sorted = [...rowNumbers].sort((a, b) => b - a);

  const requests = sorted.map(row => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: 'ROWS',
        startIndex: row - 1,
        endIndex: row,
      },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  console.log(`[Sheet Cleanup] Deleted ${sorted.length} rows from '${pnlSheetName}': ${sorted.join(', ')}`);
}

export async function clearSheetRow(spreadsheetId: string, rowNumber: number) {
  const sheets = await getGoogleSheetClient();

  const { pnlSheet } = await resolvePnlSheetName(sheets, spreadsheetId);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${pnlSheet}'!A${rowNumber}:G${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [['', '', '', 'Facebook', '৳0.00', '৳0.00', '']],
    },
  });

  console.log(`[Sheet Cleanup] Cleared row ${rowNumber} back to template`);
}

export async function appendToSheet(spreadsheetId: string, transaction: {
  date: string;
  bdtAmount: string;
  usdAmount: string;
  platform: string;
  remainingBdt: string;
  platformSpend: string;
  paymentNote: string;
}, sheetsClient?: sheets_v4.Sheets) {
  const sheets = sheetsClient || await getGoogleSheetClient();

  const toNum = (val: string) => {
    const n = parseFloat(val);
    if (isNaN(n) || n === 0) return '';
    return n.toString();
  };

  const { pnlSheet } = await resolvePnlSheetName(sheets, spreadsheetId);

  const colAData = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${pnlSheet}'!A1:A1000`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const colA = colAData.data.values || [];

  let lastDateRow = 3;
  for (let i = colA.length - 1; i >= 3; i--) {
    const cell = colA[i]?.[0]?.toString().trim();
    if (cell && /\d/.test(cell)) {
      lastDateRow = i + 1;
      break;
    }
  }
  const targetRow = lastDateRow + 1;

  const writeData: { range: string; values: any[][] }[] = [];

  writeData.push({
    range: `'${pnlSheet}'!A${targetRow}:D${targetRow}`,
    values: [[
      transaction.date,
      toNum(transaction.bdtAmount),
      toNum(transaction.usdAmount),
      transaction.platform,
    ]],
  });

  if (transaction.paymentNote) {
    writeData.push({
      range: `'${pnlSheet}'!G${targetRow}`,
      values: [[transaction.paymentNote]],
    });
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: writeData,
    },
  });

  console.log(`[Sheet Write] Wrote to row ${targetRow} in '${pnlSheet}', columns A-D and G`);
}
