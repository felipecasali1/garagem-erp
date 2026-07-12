import { mockPerson } from "@/shared/lib/mock-person";
import type { Customer } from "@/shared/types/domain";

export const customers: Customer[] = [
  { id: 1, person: mockPerson(10, "Mariana Costa"), total_purchases: 89000, created_at: "2024-02-10" },
  { id: 2, person: mockPerson(11, "João Pedro Silva"), total_purchases: 145000, created_at: "2023-11-04" },
  { id: 3, person: mockPerson(12, "Construtora Vega LTDA", { type: "company", cnpj: "12.345.678/0001-90" }), total_purchases: 320000, created_at: "2023-06-22" },
  { id: 4, person: mockPerson(13, "Lucas Oliveira"), total_purchases: 67500, created_at: "2024-08-15" },
  { id: 5, person: mockPerson(14, "Beatriz Ramos"), total_purchases: 42000, created_at: "2025-01-08" },
  { id: 6, person: mockPerson(15, "Rodrigo Campos"), total_purchases: 0, created_at: "2025-03-20" },
];
