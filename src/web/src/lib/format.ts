/** Format a token count for display: 1234567 → "1.2M", 12345 → "12.3K" */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Convert a UTC date string "YYYY-MM-DD" to local date display "MM/DD" */
export function localShortDate(utcDate: string): string {
  // Parse as UTC, display in local timezone
  const d = new Date(utcDate + "T12:00:00Z"); // noon UTC to avoid date shift
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

/** Convert a UTC date string "YYYY-MM-DD" to local full date "YYYY-MM-DD" */
export function localFullDate(utcDate: string): string {
  const d = new Date(utcDate + "T12:00:00Z");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Convert epoch ms to local datetime string "YYYY-MM-DD HH:mm" */
export function localDateTime(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Format age from milliseconds: "3s", "5m", "2h", "1d" */
export function formatAge(ms: number | null): string {
  if (ms == null) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}
