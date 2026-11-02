import type { Address, PersonType } from "@/shared/types/domain";
import { supabase } from "@/shared/supabase/client";

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
