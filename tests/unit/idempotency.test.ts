import assert from "node:assert/strict";
import test from "node:test";
import {
  discardStoredAttempts,
  getIdempotencyAttempt,
  runWithStoredAttempt,
  storedAttemptPayloads,
} from "../../src/shared/lib/idempotency.js";

test("idempotency attempt reuses its key for unchanged payloads", () => {
  const payload = { name: "Pessoa", address: { city: "Campo Grande" } };
  const first = getIdempotencyAttempt(payload, null);
  const retry = getIdempotencyAttempt(payload, first);

  assert.strictEqual(retry, first);
});

test("idempotency attempt creates a new key when payload changes", () => {
  const first = getIdempotencyAttempt({ name: "Pessoa" }, null);
  const changed = getIdempotencyAttempt({ name: "Outra pessoa" }, first);

  assert.notEqual(changed.fingerprint, first.fingerprint);
  assert.notEqual(changed.key, first.key);
});

test("an uncertain attempt reuses its key and a confirmed new action gets another", async () => {
  const values = new Map<string, string>();
  const previous = globalThis.sessionStorage;
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      get length() {
        return values.size;
      },
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  try {
    const keys: string[] = [];
    const payload = { amount: 100, description: "Teste" };
    await assert.rejects(
      runWithStoredAttempt("financial", "user", payload, async (key) => {
        keys.push(key);
        throw new Error("resposta perdida");
      }),
      /resposta perdida/,
    );
    await runWithStoredAttempt("financial", "user", payload, async (key) => {
      keys.push(key);
    });
    await runWithStoredAttempt("financial", "user", payload, async (key) => {
      keys.push(key);
    });
    assert.equal(keys[0], keys[1]);
    assert.notEqual(keys[1], keys[2]);
    await assert.rejects(
      runWithStoredAttempt(
        "financial",
        "user",
        payload,
        async () => {
          throw new Error("resposta perdida");
        },
        { exclusive: true },
      ),
      /resposta perdida/,
    );
    let executed = false;
    await assert.rejects(
      runWithStoredAttempt(
        "financial",
        "user",
        { ...payload, amount: 200 },
        async () => {
          executed = true;
        },
        { exclusive: true },
      ),
      /Há outro lançamento/,
    );
    assert.equal(executed, false);
    discardStoredAttempts("financial", "user");
    await runWithStoredAttempt(
      "financial",
      "user",
      { ...payload, amount: 200 },
      async () => {
        executed = true;
      },
      { exclusive: true },
    );
    assert.equal(executed, true);
    const checklist = { p_item_id: "42", p_changes: { status: "cancelled" } };
    await assert.rejects(
      runWithStoredAttempt(
        "checklist:42",
        "user",
        checklist,
        async () => {
          throw new Error("resposta perdida");
        },
        { rememberPayload: true },
      ),
      /resposta perdida/,
    );
    assert.deepEqual(storedAttemptPayloads("checklist:42", "user"), [checklist]);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, "sessionStorage");
    else
      Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: previous });
  }
});
