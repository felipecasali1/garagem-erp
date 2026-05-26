import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ACCESSORIES } from "../../src/shared/lib/accessories.js";
test("lista padrao de acessorios nao pode ser vazia", () => {
    assert.ok(DEFAULT_ACCESSORIES.length > 0);
});
test("lista padrao de acessorios nao pode conter duplicatas", () => {
    assert.equal(new Set(DEFAULT_ACCESSORIES).size, DEFAULT_ACCESSORIES.length);
});
test("lista padrao inclui acessorios comuns da revenda", () => {
    assert.ok(DEFAULT_ACCESSORIES.includes("Ar condicionado"));
    assert.ok(DEFAULT_ACCESSORIES.includes("Multimídia"));
});
