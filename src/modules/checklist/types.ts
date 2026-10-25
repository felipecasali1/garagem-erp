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
  pending: { label: "Pendente", cls: "bg-warning/15 text-warning" },
  in_progress: { label: "Em Andamento", cls: "bg-muted text-muted-foreground" },
  waiting_parts: { label: "Aguardando Peças", cls: "bg-warning/15 text-warning" },
  completed: { label: "Concluído", cls: "bg-success/15 text-success" },
  cancelled: { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
};

export const PRIORITY_META: Record<ChecklistPriority, { label: string; cls: string; dot: string }> = {
  low: { label: "Baixa", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  medium: {
    label: "Média",
    cls: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  high: { label: "Alta", cls: "bg-warning/15 text-warning", dot: "bg-warning" },
  urgent: { label: "Urgente", cls: "bg-destructive/15 text-destructive", dot: "bg-destructive" },
};
