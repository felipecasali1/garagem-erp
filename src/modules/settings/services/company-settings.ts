import { supabase } from "@/shared/supabase/client";

export type CompanySettingsDraft = {
  legal_name: string;
  trade_name: string;
  cnpj: string;
  state_registration: string;
  phone: string;
  email: string;
  zip_code: string;
  city: string;
  state: string;
  street: string;
  number: string;
  neighborhood: string;
};

export type CompanySettingsRecord = CompanySettingsDraft & {
  id: number;
  logo_url?: string;
};

type CompanySettingsRow = CompanySettingsRecord & {
  logo_url: string | null;
};

export const companySettingsKeys = {
  detail: ["company-settings"] as const,
};

const emptyCompanySettings: CompanySettingsDraft = {
  legal_name: "",
  trade_name: "",
  cnpj: "",
  state_registration: "",
  phone: "",
  email: "",
  zip_code: "",
  city: "",
  state: "",
  street: "",
  number: "",
  neighborhood: "",
};

function normalizeText(value: string) {
  return value.trim() || null;
}

function mapCompanySettings(row: CompanySettingsRow): CompanySettingsRecord {
  return {
    id: row.id,
    legal_name: row.legal_name,
    trade_name: row.trade_name ?? "",
    cnpj: row.cnpj,
    state_registration: row.state_registration ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    zip_code: row.zip_code ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    street: row.street ?? "",
    number: row.number ?? "",
    neighborhood: row.neighborhood ?? "",
    logo_url: row.logo_url ?? undefined,
  };
}

export function getEmptyCompanySettings() {
  return { ...emptyCompanySettings };
}

export async function getCompanySettings() {
  const { data, error } = await supabase
    .from("company_settings")
    .select(
      "id, legal_name, trade_name, cnpj, state_registration, phone, email, logo_url, zip_code, city, state, street, number, neighborhood",
    )
    .order("id")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapCompanySettings(data as CompanySettingsRow) : null;
}

export async function saveCompanySettings(draft: CompanySettingsDraft) {
  if (!draft.legal_name.trim()) {
    throw new Error("Informe a razão social.");
  }
  if (!draft.cnpj.trim()) {
    throw new Error("Informe o CNPJ.");
  }

  const current = await getCompanySettings();
  const payload = {
    legal_name: draft.legal_name.trim(),
    trade_name: normalizeText(draft.trade_name),
    cnpj: draft.cnpj.trim(),
    state_registration: normalizeText(draft.state_registration),
    phone: normalizeText(draft.phone),
    email: normalizeText(draft.email),
    zip_code: normalizeText(draft.zip_code),
    city: normalizeText(draft.city),
    state: normalizeText(draft.state),
    street: normalizeText(draft.street),
    number: normalizeText(draft.number),
    neighborhood: normalizeText(draft.neighborhood),
  };

  const query = current
    ? supabase.from("company_settings").update(payload).eq("id", current.id)
    : supabase.from("company_settings").insert(payload);

  const { data, error } = await query
    .select(
      "id, legal_name, trade_name, cnpj, state_registration, phone, email, logo_url, zip_code, city, state, street, number, neighborhood",
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapCompanySettings(data as CompanySettingsRow);
}
