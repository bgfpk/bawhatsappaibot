export function parseDashboardAmount(value: any) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = typeof value === "number"
    ? value
    : Number(String(value).replace(/[^0-9.-]/g, ""));

  if (!Number.isFinite(parsed)) return 0;
  if (Math.abs(parsed) > 100_000_000) return 0;
  return parsed;
}

export function formatMoneyValue(value: number, symbol: string, maxFractions = 2, compact = false) {
  const amount = Number.isFinite(value) ? value : 0;
  if (amount === 0 || Object.is(amount, -0)) {
    return symbol + "0.00";
  }
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const prefix = isNegative ? `-${symbol}` : symbol;

  if (absAmount < 0.01 && !compact) {
    const fixed4 = absAmount.toFixed(4);
    const trimmed = fixed4.replace(/0+$/, "");
    const formatted = trimmed.length <= 4 ? absAmount.toFixed(3) : trimmed;
    return `${prefix}${formatted}`;
  }

  return (
    prefix +
    absAmount.toLocaleString(undefined, {
      notation: compact ? "compact" : "standard",
      compactDisplay: "short",
      minimumFractionDigits: compact ? 0 : 2,
      maximumFractionDigits: maxFractions < 2 ? 2 : maxFractions,
    })
  );
}

export function convertUsdToAccountCurrency(value: number, exchangeRate: number) {
  const amount = Number.isFinite(value) ? value : 0;
  const rate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1;
  return amount * rate;
}
