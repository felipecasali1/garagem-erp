import "@tanstack/react-start/server-only";
import { supabaseAdmin } from "@/shared/supabase/server";
import {
  provisionSystemUser,
  removeSystemUser,
  type ProvisionUserInput,
  type ProvisionOperation,
  type RemovalOperation,
} from "@/modules/users/services/user-auth-lifecycle";
import type { CreateSystemUserInput } from "@/modules/users/services/users";

const PROVISION_OPERATION_METADATA_KEY = "garagem_erp_provision_operation_id";

async function assertUserManagementAccess(accessToken: string) {
  const { data: authResult, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !authResult.user) {
    throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  }

  const { data: internalUser, error } = await supabaseAdmin
    .from("users")
    .select("active, access_role, is_admin, employee_id, employee:employees(active)")
    .eq("auth_user_id", authResult.user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const employee = Array.isArray(internalUser?.employee)
    ? internalUser.employee[0]
    : internalUser?.employee;
  if (
    !internalUser?.active ||
    (internalUser.employee_id != null && !employee?.active) ||
    (!internalUser.is_admin && internalUser.access_role !== "admin")
  ) {
    throw new Error("Seu usuário não tem permissão para administrar acessos.");
  }
}

async function beginProvision(input: Omit<ProvisionUserInput, "password" | "email">) {
  const { data, error } = await supabaseAdmin.rpc("begin_user_provisioning", {
    p_operation_id: input.operationId,
    p_employee_id: input.employeeId,
    p_access_role: input.accessRole,
    p_is_admin: input.isAdmin,
    p_active: input.active,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") {
    throw new Error("O banco não retornou o estado da operação de criação do User.");
  }

  const result = data as {
    operation_id: string;
    status: "pending" | "completed";
    auth_user_id: string | null;
    result_user_id: number | null;
    email: string;
    name: string;
  };
  return {
    id: result.operation_id,
    status: result.status,
    authUserId: result.auth_user_id,
    resultUserId: result.result_user_id,
    email: result.email,
    name: result.name,
  } satisfies ProvisionOperation;
}

async function findUserByProvisionOperation(operationId: string) {
  const pageSize = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) throw new Error(error.message);

    const user = data.users.find(
      (candidate) => candidate.app_metadata?.[PROVISION_OPERATION_METADATA_KEY] === operationId,
    );
    if (user) return { id: user.id };
    if (data.users.length < pageSize || (data.lastPage > 0 && page >= data.lastPage)) return null;
    page += 1;
  }
}

async function createAuthUser(input: {
  operationId: string;
  email: string;
  password: string;
  name?: string;
}) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
    app_metadata: {
      [PROVISION_OPERATION_METADATA_KEY]: input.operationId,
    },
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Não foi possível criar o acesso do usuário.");
  return { id: data.user.id };
}

async function recordProvisionedAuthUser(operationId: string, authUserId: string) {
  const { error } = await supabaseAdmin.rpc("record_user_auth_provisioned", {
    p_operation_id: operationId,
    p_auth_user_id: authUserId,
  });
  if (error) throw new Error(error.message);
}

async function completeProvision(operationId: string, authUserId: string) {
  const { data, error } = await supabaseAdmin.rpc("complete_user_provisioning", {
    p_operation_id: operationId,
    p_auth_user_id: authUserId,
  });
  if (error) throw new Error(error.message);
  if (data == null) throw new Error("O User interno não foi criado após a confirmação do Auth.");
  return Number(data);
}

async function beginRemoval(operationId: string, userId: number) {
  const { data, error } = await supabaseAdmin.rpc("begin_user_removal", {
    p_operation_id: operationId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") {
    throw new Error("O banco não retornou o estado da operação de remoção do User.");
  }

  const result = data as {
    operation_id: string;
    status: "pending" | "completed";
    auth_user_id: string | null;
  };
  return {
    id: result.operation_id,
    status: result.status,
    authUserId: result.auth_user_id,
  } satisfies RemovalOperation;
}

async function deleteAuthUser(authUserId: string) {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
  if (error) throw new Error(error.message);
}

async function authUserExists(authUserId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(authUserId);
  if (!error) return data.user != null;
  if (error.status === 404) return false;
  throw new Error(error.message);
}

async function completeRemoval(operationId: string) {
  const { error } = await supabaseAdmin.rpc("complete_user_removal", {
    p_operation_id: operationId,
  });
  if (error) throw new Error(error.message);
}

export async function createSystemUserForCaller(
  input: CreateSystemUserInput & { accessToken: string },
) {
  await assertUserManagementAccess(input.accessToken);
  const operations = {
    beginProvision,
    setProvisionAuthUser: recordProvisionedAuthUser,
    completeProvision,
  };
  const auth = {
    findUserByProvisionOperation: findUserByProvisionOperation,
    createUser: createAuthUser,
  };
  return provisionSystemUser(
    {
      operationId: input.operationId,
      employeeId: input.employeeId,
      email: "",
      password: input.password,
      accessRole: input.role,
      isAdmin: input.isAdmin ?? input.role === "admin",
      active: input.active ?? true,
    },
    { operations, auth },
  );
}

export async function setSystemUserActiveForCaller(input: {
  accessToken: string;
  id: number;
  active: boolean;
}) {
  await assertUserManagementAccess(input.accessToken);
  const { error } = await supabaseAdmin.rpc("set_system_user_active", {
    p_user_id: input.id,
    p_active: input.active,
  });
  if (error) throw new Error(error.message);
}

export async function deleteSystemUserForCaller(input: {
  accessToken: string;
  operationId: string;
  id: number;
}) {
  await assertUserManagementAccess(input.accessToken);
  const operations = { beginRemoval, completeRemoval };
  const auth = {
    deleteUser: deleteAuthUser,
    userExists: authUserExists,
  };
  await removeSystemUser(
    { operationId: input.operationId, userId: input.id },
    { operations, auth },
  );
}
