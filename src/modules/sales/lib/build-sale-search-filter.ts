export type SaleSearchFilter =
  | { kind: "none" }
  | { kind: "customer"; ids: number[] }
  | { kind: "vehicle"; ids: number[] }
  | { kind: "or"; expression: string };

export function buildSaleSearchFilter(
  customerIds: number[],
  vehicleIds: number[],
): SaleSearchFilter {
  if (customerIds.length === 0 && vehicleIds.length === 0) {
    return { kind: "none" };
  }

  if (customerIds.length > 0 && vehicleIds.length > 0) {
    return {
      kind: "or",
      expression: `customer_id.in.(${customerIds.join(",")}),vehicle_id.in.(${vehicleIds.join(",")})`,
    };
  }

  return customerIds.length > 0
    ? { kind: "customer", ids: customerIds }
    : { kind: "vehicle", ids: vehicleIds };
}
