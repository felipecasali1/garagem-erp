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

type EmployeeForAccessRow = {
  id: number;
  person_id: number;
  person: {
    id: number;
    name: string;
    email: string | null;
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
  password: string;
  role: EmployeeAccessRole;
  active?: boolean;
  isAdmin?: boolean;
  employeeId: number;
};

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
      password: z.string().min(8),
      role: z.enum(["admin", "manager", "seller", "financial"]),
      active: z.boolean().optional(),
      isAdmin: z.boolean().optional(),
      employeeId: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/shared/supabase/server");

    const { data: employeeData, error: employeeError } = await supabaseAdmin
      .from("employees")
      .select("id, person_id, person:people(id, name, email)")
      .eq("id", data.employeeId)
      .maybeSingle();

    if (employeeError) {
      throw new Error(employeeError.message);
    }

    const employee = employeeData as unknown as EmployeeForAccessRow | null;

    if (!employee?.person) {
      throw new Error("Funcionário não encontrado para criar acesso.");
    }

    const email = normalizeText(employee.person.email);
    if (!email) {
      throw new Error("Cadastre um e-mail no RH antes de criar o acesso desse funcionário.");
    }

    const { data: existingUser, error: existingUserError } = await supabaseAdmin
      .from("users")
      .select("id")
      .or(`person_id.eq.${employee.person_id},employee_id.eq.${data.employeeId}`)
      .maybeSingle();

    if (existingUserError) {
      throw new Error(existingUserError.message);
    }

    if (existingUser) {
      throw new Error("Esse funcionário já possui acesso ao sistema.");
    }

    const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: employee.person.name },
    });

    if (authError) {
      throw new Error(authError.message);
    }

    if (!authResult.user) {
      throw new Error("Falha ao criar o usuário de autenticação.");
    }

    const { data: userId, error: insertError } = await supabaseAdmin
      .from("users")
      .insert({
        auth_user_id: authResult.user.id,
        person_id: employee.person_id,
        employee_id: employee.id,
        access_role: data.role,
        is_admin: data.isAdmin ?? data.role === "admin",
        active: data.active ?? true,
        email_verified_at: new Date().toISOString(),
        invited_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(authResult.user.id);
      throw new Error(insertError.message);
    }

    if (!userId) {
      await supabaseAdmin.auth.admin.deleteUser(authResult.user.id);
      throw new Error("Falha ao criar usuário.");
    }

    if (data.active === false) {
      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({ active: false })
        .eq("id", userId.id);
      if (updateError) {
        throw new Error(updateError.message);
      }
    }

    return userId.id;
  });

const setSystemUserActiveServer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.number(),
      active: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/shared/supabase/server");
    const { error } = await supabaseAdmin
      .from("users")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) {
      throw new Error(error.message);
    }
  });

export async function createSystemUser(input: CreateSystemUserInput) {
  return createSystemUserServer({ data: input });
}

export async function setSystemUserActive(id: number, active: boolean) {
  return setSystemUserActiveServer({ data: { id, active } });
}

const deleteSystemUserServer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/shared/supabase/server");

    const { data: user, error: lookupError } = await supabaseAdmin
      .from("users")
      .select("id, auth_user_id")
      .eq("id", data.id)
      .maybeSingle();

    if (lookupError) {
      throw new Error(lookupError.message);
    }

    if (!user) {
      throw new Error("Usuário não encontrado.");
    }

    const { error: deleteError } = await supabaseAdmin.from("users").delete().eq("id", data.id);
    if (deleteError) {
      throw new Error(deleteError.message);
    }

    if (user.auth_user_id) {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(
        user.auth_user_id,
      );
      if (authDeleteError) {
        throw new Error(authDeleteError.message);
      }
    }
  });

export async function deleteSystemUser(id: number) {
  return deleteSystemUserServer({ data: { id } });
}
