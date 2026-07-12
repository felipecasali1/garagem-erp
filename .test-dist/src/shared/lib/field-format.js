export const digitsOnly = (value) => value.replace(/\D/g, "");
export const normalizeUpper = (value) => value.trim().toUpperCase();
export const normalizePlate = (value) => value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7);
export const normalizeUf = (value) => value.trim().toUpperCase().slice(0, 2);
export const normalizeCep = (value) => digitsOnly(value).slice(0, 8);
export const normalizePhone = (value) => digitsOnly(value).slice(0, 11);
export const normalizeCpf = (value) => digitsOnly(value).slice(0, 11);
export const normalizeCnpj = (value) => digitsOnly(value).slice(0, 14);
export const normalizeDocument = (value, type) => type === "company" ? normalizeCnpj(value) : normalizeCpf(value);
export const formatCpf = (value) => {
    const digits = normalizeCpf(value);
    return digits
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1-$2")
        .slice(0, 14);
};
export const formatCnpj = (value) => {
    const digits = normalizeCnpj(value);
    return digits
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/\/(\d{4})(\d)/, "/$1-$2")
        .slice(0, 18);
};
export const formatDocument = (value, type) => type === "company" ? formatCnpj(value) : formatCpf(value);
export const formatPhone = (value) => {
    const digits = normalizePhone(value);
    if (digits.length <= 2)
        return digits;
    if (digits.length <= 6) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    }
    if (digits.length <= 10) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};
export const formatCep = (value) => {
    const digits = normalizeCep(value);
    if (digits.length <= 5)
        return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};
export const formatPlate = (value) => {
    const plate = normalizePlate(value);
    if (plate.length <= 3)
        return plate;
    return `${plate.slice(0, 3)}-${plate.slice(3)}`;
};
export const parseNumberInput = (value) => {
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const parsed = Number(trimmed.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
};
export const formatNumberInput = (value) => value === null || value === undefined ? "" : String(value);
