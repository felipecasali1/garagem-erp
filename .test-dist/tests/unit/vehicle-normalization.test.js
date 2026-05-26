import test from "node:test";
import assert from "node:assert/strict";
import { normalizeVehicleDraft } from "../../src/modules/vehicles/lib/normalize-vehicle-draft.js";
function makeDraft(overrides = {}) {
    return {
        plate: " abc-1d23 ",
        chassis: " 9BWZZZ377VT004251 ",
        vin: " 1HGBH41JXMN109186 ",
        brand: " Toyota ",
        model: " Corolla ",
        version: " XEi 2.0 ",
        color: " Prata ",
        fuel_type: "flex",
        transmission: "automatic",
        current_mileage: 32000,
        manufacture_year: 2022,
        model_year: 2023,
        cost_price: 92000,
        sale_price: 119900,
        published: false,
        status: "available",
        notes: " observacao interna ",
        accessories: [],
        checklist: [],
        ...overrides,
    };
}
test("normalizeVehicleDraft limpa campos textuais e coloca a placa em maiusculo", () => {
    const normalized = normalizeVehicleDraft(makeDraft());
    assert.equal(normalized.plate, "ABC-1D23");
    assert.equal(normalized.brand, "Toyota");
    assert.equal(normalized.model, "Corolla");
    assert.equal(normalized.color, "Prata");
    assert.equal(normalized.notes, "observacao interna");
});
test("normalizeVehicleDraft converte campos vazios opcionais para null", () => {
    const normalized = normalizeVehicleDraft(makeDraft({
        chassis: "   ",
        vin: "",
        version: " ",
        notes: "   ",
    }));
    assert.equal(normalized.chassis, null);
    assert.equal(normalized.vin, null);
    assert.equal(normalized.version, null);
    assert.equal(normalized.notes, null);
});
test("normalizeVehicleDraft preserva campos numericos e enums", () => {
    const normalized = normalizeVehicleDraft(makeDraft({
        current_mileage: 12345,
        manufacture_year: 2020,
        model_year: 2021,
        fuel_type: "diesel",
        transmission: "manual",
        status: "reserved",
        published: true,
    }));
    assert.equal(normalized.current_mileage, 12345);
    assert.equal(normalized.manufacture_year, 2020);
    assert.equal(normalized.model_year, 2021);
    assert.equal(normalized.fuel_type, "diesel");
    assert.equal(normalized.transmission, "manual");
    assert.equal(normalized.status, "reserved");
    assert.equal(normalized.published, true);
});
