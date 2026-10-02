import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PAGE_SIZE,
  getPageRange,
  getTotalPages,
  normalizePage,
} from "../../src/shared/lib/pagination.js";

test("normaliza páginas ausentes, inválidas e negativas para a primeira página", () => {
  assert.equal(normalizePage(undefined), 1);
  assert.equal(normalizePage("not-a-page"), 1);
  assert.equal(normalizePage(0), 1);
  assert.equal(normalizePage(-2), 1);
  assert.equal(normalizePage(2), 2);
  assert.equal(normalizePage("3"), 3);
});

test("calcula o total de páginas mantendo uma página para listas vazias", () => {
  assert.equal(getTotalPages(0), 1);
  assert.equal(getTotalPages(DEFAULT_PAGE_SIZE), 1);
  assert.equal(getTotalPages(DEFAULT_PAGE_SIZE + 1), 2);
  assert.equal(getTotalPages(41, 20), 3);
});

test("calcula o intervalo visível da página", () => {
  assert.deepEqual(getPageRange(1, 87), { from: 1, to: 20 });
  assert.deepEqual(getPageRange(2, 87), { from: 21, to: 40 });
  assert.deepEqual(getPageRange(5, 87), { from: 81, to: 87 });
  assert.deepEqual(getPageRange(1, 0), { from: 0, to: 0 });
});
