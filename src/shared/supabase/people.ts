import { supabase } from "@/shared/supabase/client";
import { normalizeDocument, normalizePhone } from "@/shared/lib/field-format";
import type { PersonType } from "@/shared/types/domain";

type PersonLookup = {
  id: number;
};

type PersonInput = {
  name: string;
  type: PersonType;
  document: string;
  phone: string;
  email: string;
};

export async function getOrCreatePersonIdByDocument(input: PersonInput) {
  const document = normalizeDocument(input.document, input.type);
  const normalizedDocument = document || null;
  const phone = normalizePhone(input.phone);
  const payload = {
    name: input.name.trim(),
    type: input.type,
    cpf: input.type === "individual" ? normalizedDocument : null,
    cnpj: input.type === "company" ? normalizedDocument : null,
    phone: phone || null,
    email: input.email.trim() || null,
  };

  const lookupField = input.type === "company" ? "cnpj" : "cpf";
  if (document) {
    const { data: existing, error: lookupError } = await supabase
      .from("people")
      .select("id")
      .eq(lookupField, document)
      .maybeSingle();

    if (lookupError) {
      throw new Error(lookupError.message);
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from("people")
        .update(payload)
        .eq("id", existing.id);
      if (updateError) {
        throw new Error(updateError.message);
      }
      return existing.id;
    }
  }

  const { data: created, error: createError } = await supabase
    .from("people")
    .insert(payload)
    .select("id")
    .single();

  if (createError) {
    throw new Error(createError.message);
  }

  return (created satisfies PersonLookup).id;
}
