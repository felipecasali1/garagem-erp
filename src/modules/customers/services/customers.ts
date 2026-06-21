import { supabase } from "@/shared/supabase/client";
import {
  normalizeCep,
  normalizeDocument,
  normalizePhone,
  normalizeUf,
} from "@/shared/lib/field-format";
import type { Address, Customer, PersonType } from "@/shared/types/domain";
import type { CustomerDraft } from "@/modules/customers/types";

type PersonRow = {
  id: number;
  name: string;
  type: PersonType;
  cpf: string | null;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

type AddressRow = {
  id: number;
  person_id: number;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  is_primary: boolean;
};

type CustomerRow = {
  id: number;
  person_id: number;
  notes: string | null;
  total_purchases: number;
  created_at: string;
  person: PersonRow | null;
};

function normalizeText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mapAddress(row?: AddressRow): Address | undefined {
  if (!row) return undefined;

  return {
    id: row.id,
    zip_code: row.zip_code ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    neighborhood: row.neighborhood ?? "",
    street: row.street ?? "",
    number: row.number ?? "",
    complement: row.complement ?? undefined,
  };
}

function mapCustomer(row: CustomerRow, address?: AddressRow): Customer {
  if (!row.person) {
    throw new Error("Cliente sem registro de pessoa.");
  }

  return {
    id: row.id,
    person: {
      id: row.person.id,
      name: row.person.name,
      cpf: row.person.cpf ?? undefined,
      cnpj: row.person.cnpj ?? undefined,
      phone: row.person.phone ?? "",
      email: row.person.email ?? "",
      type: row.person.type,
      primary_address: mapAddress(address),
    },
    notes: row.notes ?? undefined,
    total_purchases: Number(row.total_purchases),
    created_at: row.created_at,
  };
}

async function fetchAddresses(personIds: number[]) {
  if (personIds.length === 0) {
    return new Map<number, AddressRow>();
  }

  const { data, error } = await supabase
    .from("addresses")
    .select(
      "id, person_id, street, number, complement, neighborhood, city, state, zip_code, is_primary",
    )
    .in("person_id", personIds)
    .eq("is_primary", true);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as AddressRow[];
  return new Map(rows.map((row) => [row.person_id, row]));
}

async function fetchCustomerRows(id?: number) {
  let query = supabase
    .from("customers")
    .select(
      "id, person_id, notes, total_purchases, created_at, person:people(id, name, type, cpf, cnpj, phone, email, notes)",
    )
    .order("created_at", { ascending: false });

  if (id != null) {
    query = query.eq("id", id);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as CustomerRow[];
  const addresses = await fetchAddresses(rows.map((row) => row.person_id));

  return rows.map((row) => mapCustomer(row, addresses.get(row.person_id)));
}

async function upsertPrimaryAddress(personId: number, address: CustomerDraft["primary_address"]) {
  const { data: existing, error: existingError } = await supabase
    .from("addresses")
    .select("id")
    .eq("person_id", personId)
    .eq("is_primary", true)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const payload = {
    person_id: personId,
    street: normalizeText(address.street),
    number: normalizeText(address.number),
    complement: normalizeText(address.complement),
    neighborhood: normalizeText(address.neighborhood),
    city: normalizeText(address.city),
    state: normalizeText(normalizeUf(address.state)),
    zip_code: normalizeText(normalizeCep(address.zip_code)),
    is_primary: true,
  };

  if (existing) {
    const { error } = await supabase.from("addresses").update(payload).eq("id", existing.id);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabase.from("addresses").insert(payload);
  if (error) {
    throw new Error(error.message);
  }
}

async function createPersonAndCustomer(draft: CustomerDraft) {
  const documentField = draft.type === "company" ? "cnpj" : "cpf";
  const { data: person, error: personError } = await supabase
    .from("people")
    .insert({
      name: draft.name.trim(),
      type: draft.type,
      cpf:
        documentField === "cpf"
          ? normalizeText(normalizeDocument(draft.document, "individual"))
          : null,
      cnpj:
        documentField === "cnpj"
          ? normalizeText(normalizeDocument(draft.document, "company"))
          : null,
      phone: normalizeText(normalizePhone(draft.phone)),
      email: normalizeText(draft.email),
    })
    .select("id")
    .single();

  if (personError) {
    throw new Error(personError.message);
  }

  await upsertPrimaryAddress(person.id, draft.primary_address);

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      person_id: person.id,
      notes: normalizeText(draft.notes),
    })
    .select("id")
    .single();

  if (customerError) {
    throw new Error(customerError.message);
  }

  return customer.id;
}

export const customerKeys = {
  all: ["customers"] as const,
  detail: (id: number) => ["customers", id] as const,
};

export async function listCustomers() {
  return fetchCustomerRows();
}

export async function getCustomerById(id: number) {
  const [customer] = await fetchCustomerRows(id);
  if (!customer) {
    throw new Error("Cliente não encontrado.");
  }
  return customer;
}

export async function createCustomer(draft: CustomerDraft) {
  const id = await createPersonAndCustomer(draft);
  return getCustomerById(id);
}

export async function updateCustomer(id: number, draft: CustomerDraft) {
  const customer = await getCustomerById(id);
  const documentField = draft.type === "company" ? "cnpj" : "cpf";

  const { error: personError } = await supabase
    .from("people")
    .update({
      name: draft.name.trim(),
      type: draft.type,
      cpf:
        documentField === "cpf"
          ? normalizeText(normalizeDocument(draft.document, "individual"))
          : null,
      cnpj:
        documentField === "cnpj"
          ? normalizeText(normalizeDocument(draft.document, "company"))
          : null,
      phone: normalizeText(normalizePhone(draft.phone)),
      email: normalizeText(draft.email),
    })
    .eq("id", customer.person.id);

  if (personError) {
    throw new Error(personError.message);
  }

  await upsertPrimaryAddress(customer.person.id, draft.primary_address);

  const { error: customerError } = await supabase
    .from("customers")
    .update({
      notes: normalizeText(draft.notes),
    })
    .eq("id", id);

  if (customerError) {
    throw new Error(customerError.message);
  }

  return getCustomerById(id);
}

export async function deleteCustomer(id: number) {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}
