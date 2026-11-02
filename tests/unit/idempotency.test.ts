import assert from "node:assert/strict";
import test from "node:test";
import { getIdempotencyAttempt } from "../../src/shared/lib/idempotency.js";

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
