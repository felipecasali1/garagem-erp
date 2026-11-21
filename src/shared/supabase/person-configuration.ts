import type { Address, PersonType } from "@/shared/types/domain";
import { supabase } from "@/shared/supabase/client";
import {
  discardStoredAttempt,
  runWithStoredAttempt,
  storedAttemptPayloads,
} from "@/shared/lib/idempotency";

export type PersonBusinessRole =
  | { role: "customer"; notes: string | null }
  | {
      role: "employee";
      position: string;
      salary: number;
      commission_rate: number;
      commission_type: "percentage" | "fixed";
      active: boolean;
      hired_at: string;
    }
  | {
      role: "supplier";
      supplier_type: "individual" | "company" | "dealership" | "auction" | "trade_in";
      notes: string | null;
    };

export type PersonConfigurationResult = {
  person_id: number;
  customer_id: number | null;
  employee_id: number | null;
  supplier_id: number | null;
};

export type PersonConfigurationInput = {
  idempotencyKey: string;
  person: {
    name: string;
    type: PersonType;
    cpf: string | null;
    cnpj: string | null;
    phone: string | null;
    email: string | null;
    notes?: string | null;
  };
  roles: PersonBusinessRole[];
  primaryAddress?: Address | null;
};

export async function createPersonConfiguration(
  input: PersonConfigurationInput,
): Promise<PersonConfigurationResult> {
  const address = input.primaryAddress;
  const { data, error } = await supabase.rpc("create_person_configuration", {
    p_idempotency_key: input.idempotencyKey,
    p_person: input.person,
    p_roles: input.roles,
    p_primary_address: address
      ? {
          street: address.street,
          number: address.number,
          complement: address.complement ?? null,
          neighborhood: address.neighborhood,
          city: address.city,
          state: address.state,
          zip_code: address.zip_code,
        }
      : null,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data || typeof data !== "object") {
    throw new Error("O cadastro da pessoa não retornou os identificadores dos papéis.");
  }

  return data as PersonConfigurationResult;
}

class DefinitivePersonEditError extends Error {}

type PersonEditInput = {
  role: "customer" | "supplier" | "employee";
  roleId: number;
  personId: number;
  person: {
    name: string;
    type?: PersonType;
    cpf: string | null;
    cnpj?: string | null;
    phone: string | null;
    email: string | null;
  };
  primaryAddress: Address;
  roleData: Record<string, string | number | null>;
};

export async function updatePersonConfiguration(input: PersonEditInput) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  const address = input.primaryAddress;
  const payload = {
    p_role: input.role,
    p_role_id: input.roleId,
    p_person: input.person,
    p_primary_address: {
      street: address.street,
      number: address.number,
      complement: address.complement ?? null,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      zip_code: address.zip_code,
    },
    p_role_data: input.roleData,
  };
  const namespace = `person-edit:${input.personId}`;
  type UpdatePayload = typeof payload;
  const execute = async (command: UpdatePayload) => {
    try {
      return await runWithStoredAttempt(
        namespace,
        userId,
        command,
        async (key) => {
          const { data: result, error: rpcError } = await supabase.rpc(
            "update_person_configuration",
            {
              p_idempotency_key: key,
              ...command,
            },
          );
          if (rpcError) {
            // Only a definite PostgreSQL failure proves that the transaction rolled back.
            if (rpcError.code && /^(22|23|40|42)/.test(rpcError.code)) {
              throw new DefinitivePersonEditError(rpcError.message);
            }
            throw new Error(rpcError.message);
          }
          return result;
        },
        {
          rememberPayload: true,
          exclusive: true,
          exclusiveMessage: "Existe uma edição anterior em andamento. Aguarde e tente novamente.",
        },
      );
    } catch (failure) {
      if (failure instanceof DefinitivePersonEditError) {
        await discardStoredAttempt(namespace, userId, command);
      }
      throw failure;
    }
  };
  const pending = storedAttemptPayloads<UpdatePayload>(namespace, userId).find(
    (command) => JSON.stringify(command) !== JSON.stringify(payload),
  );
  if (pending) await execute(pending);
  return execute(payload);
}
