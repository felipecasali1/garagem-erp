import type { PersonType } from "../types/domain.js";

export const digitsOnly = (value: string) => value.replace(/\D/g, "");

export const normalizeUpper = (value: string) => value.trim().toUpperCase();

export const normalizePlate = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7);

export const normalizeUf = (value: string) => value.trim().toUpperCase().slice(0, 2);

export const normalizeCep = (value: string) => digitsOnly(value).slice(0, 8);

export const normalizePhone = (value: string) => digitsOnly(value).slice(0, 11);

export const normalizeCpf = (value: string) => digitsOnly(value).slice(0, 11);

export const normalizeCnpj = (value: string) => digitsOnly(value).slice(0, 14);

export const normalizeDocument = (value: string, type: PersonType) =>
  type === "company" ? normalizeCnpj(value) : normalizeCpf(value);

export const formatCpf = (value: string) => {
  const digits = normalizeCpf(value);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2")
    .slice(0, 14);
};

export const formatCnpj = (value: string) => {
  const digits = normalizeCnpj(value);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/\/(\d{4})(\d)/, "/$1-$2")
    .slice(0, 18);
};

export const formatDocument = (value: string, type: PersonType) =>
  type === "company" ? formatCnpj(value) : formatCpf(value);

export const formatPhone = (value: string) => {
  const digits = normalizePhone(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export const formatCep = (value: string) => {
  const digits = normalizeCep(value);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

export const formatPlate = (value: string) => {
  const plate = normalizePlate(value);
  if (plate.length <= 3) return plate;
  return `${plate.slice(0, 3)}-${plate.slice(3)}`;
};

export const parseNumberInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatNumberInput = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);
