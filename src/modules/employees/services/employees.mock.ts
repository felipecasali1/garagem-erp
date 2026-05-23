import { mockPerson } from "@/shared/lib/mock-person";
import type { Employee } from "@/shared/types/domain";

export const employees: Employee[] = [
  {
    id: 1,
    person: mockPerson(1, "Rafael Mendes"),
    position: "Vendedor Senior",
    salary: 4500,
    commission_rate: 3,
    commission_type: "percentage",
    active: true,
    hired_at: "2022-03-12",
  },
  {
    id: 2,
    person: mockPerson(2, "Juliana Souza"),
    position: "Vendedora",
    salary: 3500,
    commission_rate: 2.5,
    commission_type: "percentage",
    active: true,
    hired_at: "2023-08-01",
  },
  {
    id: 3,
    person: mockPerson(3, "Carlos Lima"),
    position: "Gerente",
    salary: 7800,
    commission_rate: 1500,
    commission_type: "fixed",
    active: true,
    hired_at: "2020-01-15",
  },
  {
    id: 4,
    person: mockPerson(4, "Patrícia Alves"),
    position: "Financeiro",
    salary: 4200,
    commission_rate: 0,
    commission_type: "fixed",
    active: false,
    hired_at: "2021-05-20",
  },
];
