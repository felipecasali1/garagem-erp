import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { updatePersonConfiguration } from "@/shared/supabase/person-configuration";
import { supabase } from "@/shared/supabase/client";

vi.mock("@/shared/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "user-1" } } },
        error: null,
      })),
    },
    rpc: vi.fn(),
  },
}));

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("resolve a edição anterior sem confirmação antes de enviar a nova edição", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const first = {
    role: "customer" as const,
    roleId: 1,
    personId: 10,
    person: { name: "Primeiro nome", cpf: null, phone: null, email: null },
    primaryAddress: {
      street: "Rua",
      number: "1",
      neighborhood: "Centro",
      city: "Campo Grande",
      state: "MS",
      zip_code: "79000000",
    },
    roleData: { notes: "primeira" },
  };
  const rpc = vi.mocked(supabase.rpc);
  rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "conexão interrompida", code: "" },
  } as never);
  await expect(updatePersonConfiguration(first)).rejects.toThrow("conexão interrompida");
  const original = rpc.mock.calls[0][1];
  rpc.mockResolvedValue({ data: { role_id: 1 }, error: null } as never);
  await updatePersonConfiguration({
    ...first,
    role: "supplier",
    roleId: 2,
    person: { ...first.person, name: "Nome novo" },
  });
  expect(rpc).toHaveBeenCalledTimes(3);
  expect(rpc.mock.calls[1][1]).toEqual(original);
  expect(rpc.mock.calls[2][1]).toMatchObject({
    p_role: "supplier",
    p_role_id: 2,
    p_person: { name: "Nome novo" },
  });
});
