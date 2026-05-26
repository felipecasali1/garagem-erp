import test from "node:test";
import assert from "node:assert/strict";
import { summarizeChecklist } from "../../src/modules/checklist/lib/summarize-checklist.js";
function item(overrides) {
    return {
        id: "1",
        vehicle_id: 1,
        title: "Item",
        category: "mechanical",
        status: "pending",
        priority: "medium",
        estimated_cost: 100,
        actual_cost: 0,
        attachments: [],
        created_at: "2026-05-25T00:00:00.000Z",
        updated_at: "2026-05-25T00:00:00.000Z",
        ...overrides,
    };
}
test("summarizeChecklist calcula status e custos corretamente", () => {
    const summary = summarizeChecklist([
        item({ id: "1", status: "pending", estimated_cost: 100, actual_cost: 0 }),
        item({ id: "2", status: "completed", estimated_cost: 200, actual_cost: 180 }),
        item({ id: "3", status: "waiting_parts", estimated_cost: 300, actual_cost: 50 }),
    ]);
    assert.equal(summary.total, 3);
    assert.equal(summary.pending, 1);
    assert.equal(summary.completed, 1);
    assert.equal(summary.waitingParts, 1);
    assert.equal(summary.estimatedCost, 600);
    assert.equal(summary.actualCost, 230);
    assert.equal(summary.progress, 33);
});
test("summarizeChecklist ignora itens cancelados no progresso e no custo estimado", () => {
    const summary = summarizeChecklist([
        item({ id: "1", status: "completed", estimated_cost: 100, actual_cost: 80 }),
        item({ id: "2", status: "cancelled", estimated_cost: 500, actual_cost: 25 }),
    ]);
    assert.equal(summary.cancelled, 1);
    assert.equal(summary.estimatedCost, 100);
    assert.equal(summary.progress, 100);
    assert.equal(summary.readyForSale, true);
});
test("summarizeChecklist identifica itens urgentes ainda nao concluidos", () => {
    const summary = summarizeChecklist([
        item({ id: "1", priority: "urgent", status: "in_progress" }),
    ]);
    assert.equal(summary.hasUrgent, true);
});
test("summarizeChecklist retorna progresso zero para lista vazia", () => {
    const summary = summarizeChecklist([]);
    assert.equal(summary.total, 0);
    assert.equal(summary.progress, 0);
    assert.equal(summary.readyForSale, false);
});
test("summarizeChecklist nao considera pronto para venda quando ainda ha pendencias", () => {
    const summary = summarizeChecklist([
        item({ id: "1", status: "completed" }),
        item({ id: "2", status: "pending" }),
    ]);
    assert.equal(summary.readyForSale, false);
});
