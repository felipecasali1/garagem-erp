export function summarizeChecklist(list) {
    const active = list.filter((item) => item.status !== "cancelled");
    const completed = active.filter((item) => item.status === "completed").length;
    const pending = list.filter((item) => item.status === "pending").length;
    const inProgress = list.filter((item) => item.status === "in_progress").length;
    const waitingParts = list.filter((item) => item.status === "waiting_parts").length;
    const cancelled = list.filter((item) => item.status === "cancelled").length;
    const estimatedCost = list
        .filter((item) => item.status !== "cancelled")
        .reduce((sum, item) => sum + (item.estimated_cost || 0), 0);
    const actualCost = list.reduce((sum, item) => {
        if (item.status === "cancelled") {
            return sum;
        }
        const effectiveCost = item.actual_cost > 0
            ? item.actual_cost
            : item.status === "completed"
                ? item.estimated_cost
                : 0;
        return sum + effectiveCost;
    }, 0);
    const progress = active.length === 0 ? 0 : Math.round((completed / active.length) * 100);
    const readyForSale = active.length > 0 && completed === active.length;
    const hasUrgent = list.some((item) => item.priority === "urgent" && item.status !== "completed" && item.status !== "cancelled");
    return {
        total: list.length,
        completed,
        pending,
        inProgress,
        waitingParts,
        cancelled,
        estimatedCost,
        actualCost,
        progress,
        readyForSale,
        hasUrgent,
    };
}
