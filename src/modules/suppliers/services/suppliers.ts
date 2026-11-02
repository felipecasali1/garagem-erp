import { supabase } from "@/shared/supabase/client";
import {
  normalizeCep,
  normalizeDocument,
  normalizePhone,
  normalizeUf,
} from "@/shared/lib/field-format";
import { createPersonConfiguration } from "@/shared/supabase/person-configuration";
import type { Address, Person, PersonType } from "@/shared/types/domain";
import type { SupplierDraft, SupplierType } from "@/modules/suppliers/types";
import { getPageBounds, type PaginatedResult } from "@/shared/lib/pagination";

export type { SupplierType } from "@/modules/suppliers/types";

type PersonRow = {
  id: number;
  name: string;
  type: PersonType;
  cpf: string | null;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
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

type SupplierRow = {
  id: number;
  person_id: number;
  supplier_type: SupplierType;
  active: boolean;
  notes: string | null;
  created_at: string;
  person: PersonRow | null;
};

const SUPPLIER_SELECT =
  "id, person_id, supplier_type, active, notes, created_at, person:people(id, name, type, cpf, cnpj, phone, email)";

export type SupplierRecord = {
  id: number;
  person_id: number;
  supplier_type: SupplierType;
  active: boolean;
  notes?: string;
  created_at: string;
  person: Person;
};

export type CreateSupplierInput = {
  name: string;
  type: PersonType;
  document?: string;
  phone?: string;
  email?: string;
  notes?: string;
  supplier_type?: SupplierType;
  primary_address?: Address;
};

export const supplierKeys = {
  all: ["suppliers"] as const,
  list: (page: number) => ["suppliers", "list", { page }] as const,
  detail: (id: number) => ["suppliers", id] as const,
};

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hasAddressValues(address?: Address) {
  return Boolean(
    address && Object.values(address).some((value) => typeof value === "string" && value.trim()),
  );
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

function mapPerson(row: PersonRow, address?: AddressRow): Person {
  return {
    id: row.id,
    name: row.name,
    cpf: row.cpf ?? undefined,
    cnpj: row.cnpj ?? undefined,
    phone: row.phone ?? "",
    email: row.email ?? "",
    type: row.type,
    primary_address: mapAddress(address),
  };
}

function mapSupplier(row: SupplierRow, address?: AddressRow): SupplierRecord {
  if (!row.person) {
    throw new Error("Fornecedor sem registro de pessoa.");
  }

  return {
    id: row.id,
    person_id: row.person_id,
    supplier_type: row.supplier_type,
    active: row.active,
    notes: row.notes ?? undefined,
    created_at: row.created_at,
    person: mapPerson(row.person, address),
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

async function fetchSupplierRows(options: { id?: number; activeOnly?: boolean } = {}) {
  let query = supabase
    .from("suppliers")
    .select(SUPPLIER_SELECT)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (options.id != null) {
    query = query.eq("id", options.id);
  }

  if (options.activeOnly) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as SupplierRow[];
  const addresses = await fetchAddresses(rows.map((row) => row.person_id));

  return rows.map((row) => mapSupplier(row, addresses.get(row.person_id)));
}

async function fetchSupplierPage(pageInput: number): Promise<PaginatedResult<SupplierRecord>> {
  const { page, pageSize, from, to } = getPageBounds(pageInput);
  const { data, error, count } = await supabase
    .from("suppliers")
    .select(SUPPLIER_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as SupplierRow[];
  const addresses = await fetchAddresses(rows.map((row) => row.person_id));

  return {
    data: rows.map((row) => mapSupplier(row, addresses.get(row.person_id))),
    total: count ?? 0,
    page,
    pageSize,
  };
}

async function upsertPrimaryAddress(personId: number, address: Address) {
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
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("addresses").insert(payload);
  if (error) {
    throw new Error(error.message);
  }
}

export async function listSuppliers() {
  return fetchSupplierRows();
}

export async function listSuppliersPage(page: number) {
  return fetchSupplierPage(page);
}

export async function listActiveSuppliers() {
  return fetchSupplierRows({ activeOnly: true });
}

export async function getSupplierById(id: number) {
  const [supplier] = await fetchSupplierRows({ id });
  if (!supplier) {
    throw new Error("Fornecedor não encontrado.");
  }
  return supplier;
}

export async function createSupplier(input: CreateSupplierInput, idempotencyKey: string) {
  const document = normalizeDocument(input.document ?? "", input.type) || null;
  const result = await createPersonConfiguration({
    idempotencyKey,
    person: {
      name: input.name.trim(),
      type: input.type,
      cpf: input.type === "individual" ? document : null,
      cnpj: input.type === "company" ? document : null,
      phone: normalizeText(normalizePhone(input.phone ?? "")),
      email: normalizeText(input.email),
    },
    roles: [
      {
        role: "supplier",
        supplier_type: input.supplier_type ?? (input.type === "company" ? "company" : "individual"),
        notes: normalizeText(input.notes),
      },
    ],
    primaryAddress: hasAddressValues(input.primary_address) ? input.primary_address : null,
  });
  if (!result.supplier_id) {
    throw new Error("O cadastro não retornou o identificador do fornecedor.");
  }
  return result.supplier_id;
}

export async function createSupplierFromDraft(draft: SupplierDraft, idempotencyKey: string) {
  const id = await createSupplier(
    {
      name: draft.name,
      type: draft.type,
      document: draft.document,
      phone: draft.phone,
      email: draft.email,
      notes: draft.notes,
      supplier_type: draft.supplier_type,
      primary_address: draft.primary_address,
    },
    idempotencyKey,
  );
  return getSupplierById(id);
}

export async function updateSupplier(id: number, draft: SupplierDraft) {
  const supplier = await getSupplierById(id);
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
    .eq("id", supplier.person.id);

  if (personError) {
    throw new Error(personError.message);
  }

  await upsertPrimaryAddress(supplier.person.id, draft.primary_address);

  const { error: supplierError } = await supabase
    .from("suppliers")
    .update({
      notes: normalizeText(draft.notes),
      supplier_type: draft.supplier_type,
    })
    .eq("id", id);

  if (supplierError) {
    throw new Error(supplierError.message);
  }

  return getSupplierById(id);
}

export async function setSupplierActive(id: number, active: boolean) {
  const { error } = await supabase.from("suppliers").update({ active }).eq("id", id);
  if (error) {
    throw new Error(error.message);
  }

  return getSupplierById(id);
}
