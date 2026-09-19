export const STATUS_PROJETO = [
  "Planejamento",
  "Em Andamento",
  "Pausado",
  "Concluído",
  "Cancelado",
] as const;
export type StatusProjeto = (typeof STATUS_PROJETO)[number];

export const STATUS_EXECUCAO: StatusProjeto[] = ["Em Andamento", "Pausado"];
export const STATUS_ATIVO: StatusProjeto[] = ["Planejamento", "Em Andamento", "Pausado"];
export const STATUS_ENCERRADO: StatusProjeto[] = ["Concluído", "Cancelado"];

export const STATUS_TAREFA = ["A Fazer", "Em Andamento", "Bloqueado", "Concluído"] as const;
export type StatusTarefa = (typeof STATUS_TAREFA)[number];

export const TAREFA_ATIVA: StatusTarefa[] = ["A Fazer", "Em Andamento", "Bloqueado"];
export const TAREFA_EM_CURSO: StatusTarefa[] = ["Em Andamento", "Bloqueado"];

export const TIPO_PROJETO = ["Run", "Change"] as const;
export type TipoProjeto = (typeof TIPO_PROJETO)[number];

export const PRIORIDADE_PROJETO = ["Alta", "Média", "Baixa"] as const;
export type PrioridadeProjeto = (typeof PRIORIDADE_PROJETO)[number];

// Campos do projeto cuja alteração dispara data_ultimo_status_report
export const CAMPOS_GATILHO_STATUS_REPORT = [
  "progresso",
  "status",
  "orcamento",
  "gasto",
  "data_fim_planejada",
] as const;

// Debounce de data_ultima_atividade: no máximo 1 escrita por hora por projeto
export const DEBOUNCE_ATIVIDADE_MS = 60 * 60 * 1000;
