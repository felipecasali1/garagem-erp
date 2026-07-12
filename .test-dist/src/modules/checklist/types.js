export const CATEGORY_LABEL = {
    mechanical: "Mecânica",
    bodywork: "Funilaria/Pintura",
    cleaning: "Higienização",
    tires: "Pneus",
    oil_change: "Troca de óleo",
    documentation: "Documentação",
    electrical: "Elétrica",
    accessories: "Acessórios",
    marketplace: "Marketplace",
    photography: "Fotografia",
    inspection: "Vistoria",
    maintenance: "Manutenção",
    fueling: "Abastecimento",
    washing: "Lavagem",
    notes: "Anotações",
};
export const STATUS_META = {
    pending: { label: "Pendente", cls: "bg-warning/15 text-warning border-warning/30" },
    in_progress: { label: "Em Andamento", cls: "bg-info/15 text-info border-info/30" },
    waiting_parts: { label: "Aguardando Peças", cls: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
    completed: { label: "Concluído", cls: "bg-success/15 text-success border-success/30" },
    cancelled: { label: "Cancelado", cls: "bg-muted text-muted-foreground border-border" },
};
export const PRIORITY_META = {
    low: { label: "Baixa", cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
    medium: { label: "Média", cls: "bg-info/15 text-info border-info/30", dot: "bg-info" },
    high: { label: "Alta", cls: "bg-warning/15 text-warning border-warning/30", dot: "bg-warning" },
    urgent: { label: "Urgente", cls: "bg-destructive/15 text-destructive border-destructive/30", dot: "bg-destructive" },
};
