import type { Address, PersonType } from "@/shared/types/domain";

export type CustomerDraft = {
  type: PersonType;
  name: string;
  document: string;
  phone: string;
  email: string;
  notes: string;
  primary_address: Address;
};
