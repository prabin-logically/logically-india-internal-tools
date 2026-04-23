export function istCode(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hh}${mm}`;
}

export function isValidCode(input: string, now: Date = new Date()): boolean {
  if (!/^\d{4}$/.test(input)) return false;
  const current = new Date(now);
  const candidates: string[] = [];
  for (const offset of [-1, 0, 1]) {
    const t = new Date(current.getTime() + offset * 60_000);
    candidates.push(istCode(t));
  }
  return candidates.includes(input);
}
