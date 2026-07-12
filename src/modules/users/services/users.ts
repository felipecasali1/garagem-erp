import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/shared/supabase/client";
import { normalizePhone } from "@/shared/lib/field-format";
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
  email: string;
  name: string;
  password: string;
  phone?: string;
  role: EmployeeAccessRole;
  position?: string;
  active?: boolean;
  personType?: PersonType;
  isAdmin?: boolean;
  employeeId?: number;
};

export type LinkSystemUserInput = {
  userId: number;
  employeeId: number;
  role: EmployeeAccessRole;
  active?: boolean;
  isAdmin?: boolean;
};

function normalizeText(value?: string) {
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

  return (data satisfies UserRow[]).map((row) => ({
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
      email: z.string().email(),
      name: z.string().trim().min(2),
      password: z.string().min(8),
      phone: z.string().optional(),
      role: z.enum(["admin", "manager", "seller", "financial"]),
      position: z.string().optional(),
      active: z.boolean().optional(),
      personType: z.enum(["individual", "company"]).optional(),
      isAdmin: z.boolean().optional(),
      employeeId: z.number().int().positive().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/shared/supabase/server");

    const email = data.email.trim();
    const name = data.name.trim();

    const createAuthUser = async () => {
      const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: { name },
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authResult.user) {
        throw new Error("Falha ao criar o usuário de autenticação.");
      }

      return authResult.user.id;
    };

    if (data.employeeId) {
      const { data: employee, error: employeeError } = await supabaseAdmin
        .from("employees")
        .select("id, person_id, person:people(id, name, email, phone, type)")
        .eq("id", data.employeeId)
        .maybeSingle();

      if (employeeError) {
        throw new Error(employeeError.message);
      }

      if (!employee?.person) {
        throw new Error("Funcionário não encontrado para vincular ao usuário.");
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

      const authUserId = await createAuthUser();

      const { error: personError } = await supabaseAdmin
        .from("people")
        .update({
          name,
          email,
          phone: normalizeText(normalizePhone(data.phone ?? "")),
        })
        .eq("id", employee.person_id);

      if (personError) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        throw new Error(personError.message);
      }

      const { data: userId, error: insertError } = await supabaseAdmin
        .from("users")
        .insert({
          auth_user_id: authUserId,
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
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        throw new Error(insertError.message);
      }

      return userId.id;
    }

    const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (authError) {
      throw new Error(authError.message);
    }

    if (!authResult.user) {
      throw new Error("Falha ao criar o usuário de autenticação.");
    }

    const { data: userId, error: bootstrapError } = await supabaseAdmin.rpc(
      "bootstrap_internal_user",
      {
        p_auth_email: email,
        p_name: name,
        p_position: data.position?.trim() || "Funcionário",
        p_access_role: data.role,
        p_is_admin: data.isAdmin ?? data.role === "admin",
        p_person_type: data.personType ?? "individual",
        p_phone: normalizeText(normalizePhone(data.phone ?? "")),
      },
    );

    if (bootstrapError) {
      await supabaseAdmin.auth.admin.deleteUser(authResult.user.id);
      throw new Error(bootstrapError.message);
    }

    if (!userId) {
      await supabaseAdmin.auth.admin.deleteUser(authResult.user.id);
      throw new Error("Falha ao criar usuário.");
    }

    if (data.active === false) {
      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({ active: false })
        .eq("id", userId);
      if (updateError) {
        throw new Error(updateError.message);
      }
    }

    return userId;
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

const linkSystemUserToEmployeeServer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.number().int().positive(),
      employeeId: z.number().int().positive(),
      role: z.enum(["admin", "manager", "seller", "financial"]),
      active: z.boolean().optional(),
      isAdmin: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/shared/supabase/server");

    const [{ data: user, error: userError }, { data: employee, error: employeeError }] =
      await Promise.all([
        supabaseAdmin
          .from("users")
          .select("id, person_id, employee_id, access_role, active, is_admin, auth_user_id")
          .eq("id", data.userId)
          .maybeSingle(),
        supabaseAdmin
          .from("employees")
          .select("id, person_id, person:people(id, name, email, phone, type)")
          .eq("id", data.employeeId)
          .maybeSingle(),
      ]);

    if (userError) {
      throw new Error(userError.message);
    }

    if (employeeError) {
      throw new Error(employeeError.message);
    }

    if (!user) {
      throw new Error("Usuário não encontrado.");
    }

    if (!employee?.person) {
      throw new Error("Funcionário não encontrado.");
    }

    if (user.employee_id && user.employee_id !== employee.id) {
      throw new Error("Esse usuário já está vinculado a outro funcionário.");
    }

    if (user.person_id !== employee.person_id) {
      throw new Error("O usuário e o funcionário precisam ser a mesma pessoa para vincular.");
    }

    const { data: existingLink, error: linkError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("employee_id", employee.id)
      .maybeSingle();

    if (linkError) {
      throw new Error(linkError.message);
    }

    if (existingLink && existingLink.id !== user.id) {
      throw new Error("Esse funcionário já possui outro acesso ao sistema.");
    }

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        employee_id: employee.id,
        access_role: data.role,
        is_admin: data.isAdmin ?? data.role === "admin",
        active: data.active ?? user.active,
      })
      .eq("id", user.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return user.id;
  });

export async function linkSystemUserToEmployee(input: LinkSystemUserInput) {
  return linkSystemUserToEmployeeServer({ data: input });
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
