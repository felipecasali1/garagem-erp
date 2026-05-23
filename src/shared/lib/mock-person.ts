import type { Person } from "@/shared/types/domain";

export const mockPerson = (id: number, name: string, opts: Partial<Person> = {}): Person => ({
  id,
  name,
  phone: `(11) 9${String(1000 + id).padStart(4, "0")}-${String(2000 + id).padStart(4, "0")}`,
  email: `${name.toLowerCase().replace(/\s+/g, ".")}@email.com`,
  type: "individual",
  cpf: `${String(100 + id)}.${String(200 + id)}.${String(300 + id)}-0${id % 10}`,
  ...opts,
});
