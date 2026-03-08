import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || !connectionSettings.settings) {
    throw new Error('Google Sheet not connected. Please connect your Google account in the integration settings.');
  }

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!accessToken) {
    throw new Error('Google Sheet access token not found. Please reconnect your Google account.');
  }
  return accessToken;
}

export async function getUncachableGoogleSheetClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.sheets({ version: 'v4', auth: oauth2Client });
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

export async function readClientSheetData(spreadsheetId: string) {
  const sheets = await getUncachableGoogleSheetClient();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title) || [];
  const pnlSheet = sheetNames.includes('PNL') ? 'PNL' : (sheetNames[0] || 'Sheet1');

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
  const sheets = await getUncachableGoogleSheetClient();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
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

  const headerRow = rows[0] || [];
  const hasStatus = headerRow.some((h: string) => h?.toLowerCase().includes('status'));
  const dataStart = hasStatus ? 2 : 1;

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

export async function appendToSheet(spreadsheetId: string, transaction: {
  date: string;
  bdtAmount: string;
  usdAmount: string;
  platform: string;
  remainingBdt: string;
  platformSpend: string;
  paymentNote: string;
}) {
  const sheets = await getUncachableGoogleSheetClient();

  const fmtBdt = (val: string) => {
    const n = parseFloat(val);
    if (isNaN(n) || n === 0) return '';
    return `৳${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const fmtUsd = (val: string) => {
    const n = parseFloat(val);
    if (isNaN(n) || n === 0) return '';
    return `$${Math.abs(n).toFixed(2)}`;
  };

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title) || [];
  const pnlSheet = sheetNames.includes('PNL') ? 'PNL' : (sheetNames[0] || 'Sheet1');
  console.log(`[Sheet Write] Target sheet tab: '${pnlSheet}' in spreadsheet: ${spreadsheetId}`);

  const allData = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${pnlSheet}'!A1:G1000`,
  });
  const allRows = allData.data.values || [];
  console.log(`[Sheet Write] Sheet has ${allRows.length} rows total (A:G)`);

  let lastContentRow = 3;
  for (let i = allRows.length - 1; i >= 3; i--) {
    const row = allRows[i];
    if (!row) continue;
    const hasDate = row[0] && row[0].toString().trim();
    const hasAmount = row[1] && cleanAmount(row[1]) !== '0';
    const hasNote = row[6] && row[6].toString().trim();
    if (hasDate || hasAmount || hasNote) {
      lastContentRow = i + 1;
      break;
    }
  }
  const targetRow = lastContentRow + 1;
  console.log(`[Sheet Write] Last content row: ${lastContentRow}, writing to row: ${targetRow}`);

  const rowData = [
    transaction.date,
    fmtBdt(transaction.bdtAmount),
    fmtUsd(transaction.usdAmount),
    transaction.platform,
    fmtBdt(transaction.remainingBdt),
    fmtBdt(transaction.platformSpend),
    transaction.paymentNote,
  ];

  const writeRange = `'${pnlSheet}'!A${targetRow}:G${targetRow}`;
  console.log(`[Sheet Write] Writing to ${writeRange}: ${JSON.stringify(rowData)}`);

  const result = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: writeRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [rowData],
    },
  });

  console.log(`[Sheet Write] Result: ${result.data.updatedCells} cells updated at ${result.data.updatedRange}`);

  const verify = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${pnlSheet}'!A${targetRow}:G${targetRow}`,
  });
  const written = verify.data.values?.[0];
  if (!written || !written[0]) {
    throw new Error(`Verification failed: data not found at row ${targetRow} after write`);
  }
  console.log(`[Sheet Write] Verified: row ${targetRow} contains: ${written[0]} | ${written[1] || ''} | ... | ${written[6] || ''}`);
}
