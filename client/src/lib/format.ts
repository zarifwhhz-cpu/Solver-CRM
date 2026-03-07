export function formatBDT(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '৳0.00';
  const formatted = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num < 0 ? `-৳${formatted}` : `৳${formatted}`;
}

export function formatUSD(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '$0.00';
  const formatted = Math.abs(num).toFixed(2);
  return num < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function parseAmount(val: string): number {
  const cleaned = val.replace(/[৳$,\s]/g, '');
  return parseFloat(cleaned) || 0;
}
