export function sanitizeText(input, fallback = "") {
  if (typeof input !== "string") return fallback;
  return input.trim().slice(0, 300);
}

export function clamp(value, min, max) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
