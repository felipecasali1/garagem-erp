import test from "node:test";
import assert from "node:assert/strict";
import { brl } from "../../src/shared/lib/format.js";
import { summarizeChecklist } from "../../src/modules/checklist/lib/summarize-checklist.js";
import { normalizeVehicleDraft } from "../../src/modules/vehicles/lib/normalize-vehicle-draft.js";
function criarVehicleDraft(overrides = {}) {
    return {
        plate: " qad-1f23 ",
        chassis: " 9BWZZZ377VT004251 ",
        vin: " 1HGBH41JXMN109186 ",
        brand: " Toyota ",
        model: " Corolla ",
        version: " XEi 2.0 ",
        color: " Cinza ",
        fuel_type: "flex",
        transmission: "automatic",
        current_mileage: 42000,
        manufacture_year: 2022,
        model_year: 2023,
        cost_price: 90000,
        sale_price: 119900,
        published: false,
        status: "available",
        notes: " revisar para venda ",
        accessories: ["Ar condicionado", "Multimídia"],
        checklist: [],
        ...overrides,
    };
}
function criarChecklistItem(overrides) {
    return {
        id: "item-1",
        vehicle_id: 1,
        title: "Tarefa",
        category: "mechanical",
        status: "pending",
        priority: "medium",
        estimated_cost: 0,
        actual_cost: 0,
        attachments: [],
        created_at: "2026-05-25T00:00:00.000Z",
        updated_at: "2026-05-25T00:00:00.000Z",
        ...overrides,
    };
}
test("fluxo de preparacao integra normalizacao do veiculo, checklist e margem estimada", () => {
    const draft = criarVehicleDraft();
    const veiculoNormalizado = normalizeVehicleDraft(draft);
    const checklist = [
        criarChecklistItem({
            id: "1",
            title: "Polimento",
            status: "completed",
            estimated_cost: 500,
            actual_cost: 0,
        }),
        criarChecklistItem({
            id: "2",
            title: "Fotos",
            status: "completed",
            category: "photography",
            estimated_cost: 200,
            actual_cost: 180,
        }),
    ];
    const resumo = summarizeChecklist(checklist);
    const totalInvestidoEstimado = veiculoNormalizado.cost_price + resumo.estimatedCost;
    const margem = veiculoNormalizado.sale_price - totalInvestidoEstimado;
    assert.equal(veiculoNormalizado.plate, "QAD-1F23");
    assert.equal(veiculoNormalizado.brand, "Toyota");
    assert.equal(resumo.readyForSale, true);
    assert.equal(resumo.progress, 100);
    assert.equal(resumo.estimatedCost, 700);
    assert.equal(resumo.actualCost, 680);
    assert.equal(totalInvestidoEstimado, 90700);
    assert.equal(margem, 29200);
    assert.equal(brl(margem), "R$ 29.200,00");
});
test("fluxo de preparacao mantem veiculo indisponivel para venda quando ainda existem pendencias", () => {
    const draft = criarVehicleDraft({
        sale_price: 105000,
        notes: " aguardando oficina ",
    });
    const veiculoNormalizado = normalizeVehicleDraft(draft);
    const checklist = [
        criarChecklistItem({
            id: "1",
            status: "completed",
            estimated_cost: 300,
            actual_cost: 250,
        }),
        criarChecklistItem({
            id: "2",
            status: "in_progress",
            priority: "urgent",
            estimated_cost: 1200,
            actual_cost: 400,
        }),
    ];
    const resumo = summarizeChecklist(checklist);
    const totalInvestidoEstimado = veiculoNormalizado.cost_price + resumo.estimatedCost;
    const margem = veiculoNormalizado.sale_price - totalInvestidoEstimado;
    assert.equal(veiculoNormalizado.notes, "aguardando oficina");
    assert.equal(resumo.readyForSale, false);
    assert.equal(resumo.hasUrgent, true);
    assert.equal(resumo.inProgress, 1);
    assert.equal(totalInvestidoEstimado, 91500);
    assert.equal(brl(margem), "R$ 13.500,00");
});
