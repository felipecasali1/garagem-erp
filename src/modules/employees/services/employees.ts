import { supabase } from "@/shared/supabase/client";
import {
  getPendingStatusAttempt,
  runStatusAttempt,
  StatusCommandError,
} from "@/shared/supabase/status-attempt";
import { normalizeCpf, normalizePhone } from "@/shared/lib/field-format";
import {
  createPersonConfiguration,
  updatePersonConfiguration,
} from "@/shared/supabase/person-configuration";
import type { Address, Employee, PersonType } from "@/shared/types/domain";
import type { EmployeeAccessRole, EmployeeDraft } from "@/modules/employees/types";
import { getPageBounds, type PaginatedResult } from "@/shared/lib/pagination";

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
  updated_at: string;
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

const EMPLOYEE_SELECT =
  "id, person_id, position, salary, commission_rate, commission_type, active, updated_at, hired_at, notes, person:people(id, name, type, cpf, cnpj, phone, email, notes)";

export type EmployeeRecord = Employee & {
  updated_at: string;
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
    updated_at: row.updated_at,
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
    .select(EMPLOYEE_SELECT)
    .order("id", { ascending: true })
    .order("person_id", { ascending: true });

  if (id != null) {
    query = query.eq("id", id);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).map((row) => ({
    ...row,
    person: Array.isArray(row.person) ? (row.person[0] ?? null) : row.person,
  })) as unknown as EmployeeRow[];
  const personIds = rows.map((row) => row.person_id);
  const employeeIds = rows.map((row) => row.id);
  return mapEmployeeRows(rows, personIds, employeeIds);
}

async function mapEmployeeRows(
  rows: EmployeeRow[],
  personIds = rows.map((row) => row.person_id),
  employeeIds = rows.map((row) => row.id),
) {
  const [addresses, users] = await Promise.all([
    fetchAddresses(personIds),
    fetchUsers(employeeIds),
  ]);

  return rows.map((row) => mapEmployee(row, users.get(row.id), addresses.get(row.person_id)));
}

async function fetchEmployeePage(pageInput: number): Promise<PaginatedResult<EmployeeRecord>> {
  const { page, pageSize, from, to } = getPageBounds(pageInput);
  const { data, error, count } = await supabase
    .from("employees")
    .select(EMPLOYEE_SELECT, { count: "exact" })
    .order("id", { ascending: true })
    .order("person_id", { ascending: true })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).map((row) => ({
    ...row,
    person: Array.isArray(row.person) ? (row.person[0] ?? null) : row.person,
  })) as unknown as EmployeeRow[];

  return {
    data: await mapEmployeeRows(rows),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export const employeeKeys = {
  all: ["employees"] as const,
  list: (page: number) => ["employees", "list", { page }] as const,
  detail: (id: number) => ["employees", id] as const,
  active: ["employees", "active"] as const,
};

export async function listEmployees() {
  return fetchEmployeeRows();
}

export async function listEmployeesPage(page: number) {
  return fetchEmployeePage(page);
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

export async function createEmployee(draft: EmployeeDraft, idempotencyKey: string) {
  const result = await createPersonConfiguration({
    idempotencyKey,
    person: {
      name: draft.name.trim(),
      type: "individual",
      cpf: normalizeText(normalizeCpf(draft.cpf)),
      cnpj: null,
      phone: normalizeText(normalizePhone(draft.phone)),
      email: normalizeText(draft.email),
    },
    roles: [
      {
        role: "employee",
        position: draft.position.trim(),
        salary: draft.salary,
        commission_rate: draft.commission_rate,
        commission_type: draft.commission_type,
        active: draft.active,
        hired_at: draft.hired_at ?? new Date().toISOString().slice(0, 10),
      },
    ],
    primaryAddress: draft.primary_address,
  });
  if (!result.employee_id) {
    throw new Error("O cadastro não retornou o identificador do funcionário.");
  }
  return getEmployeeById(result.employee_id);
}

export async function updateEmployee(id: number, draft: EmployeeDraft) {
  const existing = await getEmployeeById(id);
  await updatePersonConfiguration({
    role: "employee",
    roleId: id,
    personId: existing.person.id,
    person: {
      name: draft.name.trim(),
      cpf: normalizeText(normalizeCpf(draft.cpf)),
      phone: normalizeText(normalizePhone(draft.phone)),
      email: normalizeText(draft.email),
    },
    primaryAddress: draft.primary_address,
    roleData: {
      position: draft.position.trim(),
      salary: draft.salary,
      commission_rate: draft.commission_rate,
      commission_type: draft.commission_type,
      ...(draft.hired_at ? { hired_at: draft.hired_at } : {}),
    },
  });
  return getEmployeeById(id);
}

export type EmployeeStatusAttempt = {
  p_employee_id: number;
  p_active: boolean;
  p_expected_updated_at: string;
};

export function getPendingEmployeeStatus(id: number) {
  return getPendingStatusAttempt<EmployeeStatusAttempt>(`employee-status:${id}`);
}

export async function setEmployeeActive(id: number, active: boolean, expectedUpdatedAt: string) {
  const payload: EmployeeStatusAttempt = {
    p_employee_id: id,
    p_active: active,
    p_expected_updated_at: expectedUpdatedAt,
  };
  return runStatusAttempt(`employee-status:${id}`, payload, async (key) => {
    const { data, error } = await supabase.rpc("set_employee_active_status_idempotent", {
      p_idempotency_key: key,
      ...payload,
    });
    if (error) throw new StatusCommandError(error.message, error.code);
    if (!data) throw new Error("Funcionário não encontrado.");
    return getEmployeeById(id);
  });
}
