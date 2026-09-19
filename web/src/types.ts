// Espelha exatamente o payload de src/domain/dashboardService.ts.
// Nenhum tipo aqui implica cálculo — só formato do que a API já entrega pronto.

export type StatusRag = "verde" | "amarelo" | "vermelho" | "cinza";
export type StatusRagOuPausado = StatusRag | "pausado";

export interface RetornoKpi {
  valor: number | null;
  status: StatusRag;
  motivo_nulo: string | null;
  n: number | null;
}

export interface DashboardPayload {
  data_referencia: string;
  data_inicio_coleta: string | null;
  linha1: {
    saude_portfolio: {
      contagem: { verde: number; amarelo: number; vermelho: number; cinza: number };
      pausados: number;
      pct_verde: number | null;
      meta_pct_verde: number;
    };
    otd: RetornoKpi & { no_prazo: number; total: number };
    cpi_portfolio: RetornoKpi & { eac_portfolio: RetornoKpi & { truncado?: boolean } };
    projetos_atrasados: RetornoKpi & { atrasados: number; total: number; slip_mediano: RetornoKpi };
  };
  linha2: {
    progresso_ponderado: RetornoKpi & {
      progresso_reportado_medio: number | null;
      divergencia_media: number | null;
      divergencia_destaque: boolean;
    };
    tarefas_bloqueadas: {
      pct: RetornoKpi & { bloqueadas: number; total: number };
      idade_media: RetornoKpi;
      tempo_resolvido_mediano: RetornoKpi;
    };
    alocacao_equipe: RetornoKpi & {
      backlog_medio_semanas: number | null;
      por_pessoa: {
        pessoaId: number;
        nome?: string;
        horas_previstas_semana: number;
        taxa_alocacao: RetornoKpi;
        semanas_backlog: number | null;
      }[];
    };
    projetos_sem_atualizacao: { itens: { id: number; nome?: string; status: string; dias_sem_report: number | null }[]; n: number };
  };
  linha3: {
    throughput_semanal: {
      semanas: { inicio: string; fim: string; quantidade: number; media_movel_4_semanas: number | null }[];
      motivo_nulo: string | null;
    };
    fluxo: {
      cycle_time: { mediana: RetornoKpi; p85: RetornoKpi };
      lead_time: { mediana: RetornoKpi; p85: RetornoKpi };
    };
    orcamento_vs_gasto: { id: number; nome: string; orcamento: number | null; gasto: number | null }[];
    distribuicao_status: { status: string; quantidade: number }[];
    desvio_custo: { projetoId: number; nome?: string; variancia: number; contribuicao: number | null }[];
    mix_portfolio: RetornoKpi & { mix_change: number | null };
  };
  tabela_projetos: {
    id: number;
    nome: string;
    area: string;
    status: string;
    progresso: number | null;
    ritmo: number | null;
    ritmo_status: StatusRag;
    ritmo_motivo_nulo: string | null;
    cpi: number | null;
    cpi_status: StatusRag;
    cpi_motivo_nulo: string | null;
    dias_atraso: number | null;
    slip_dias: number | null;
    orcamento: number | null;
    saude: StatusRagOuPausado;
    dados_estimados: boolean;
    numero_revisoes_baseline: number;
  }[];
}
