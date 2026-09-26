export function formatMoney(value: number): string {
  return `¥${value.toFixed(2)}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 从 ISO 时间取 "YYYY-MM"，用于月底结算分月汇总 */
export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}
