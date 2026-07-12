import { supabase } from "@/shared/supabase/client";
import { normalizeCep, normalizeCpf, normalizePhone, normalizeUf } from "@/shared/lib/field-format";
import { deletePersonIfUnused, getOrCreatePersonIdByDocument } from "@/shared/supabase/people";
import type { Address, Employee, PersonType } from "@/shared/types/domain";
import type { EmployeeAccessRole, EmployeeDraft } from "@/modules/employees/types";

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

type EmployeeRow = {
  id: number;
  person_id: number;
  position: string;
  salary: number;
  commission_rate: number;
  commission_type: Employee["commission_type"];
  active: boolean;
  hired_at: string;
  notes: string | null;
  person: PersonRow | null;
};

type UserRow = {
  id: number;
  person_id: number;
  employee_id: number | null;
  access_role: EmployeeAccessRole;
  active: boolean;
  is_admin: boolean;
  auth_user_id: string | null;
  last_login_at: string | null;
  invited_at: string | null;
};

export type EmployeeRecord = Employee & {
  access_role?: EmployeeAccessRole;
  user_id?: number;
  user_active?: boolean;
  auth_user_id?: string | null;
};

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

function mapEmployee(row: EmployeeRow, user?: UserRow, address?: AddressRow): EmployeeRecord {
  if (!row.person) {
    throw new Error("Funcionário sem registro de pessoa.");
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
    position: row.position,
    salary: Number(row.salary),
    commission_rate: Number(row.commission_rate),
    commission_type: row.commission_type,
    active: row.active,
    hired_at: row.hired_at,
    notes: row.notes ?? undefined,
    access_role: user?.access_role,
    user_id: user?.id,
    user_active: user?.active,
    auth_user_id: user?.auth_user_id ?? undefined,
  };
}

function normalizeText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function unwrapSingle<T>(
  promise: Promise<{ data: T | null; error: { message: string } | null }>,
) {
  const { data, error } = await promise;
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Registro nao encontrado.");
  }
  return data;
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

  return new Map((data satisfies AddressRow[]).map((row) => [row.person_id, row]));
}

async function fetchUsers(employeeIds: number[]) {
  if (employeeIds.length === 0) {
    return new Map<number, UserRow>();
  }

  const { data, error } = await supabase
    .from("users")
    .select(
      "id, person_id, employee_id, access_role, active, is_admin, auth_user_id, last_login_at, invited_at",
    )
    .in("employee_id", employeeIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data satisfies UserRow[]).map((row) => [row.employee_id ?? 0, row]));
}

async function fetchEmployeeRows(id?: number) {
  let query = supabase
    .from("employees")
    .select(
      "id, person_id, position, salary, commission_rate, commission_type, active, hired_at, notes, person:people(id, name, type, cpf, cnpj, phone, email, notes)",
    )
    .order("id");

  if (id != null) {
    query = query.eq("id", id);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = data satisfies EmployeeRow[];
  const personIds = rows.map((row) => row.person_id);
  const employeeIds = rows.map((row) => row.id);
  const [addresses, users] = await Promise.all([
    fetchAddresses(personIds),
    fetchUsers(employeeIds),
  ]);

  return rows.map((row) => mapEmployee(row, users.get(row.id), addresses.get(row.person_id)));
}

export const employeeKeys = {
  all: ["employees"] as const,
  detail: (id: number) => ["employees", id] as const,
  active: ["employees", "active"] as const,
};

export async function listEmployees() {
  return fetchEmployeeRows();
}

export async function listActiveEmployees() {
  return (await listEmployees()).filter((employee) => employee.active);
}

export async function getEmployeeById(id: number) {
  const [employee] = await fetchEmployeeRows(id);
  if (!employee) {
    throw new Error("Funcionário não encontrado.");
  }
  return employee;
}

async function upsertPrimaryAddress(personId: number, address: EmployeeDraft["primary_address"]) {
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

async function createPersonAndEmployee(draft: EmployeeDraft) {
  const personId = await getOrCreatePersonIdByDocument({
    name: draft.name,
    type: "individual",
    document: draft.cpf,
    phone: draft.phone,
    email: draft.email,
  });

  await upsertPrimaryAddress(personId, draft.primary_address);

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .insert({
      person_id: personId,
      position: draft.position.trim(),
      salary: draft.salary,
      commission_rate: draft.commission_rate,
      commission_type: draft.commission_type,
      active: draft.active,
      hired_at: draft.hired_at ?? new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();

  if (employeeError) {
    throw new Error(employeeError.message);
  }

  return employee.id;
}

export async function createEmployee(draft: EmployeeDraft) {
  const id = await createPersonAndEmployee(draft);
  return getEmployeeById(id);
}

export async function updateEmployee(id: number, draft: EmployeeDraft) {
  const employee = await getEmployeeById(id);

  const { error: personError } = await supabase
    .from("people")
    .update({
      name: draft.name.trim(),
      cpf: normalizeText(normalizeCpf(draft.cpf)),
      phone: normalizeText(normalizePhone(draft.phone)),
      email: normalizeText(draft.email),
    })
    .eq("id", employee.person.id);

  if (personError) {
    throw new Error(personError.message);
  }

  await upsertPrimaryAddress(employee.person.id, draft.primary_address);

  const { error: employeeError } = await supabase
    .from("employees")
    .update({
      position: draft.position.trim(),
      salary: draft.salary,
      commission_rate: draft.commission_rate,
      commission_type: draft.commission_type,
      active: draft.active,
      hired_at: draft.hired_at ?? employee.hired_at,
    })
    .eq("id", id);

  if (employeeError) {
    throw new Error(employeeError.message);
  }

  return getEmployeeById(id);
}

export async function setEmployeeActive(id: number, active: boolean) {
  const { error } = await supabase.rpc("set_employee_active_status", {
    p_employee_id: id,
    p_active: active,
  });

  if (error) {
    throw new Error(error.message);
  }

  return getEmployeeById(id);
}

export async function deleteEmployee(id: number) {
  const employee = await getEmployeeById(id);
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }

  await deletePersonIfUnused(employee.person.id);
}
