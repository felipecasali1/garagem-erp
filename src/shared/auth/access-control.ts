import type { EmployeeAccessRole } from "@/modules/employees/types";

export type AccessRole = EmployeeAccessRole;

const pathRoles: Array<{ path: string; roles: AccessRole[] }> = [
  { path: "/settings", roles: ["admin"] },
  { path: "/employees", roles: ["admin"] },
  { path: "/financial", roles: ["admin", "manager", "financial"] },
  { path: "/purchases", roles: ["admin", "manager"] },
  { path: "/sales", roles: ["admin", "manager", "seller"] },
  { path: "/clients", roles: ["admin", "manager", "seller", "financial"] },
  { path: "/suppliers", roles: ["admin", "manager", "seller", "financial"] },
  { path: "/vehicles", roles: ["admin", "manager", "seller"] },
  { path: "/", roles: ["admin", "manager", "seller", "financial"] },
];

export function hasAnyRole(role: AccessRole | null, allowed: AccessRole[]) {
  return role != null && allowed.includes(role);
}

export function canAccessPath(role: AccessRole | null, pathname: string) {
  const rule = pathRoles.find(({ path }) =>
    path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`),
  );

  return rule ? hasAnyRole(role, rule.roles) : role != null;
}
