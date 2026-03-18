export function extractClientCode(campaignName: string, clientCodes: number[]): number | null {
  const sorted = [...clientCodes].sort((a, b) => b - a);
  for (const code of sorted) {
    const codeStr = String(code);
    const regex = new RegExp(`(?:^|[^0-9])${codeStr}(?:$|[^0-9])`);
    if (regex.test(campaignName)) return code;
  }
  return null;
}
