export type PersonType = "individual" | "company";
export type CommissionType = "percentage" | "fixed";
export type FuelType = "flex" | "gasoline" | "diesel" | "electric" | "hybrid";
export type Transmission = "manual" | "automatic" | "cvt" | "dual_clutch" | "automatized";
export type VehicleStatus = "available" | "reserved" | "sold" | "in_repair";
export type SaleStatus = "pending" | "completed" | "canceled";
export type TransactionType = "income" | "expense";
export type TransactionCategory =
  | "vehicle_sale"
  | "vehicle_purchase"
  | "salary"
  | "commission"
  | "fixed_cost"
  | "other";
export type TransactionStatus = "pending" | "paid" | "overdue" | "canceled";
export type CommissionStatus = "pending" | "paid";
export type PurchaseStatus = "pending" | "completed" | "canceled";

export interface Person {
  id: number;
  name: string;
  cpf?: string;
  cnpj?: string;
  phone: string;
  email: string;
  type: PersonType;
}

export interface Employee {
  id: number;
  person: Person;
  position: string;
  salary: number;
  commission_rate: number;
  commission_type: CommissionType;
  active: boolean;
  hired_at: string;
}

export interface Customer {
  id: number;
  person: Person;
  notes?: string;
  total_purchases: number;
  created_at: string;
}

export interface Vehicle {
  id: number;
  plate: string;
  brand: string;
  model: string;
  version?: string;
  color: string;
  fuel_type: FuelType;
  transmission: Transmission;
  current_mileage: number;
  manufacture_year: number;
  model_year: number;
  cost_price: number;
  sale_price: number;
  published: boolean;
  status: VehicleStatus;
  image?: string;
}

export interface Sale {
  id: number;
  customer: Customer;
  vehicle: Vehicle;
  employee: Employee;
  total_value: number;
  discount: number;
  status: SaleStatus;
  sale_date: string;
}

export interface Purchase {
  id: number;
  supplier: Person;
  vehicle: Vehicle;
  total_value: number;
  purchase_date: string;
  status: PurchaseStatus;
}

export interface FinancialTransaction {
  id: number;
  type: TransactionType;
  category: TransactionCategory;
  status: TransactionStatus;
  amount: number;
  transaction_date: string;
  due_date?: string;
  description: string;
  related?: string;
}
