export function formatTemp(celsius, units) {
  if (celsius == null || Number.isNaN(Number(celsius))) return "—";
  if (units === "F") return `${Math.round(Number(celsius) * (9 / 5) + 32)}°F`;
  return `${Math.round(Number(celsius))}°C`;
}

export function formatNumber(value, suffix = "") {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Math.round(Number(value) * 10) / 10}${suffix}`;
}

export function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
