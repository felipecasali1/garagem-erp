import { customers } from "@/modules/customers/services/customers.mock";
import { employees } from "@/modules/employees/services/employees.mock";
import { vehicles } from "@/modules/vehicles/services/vehicles.mock";
import type { Sale } from "@/shared/types/domain";

export const sales: Sale[] = [
  { id: 1024, customer: customers[0], vehicle: vehicles[5], employee: employees[0], total_value: 82900, discount: 2000, status: "completed", sale_date: "2025-04-28" },
  { id: 1025, customer: customers[1], vehicle: vehicles[2], employee: employees[1], total_value: 132500, discount: 0, status: "pending", sale_date: "2025-05-02" },
  { id: 1026, customer: customers[2], vehicle: vehicles[4], employee: employees[0], total_value: 178900, discount: 5000, status: "completed", sale_date: "2025-05-05" },
  { id: 1027, customer: customers[3], vehicle: vehicles[6], employee: employees[1], total_value: 64900, discount: 1000, status: "completed", sale_date: "2025-05-06" },
  { id: 1028, customer: customers[4], vehicle: vehicles[8], employee: employees[2], total_value: 67500, discount: 0, status: "pending", sale_date: "2025-05-08" },
  { id: 1023, customer: customers[3], vehicle: vehicles[3], employee: employees[0], total_value: 96900, discount: 0, status: "canceled", sale_date: "2025-04-15" },
];
