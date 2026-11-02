import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/shared/supabase/client";
import type { PersonType } from "@/shared/types/domain";
import type { EmployeeAccessRole } from "@/modules/employees/types";

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
  person: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    type: PersonType;
  } | null;
  employee: {
    id: number;
    position: string;
    active: boolean;
  } | null;
};

export type SystemUserRecord = {
  id: number;
  person_id: number;
  employee_id: number | null;
  auth_user_id?: string | null;
  name: string;
  email: string;
  phone: string;
  access_role: EmployeeAccessRole;
  active: boolean;
  is_admin: boolean;
  last_login_at?: string;
  invited_at?: string;
  employee_position?: string;
};

export const userKeys = {
  all: ["users"] as const,
};

export type CreateSystemUserInput = {
  operationId: string;
  password: string;
  role: EmployeeAccessRole;
  active?: boolean;
  isAdmin?: boolean;
  employeeId: number;
};

async function requireAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  return accessToken;
}

export async function listSystemUsers() {
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, person_id, employee_id, access_role, active, is_admin, auth_user_id, last_login_at, invited_at, person:people(id, name, email, phone, type), employee:employees(id, position, active)",
    )
    .order("id");

  if (error) {
    throw new Error(error.message);
  }

  const rows = data as unknown as UserRow[];

  return rows.map((row) => ({
    id: row.id,
    person_id: row.person_id,
    employee_id: row.employee_id,
    auth_user_id: row.auth_user_id ?? undefined,
    name: row.person?.name ?? "Sem nome",
    email: row.person?.email ?? "",
    phone: row.person?.phone ?? "",
    access_role: row.access_role,
    active: row.active,
    is_admin: row.is_admin,
    last_login_at: row.last_login_at ?? undefined,
    invited_at: row.invited_at ?? undefined,
    employee_position: row.employee?.position ?? undefined,
  }));
}

const createSystemUserServer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accessToken: z.string().min(1),
      operationId: z.string().uuid(),
      password: z.string().min(8),
      role: z.enum(["admin", "manager", "seller", "financial"]),
      active: z.boolean().optional(),
      isAdmin: z.boolean().optional(),
      employeeId: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }) => {
    const { createSystemUserForCaller } = await import("@/modules/users/services/users.server");
    return createSystemUserForCaller(data);
  });

const setSystemUserActiveServer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accessToken: z.string().min(1),
      id: z.number().int().positive(),
      active: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const { setSystemUserActiveForCaller } = await import("@/modules/users/services/users.server");
    return setSystemUserActiveForCaller(data);
  });

export async function createSystemUser(input: CreateSystemUserInput) {
  return createSystemUserServer({ data: { ...input, accessToken: await requireAccessToken() } });
}

export async function setSystemUserActive(id: number, active: boolean) {
  return setSystemUserActiveServer({
    data: { accessToken: await requireAccessToken(), id, active },
  });
}

const deleteSystemUserServer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accessToken: z.string().min(1),
      operationId: z.string().uuid(),
      id: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }) => {
    const { deleteSystemUserForCaller } = await import("@/modules/users/services/users.server");
    return deleteSystemUserForCaller(data);
  });

export async function deleteSystemUser(id: number) {
  return deleteSystemUserServer({
    data: {
      accessToken: await requireAccessToken(),
      operationId: crypto.randomUUID(),
      id,
    },
  });
}
