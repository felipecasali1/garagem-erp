import test from "node:test";
import assert from "node:assert/strict";
import { formatCep, formatCpf, formatCnpj, formatDocument, formatPhone, formatPlate, normalizeCep, normalizeDocument, normalizePhone, normalizePlate, normalizeUf, } from "../../src/shared/lib/field-format.js";
test("formatCpf aplica a mascara de CPF", () => {
    assert.equal(formatCpf("12345678901"), "123.456.789-01");
});
test("formatCnpj aplica a mascara de CNPJ", () => {
    assert.equal(formatCnpj("12345678000190"), "12.345.678/0001-90");
});
test("formatPhone mostra o telefone no padrao brasileiro", () => {
    assert.equal(formatPhone("11987654321"), "(11) 98765-4321");
});
test("formatCep mostra o CEP com traço", () => {
    assert.equal(formatCep("04567000"), "04567-000");
});
test("formatPlate normaliza a placa e insere o separador", () => {
    assert.equal(formatPlate("abc1d23"), "ABC-1D23");
});
test("normalizeUf reduz o valor para duas letras maiusculas", () => {
    assert.equal(normalizeUf("ms "), "MS");
});
test("normalizeDocument remove pontuacao e respeita o tipo", () => {
    assert.equal(normalizeDocument("123.456.789-01", "individual"), "12345678901");
    assert.equal(normalizeDocument("12.345.678/0001-90", "company"), "12345678000190");
});
test("normalize helpers removem caracteres extras", () => {
    assert.equal(normalizePhone("(11) 9 8765-4321"), "11987654321");
    assert.equal(normalizeCep("04567-000"), "04567000");
    assert.equal(normalizePlate("abc-1d23"), "ABC1D23");
});
test("formatDocument escolhe a mascara de acordo com o tipo", () => {
    assert.equal(formatDocument("12345678901", "individual"), "123.456.789-01");
    assert.equal(formatDocument("12345678000190", "company"), "12.345.678/0001-90");
});
