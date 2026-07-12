export type ChecklistStatus =
  | "pending"
  | "in_progress"
  | "waiting_parts"
  | "completed"
  | "cancelled";

export type ChecklistPriority = "low" | "medium" | "high" | "urgent";

export type ChecklistCategory =
  | "mechanical"
  | "bodywork"
  | "cleaning"
  | "tires"
  | "oil_change"
  | "documentation"
  | "electrical"
  | "accessories"
  | "marketplace"
  | "photography"
  | "inspection"
  | "maintenance"
  | "fueling"
  | "washing"
  | "notes";

export interface ChecklistItem {
  id: string;
  vehicle_id: number;
  title: string;
  description?: string;
  category: ChecklistCategory;
  status: ChecklistStatus;
  priority: ChecklistPriority;
  estimated_cost: number;
  actual_cost: number;
  due_date?: string;
  completion_date?: string;
  responsible_employee_id?: number;
  notes?: string;
  attachments?: string[];
  created_at: string;
  updated_at: string;
}

export interface ChecklistSummary {
  total: number;
  completed: number;
  pending: number;
  inProgress: number;
  waitingParts: number;
  cancelled: number;
  estimatedCost: number;
  actualCost: number;
  progress: number;
  readyForSale: boolean;
  hasUrgent: boolean;
}

export const CATEGORY_LABEL: Record<ChecklistCategory, string> = {
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

export const STATUS_META: Record<ChecklistStatus, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-warning/15 text-warning border-warning/30" },
  in_progress: { label: "Em Andamento", cls: "bg-info/15 text-info border-info/30" },
  waiting_parts: { label: "Aguardando Peças", cls: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
  completed: { label: "Concluído", cls: "bg-success/15 text-success border-success/30" },
  cancelled: { label: "Cancelado", cls: "bg-muted text-muted-foreground border-border" },
};

export const PRIORITY_META: Record<ChecklistPriority, { label: string; cls: string; dot: string }> = {
  low: { label: "Baixa", cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
  medium: { label: "Média", cls: "bg-info/15 text-info border-info/30", dot: "bg-info" },
  high: { label: "Alta", cls: "bg-warning/15 text-warning border-warning/30", dot: "bg-warning" },
  urgent: { label: "Urgente", cls: "bg-destructive/15 text-destructive border-destructive/30", dot: "bg-destructive" },
};
