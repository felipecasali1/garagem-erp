import test from "node:test";
import assert from "node:assert/strict";
import { brl, fmtDate, fmtMonth, initials } from "../../src/shared/lib/format.js";

test("brl formata valores positivos no padrao BRL", () => {
  assert.equal(brl(1234.5), "R$ 1.234,50");
});

test("brl formata valores negativos preservando o sinal", () => {
  assert.equal(brl(-89.9), "-R$ 89,90");
});

test("fmtDate converte YYYY-MM-DD para DD/MM/YYYY", () => {
  assert.equal(fmtDate("2026-05-25"), "25/05/2026");
});

test("fmtMonth retorna o mes abreviado em portugues", () => {
  assert.equal(fmtMonth("2026-12-01"), "dez");
});

test("initials retorna no maximo as duas primeiras iniciais", () => {
  assert.equal(initials("Garagem ERP Brasil"), "GE");
});
