import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/shared/supabase/auth";

const mock = vi.hoisted(() => ({
  callback: null as null | ((event: string, session: unknown) => void),
  signOut: vi.fn().mockResolvedValue({ error: null }),
  queries: [] as Array<{ resolve: (value: unknown) => void; header?: string }>,
}));

vi.mock("@/shared/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => new Promise(() => {}),
      onAuthStateChange: (callback: typeof mock.callback) => {
        mock.callback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signOut: mock.signOut,
    },
    from: () => ({
      select: () => ({
        eq: () => {
          const query = {
            header: undefined as string | undefined,
            setHeader(_name: string, value: string) {
              this.header = value;
              return this;
            },
            maybeSingle() {
              return new Promise((resolve) => mock.queries.push({ resolve, header: this.header }));
            },
          };
          return query;
        },
      }),
    }),
  },
}));

afterEach(() => {
  cleanup();
  mock.queries.length = 0;
  mock.signOut.mockClear();
  mock.callback = null;
});

function Status() {
  const { session } = useAuth();
  return <div>{session ? "autenticado" : "login"}</div>;
}

it("ignora uma consulta antiga vazia quando uma sessão mais recente já foi recebida", async () => {
  render(
    <AuthProvider>
      <Status />
    </AuthProvider>,
  );
  const session = (token: string) => ({ access_token: token, user: { id: "user-1" } });
  act(() => {
    mock.callback?.("TOKEN_REFRESHED", session("old"));
    mock.callback?.("SIGNED_IN", session("new"));
  });
  expect(mock.queries).toHaveLength(2);
  await act(async () => {
    mock.queries[0].resolve({ data: null, error: null });
    mock.queries[1].resolve({
      data: { active: true, employee_id: null, person: { name: "Teste" }, access_role: "admin" },
      error: null,
    });
  });
  await waitFor(() => expect(screen.getByText("autenticado")).toBeTruthy());
  expect(mock.signOut).not.toHaveBeenCalled();
  expect(mock.queries.map((query) => query.header)).toEqual(["Bearer old", "Bearer new"]);
});

it("rejeita o acesso quando a consulta atual confirma um usuário desativado", async () => {
  render(
    <AuthProvider>
      <Status />
    </AuthProvider>,
  );
  act(() => mock.callback?.("SIGNED_IN", { access_token: "new", user: { id: "user-1" } }));
  await act(async () => {
    mock.queries[0].resolve({ data: { active: false }, error: null });
  });
  expect(screen.getByText("login")).toBeTruthy();
  expect(mock.signOut).toHaveBeenCalledOnce();
});

it("não restaura uma sessão após o usuário sair enquanto a consulta está pendente", async () => {
  render(
    <AuthProvider>
      <Status />
    </AuthProvider>,
  );
  act(() => {
    mock.callback?.("SIGNED_IN", { access_token: "new", user: { id: "user-1" } });
    mock.callback?.("SIGNED_OUT", null);
  });
  await act(async () => {
    mock.queries[0].resolve({
      data: { active: true, employee_id: null, person: { name: "Teste" } },
      error: null,
    });
  });
  expect(screen.getByText("login")).toBeTruthy();
});
