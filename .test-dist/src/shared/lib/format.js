// SSR-safe formatters: never depend on locale, timezone, or Date.now during render.
export const brl = (v) => {
    // Manual BRL formatting to avoid Intl locale differences between SSR and client.
    const sign = v < 0 ? "-" : "";
    const abs = Math.abs(v);
    const [int, decRaw] = abs.toFixed(2).split(".");
    const intGrouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${sign}R$ ${intGrouped},${decRaw}`;
};
// Parses YYYY-MM-DD as a calendar date (no timezone shift)
const parseISODate = (iso) => {
    const [datePart] = iso.split("T");
    const [y, m, d] = datePart.split("-").map((n) => parseInt(n, 10));
    return { y, m, d };
};
const pad = (n) => String(n).padStart(2, "0");
export const fmtDate = (iso) => {
    const { y, m, d } = parseISODate(iso);
    return `${pad(d)}/${pad(m)}/${y}`;
};
const MONTHS_PT_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const fmtMonth = (iso) => {
    const { m } = parseISODate(iso);
    return MONTHS_PT_SHORT[m - 1] ?? "";
};
export const initials = (name) => name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
// Note: relTime uses Date.now() - only use in client-only contexts (notifications dropdown).
export const relTime = (iso) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60)
        return "agora";
    if (diff < 3600)
        return `há ${Math.floor(diff / 60)}min`;
    if (diff < 86400)
        return `há ${Math.floor(diff / 3600)}h`;
    return `há ${Math.floor(diff / 86400)}d`;
};
