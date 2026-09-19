/**
 * ÚNICO módulo de cálculo de KPIs do app (entrega 3).
 *
 * REGRA RÍGIDA: nenhum outro componente do app pode conter cálculo de KPI
 * inline. Tudo importa daqui. Se o mesmo número aparece em dois lugares,
 * ele vem da mesma função deste arquivo.
 *
 * Todas as funções são puras: recebem dados já carregados como parâmetro
 * (nunca tocam o Prisma/banco) e nunca chamam Date.now() internamente —
 * "hoje" é sempre passado explicitamente pelo chamador (normalizado com
 * hojeBahia() de src/domain/datetime.ts). Isso torna cada função 100%
 * determinística e testável com objetos literais.
 *
 * Convenções (seção 2 do spec):
 * - progresso é normalizado entre 0 e 1.
 * - Fuso America/Bahia; diferenças de data em dias corridos.
 * - Divisão com denominador zero, negativo ou nulo -> null.
 * - Dado de entrada ausente -> null. NUNCA 0 para representar ausência.
 * - KPI amostral com n abaixo do mínimo -> null + motivo.
 */

import { diffDiasCorridos } from "./domain/datetime";
import { StatusProjeto, StatusTarefa, STATUS_ATIVO } from "./domain/constants";

// ========================================================================
// THRESHOLDS — valores PROVISÓRIOS. Serão recalibrados após 8 semanas de
// operação com dado real. Não espalhar números mágicos pelo app: tudo que
// for limite/corte de KPI mora aqui, e só aqui.
// ========================================================================
export const THRESHOLDS = {
  // Índice de Ritmo (progresso / prazo decorrido). "amarelo" e "verde" =
  // faixas de cor do indicador; "severo" = corte que dispara vermelho
  // IMEDIATO na saúde RAG (sinal V1), pulando a histerese.
  ritmo: { verde: 0.95, amarelo: 0.85, severo: 0.6 },

  // CPI = EV / AC. Mesma lógica de faixas do ritmo; "severo" dispara V2.
  cpi: { verde: 1.0, amarelo: 0.9, severo: 0.7 },

  // On-Time Delivery. n_minimo = tamanho de amostra abaixo do qual o
  // indicador não é exibido (mas a contagem bruta continua disponível).
  otd: { verde: 0.85, amarelo: 0.75, n_minimo: 5 },

  // % de projetos ativos (exceto Pausado) com dias_atraso > 0. Métrica
  // "menor é melhor".
  atrasados: { verde: 0.15, amarelo: 0.25 },

  // % de tarefas ativas bloqueadas. "menor é melhor"; só há corte verde e
  // vermelho definidos — a faixa amarela é o intervalo entre os dois.
  bloqueio_pct: { verde: 0.05, vermelho: 0.1 },

  // Idade média (dias) das tarefas bloqueadas / duração mediana de
  // bloqueios resolvidos. "menor é melhor", mesma lógica de banda.
  bloqueio_dias: { verde: 3, vermelho: 7 },

  // Taxa de alocação semanal por pessoa. Banda "verde" tem piso e teto
  // (sobrealocado é tão ruim quanto ocioso); min_aceitavel é o piso abaixo
  // do qual já é vermelho por subutilização.
  alocacao: { min_verde: 0.7, max_verde: 0.85, max_amarelo: 0.9, min_aceitavel: 0.5 },

  // Tarefa "Em Andamento" com data_inicio mais antiga que isso = WIP envelhecido.
  wip_dias: 14,

  // Projeto ativo sem status report há mais que isso = sinal de alerta.
  sem_report_dias: 7,

  // Amostra mínima para expor mediana / p85 de cycle time e lead time.
  lead_time: { n_min_mediana: 8, n_min_p85: 12 },

  // Índice de Ritmo é suprimido (null) nos primeiros dias/percentual de
  // prazo de um projeto: a curva real de avanço é em S, não linear: um
  // indicador linear nos primeiros 20% do prazo gera falso positivo
  // sistemático (projeto "atrasado" que na verdade só está no início).
  ritmo_maturidade: { pct_prazo_minimo: 0.2, dias_minimos: 15 },

  // EAC não é calculado com progresso muito baixo (ruído estatístico), e
  // é truncado num teto múltiplo do orçamento para não estourar a UI com
  // números absurdos quando o projeto está no início e já estourou custo.
  eac_min_progresso: 0.15,
  eac_teto_multiplo: 3,
} as const;

// ========================================================================
// TIPOS
// ========================================================================

export type StatusRag = "verde" | "amarelo" | "vermelho" | "cinza";

/** Formato de retorno padrão de todo KPI (seção 2 do spec). */
export interface RetornoKpi {
  valor: number | null;
  status: StatusRag;
  motivo_nulo: string | null;
  n: number | null;
}

/**
 * Formato "enxuto" de projeto que as funções deste módulo esperam.
 * Estruturalmente compatível com uma linha do Prisma (`prisma.projeto...`),
 * então o chamador normalmente pode passar o registro direto, sem adaptar.
 */
export interface ProjetoParaKpi {
  id: number;
  nome?: string;
  status: string;
  tipo?: string;
  progresso: number | null;
  orcamento: number | null;
  gasto: number | null;
  data_inicio: Date | null;
  data_fim_planejada: Date | null;
  data_fim_baseline: Date | null;
  data_fim_baseline_original: Date | null;
  data_fim_real: Date | null;
  data_pausa: Date | null;
  dias_pausado_acumulado: number;
  numero_revisoes_baseline: number;
  data_ultimo_status_report: Date | null;
}

export interface TarefaParaKpi {
  id: number;
  projetoId: number;
  status: string;
  data_criacao: Date | null;
  data_inicio: Date | null;
  data_conclusao: Date | null;
  data_bloqueio: Date | null;
  data_fim_planejada: Date | null;
  estimativa_horas: number | null;
}

export interface PessoaParaKpi {
  id: number;
  nome?: string;
  capacidade_horas_semana: number;
  ativo: boolean;
}

export interface TarefaEventoParaKpi {
  tarefaId: number;
  de_status: string | null;
  para_status: string;
  timestamp: Date;
}

// ========================================================================
// HELPERS INTERNOS (não exportados — não são KPIs, são utilidades de cálculo)
// ========================================================================

function base(valor: number | null, status: StatusRag, motivo_nulo: string | null, n: number | null): RetornoKpi {
  return { valor, status, motivo_nulo, n };
}

/** Denominador zero, negativo ou nulo -> null. Numerador nulo -> null. */
function divisaoSegura(numerador: number | null | undefined, denominador: number | null | undefined): number | null {
  if (numerador === null || numerador === undefined) return null;
  if (denominador === null || denominador === undefined) return null;
  if (!(denominador > 0)) return null;
  return numerador / denominador;
}

/** "Maior é melhor" (ex.: ritmo, cpi, otd): valor >= verde -> verde; >= amarelo -> amarelo; senão vermelho. */
function classificarMaiorMelhor(valor: number, verde: number, amarelo: number): StatusRag {
  if (valor >= verde) return "verde";
  if (valor >= amarelo) return "amarelo";
  return "vermelho";
}

/** "Menor é melhor" com dois limiares completos (ex.: % atrasados). */
function classificarMenorMelhor(valor: number, verde: number, amarelo: number): StatusRag {
  if (valor <= verde) return "verde";
  if (valor <= amarelo) return "amarelo";
  return "vermelho";
}

/** "Menor é melhor" com só limiar verde e vermelho (amarelo = faixa entre os dois). */
function classificarMenorMelhorBanda(valor: number, verde: number, vermelho: number): StatusRag {
  if (valor <= verde) return "verde";
  if (valor >= vermelho) return "vermelho";
  return "amarelo";
}

function classificarAlocacao(valor: number): StatusRag {
  const t = THRESHOLDS.alocacao;
  if (valor >= t.min_verde && valor <= t.max_verde) return "verde";
  if ((valor > t.max_verde && valor <= t.max_amarelo) || (valor >= t.min_aceitavel && valor < t.min_verde)) return "amarelo";
  return "vermelho";
}

/** Percentil por nearest-rank (seção 5.12). p em [0,100]. Assume array não vazio. */
function percentilNearestRank(valoresOrdenados: number[], p: number): number {
  const n = valoresOrdenados.length;
  const rank = Math.ceil((p / 100) * n);
  const indice = Math.max(1, Math.min(n, rank)) - 1;
  return valoresOrdenados[indice];
}

/** Mediana via nearest-rank (p50) — usada em todo o módulo para consistência com o p85 de fluxo. */
function mediana(valores: number[]): number {
  const ordenado = [...valores].sort((a, b) => a - b);
  return percentilNearestRank(ordenado, 50);
}

// ========================================================================
// 4. KPIs POR PROJETO
// ========================================================================

export interface PctPrazoDecorridoResultado extends RetornoKpi {
  dias_totais: number | null;
  dias_corridos: number | null;
}

/** 4.1 — Prazo decorrido, descontando pausas. */
export function pctPrazoDecorrido(
  projeto: Pick<ProjetoParaKpi, "data_inicio" | "data_fim_planejada" | "status" | "data_pausa" | "dias_pausado_acumulado">,
  hoje: Date
): PctPrazoDecorridoResultado {
  const { data_inicio, data_fim_planejada, status, data_pausa, dias_pausado_acumulado } = projeto;

  if (!data_inicio || !data_fim_planejada) {
    return { ...base(null, "cinza", "dado ausente", null), dias_totais: null, dias_corridos: null };
  }

  const dias_totais = diffDiasCorridos(data_fim_planejada, data_inicio);
  if (dias_totais <= 0) {
    return { ...base(null, "cinza", "prazo inválido", null), dias_totais, dias_corridos: null };
  }

  let dias_corridos = diffDiasCorridos(hoje, data_inicio) - (dias_pausado_acumulado ?? 0);
  if (status === "Pausado" && data_pausa) {
    dias_corridos -= diffDiasCorridos(hoje, data_pausa);
  }

  const valor = dias_corridos / dias_totais;
  return { ...base(valor, "cinza", null, null), dias_totais, dias_corridos };
}

export interface IndiceRitmoResultado extends RetornoKpi {
  pct_prazo_decorrido: number | null;
}

/**
 * 4.2 — Índice de Ritmo. NUNCA rotular como "SPI" em nenhuma tela.
 * Rótulo correto: "Índice de Ritmo". Tooltip: "progresso realizado
 * dividido pelo prazo decorrido; assume avanço linear".
 */
export function indiceRitmo(
  projeto: Pick<
    ProjetoParaKpi,
    "data_inicio" | "data_fim_planejada" | "status" | "data_pausa" | "dias_pausado_acumulado" | "progresso"
  >,
  hoje: Date
): IndiceRitmoResultado {
  const prazo = pctPrazoDecorrido(projeto, hoje);

  if (prazo.valor === null) {
    return { ...base(null, "cinza", prazo.motivo_nulo, null), pct_prazo_decorrido: null };
  }

  if (projeto.progresso === null || projeto.progresso === undefined) {
    return { ...base(null, "cinza", "dado ausente", null), pct_prazo_decorrido: prazo.valor };
  }

  // Maturidade: nos primeiros 20% do prazo (ou 15 dias) a curva real de
  // avanço é em S, não linear — suprime o indicador para não gerar falso
  // positivo sistemático.
  const maturo =
    prazo.valor >= THRESHOLDS.ritmo_maturidade.pct_prazo_minimo &&
    (prazo.dias_corridos ?? 0) >= THRESHOLDS.ritmo_maturidade.dias_minimos;
  if (!maturo) {
    return { ...base(null, "cinza", "aguardando maturidade", null), pct_prazo_decorrido: prazo.valor };
  }

  const valor = divisaoSegura(projeto.progresso, prazo.valor);
  if (valor === null) {
    return { ...base(null, "cinza", "prazo decorrido inválido", null), pct_prazo_decorrido: prazo.valor };
  }

  const status = classificarMaiorMelhor(valor, THRESHOLDS.ritmo.verde, THRESHOLDS.ritmo.amarelo);
  return { ...base(valor, status, null, null), pct_prazo_decorrido: prazo.valor };
}

/** 4.3 — CPI = (progresso * orçamento) / gasto. */
export function cpi(projeto: Pick<ProjetoParaKpi, "progresso" | "orcamento" | "gasto">): RetornoKpi {
  if (projeto.progresso === null || projeto.progresso === undefined) {
    return base(null, "cinza", "dado ausente", null);
  }
  if (projeto.orcamento === null || projeto.orcamento === undefined || !(projeto.orcamento > 0)) {
    return base(null, "cinza", "orçamento zero", null);
  }
  if (projeto.gasto === null || projeto.gasto === undefined || !(projeto.gasto > 0)) {
    return base(null, "cinza", "gasto zero", null);
  }
  const valor = (projeto.progresso * projeto.orcamento) / projeto.gasto;
  const status = classificarMaiorMelhor(valor, THRESHOLDS.cpi.verde, THRESHOLDS.cpi.amarelo);
  return base(valor, status, null, null);
}

export interface EacResultado extends RetornoKpi {
  truncado: boolean;
}

/** 4.4 — EAC = orçamento / CPI, com piso de progresso e teto de truncamento. */
export function eac(projeto: Pick<ProjetoParaKpi, "progresso" | "orcamento" | "gasto">): EacResultado {
  if (projeto.progresso === null || projeto.progresso === undefined) {
    return { ...base(null, "cinza", "dado ausente", null), truncado: false };
  }
  if (projeto.progresso < THRESHOLDS.eac_min_progresso) {
    return { ...base(null, "cinza", "progresso insuficiente", null), truncado: false };
  }

  const cpiResultado = cpi(projeto);
  if (cpiResultado.valor === null) {
    return { ...base(null, "cinza", cpiResultado.motivo_nulo, null), truncado: false };
  }

  const orcamento = projeto.orcamento as number; // cpi() já garantiu > 0
  let valor = orcamento / cpiResultado.valor;
  let truncado = false;
  const teto = orcamento * THRESHOLDS.eac_teto_multiplo;
  if (valor > teto) {
    valor = teto;
    truncado = true;
  }

  return { ...base(valor, cpiResultado.status, null, null), truncado };
}

/** 4.5 — Desvio orçamentário: (gasto - orçamento) / orçamento. Sem THRESHOLDS específico -> status informativo. */
export function desvioOrcamentario(projeto: Pick<ProjetoParaKpi, "orcamento" | "gasto">): RetornoKpi {
  if (projeto.orcamento === null || projeto.orcamento === undefined || !(projeto.orcamento > 0)) {
    return base(null, "cinza", "orçamento zero", null);
  }
  if (projeto.gasto === null || projeto.gasto === undefined) {
    return base(null, "cinza", "dado ausente", null);
  }
  const valor = (projeto.gasto - projeto.orcamento) / projeto.orcamento;
  return base(valor, "cinza", null, null);
}

export interface AtrasoResultado {
  dias_atraso: number | null;
  slip_dias: number | null;
  valor: number | null;
  status: StatusRag;
  motivo_nulo: string | null;
  n: null;
}

/**
 * 4.6 — Atraso. Projetos ativos: dias_atraso (hoje - data_fim_planejada,
 * nunca negativo). "Concluído": slip_dias (data_fim_real - data_fim_baseline
 * — a baseline VIGENTE, não a original; sinal preservado). "Cancelado":
 * ambos null.
 */
export function atraso(
  projeto: Pick<ProjetoParaKpi, "status" | "data_fim_planejada" | "data_fim_real" | "data_fim_baseline">,
  hoje: Date
): AtrasoResultado {
  if (projeto.status === "Cancelado") {
    return { dias_atraso: null, slip_dias: null, valor: null, status: "cinza", motivo_nulo: "não aplicável a projeto cancelado", n: null };
  }

  if (STATUS_ATIVO.includes(projeto.status as StatusProjeto)) {
    if (!projeto.data_fim_planejada) {
      return { dias_atraso: null, slip_dias: null, valor: null, status: "cinza", motivo_nulo: "dado ausente", n: null };
    }
    const dias_atraso = Math.max(0, diffDiasCorridos(hoje, projeto.data_fim_planejada));
    return {
      dias_atraso,
      slip_dias: null,
      valor: dias_atraso,
      status: dias_atraso > 0 ? "vermelho" : "verde",
      motivo_nulo: null,
      n: null,
    };
  }

  if (projeto.status === "Concluído") {
    if (!projeto.data_fim_real || !projeto.data_fim_baseline) {
      return { dias_atraso: null, slip_dias: null, valor: null, status: "cinza", motivo_nulo: "dado ausente", n: null };
    }
    const slip_dias = diffDiasCorridos(projeto.data_fim_real, projeto.data_fim_baseline);
    return {
      dias_atraso: null,
      slip_dias,
      valor: slip_dias,
      status: slip_dias <= 0 ? "verde" : "vermelho",
      motivo_nulo: null,
      n: null,
    };
  }

  return { dias_atraso: null, slip_dias: null, valor: null, status: "cinza", motivo_nulo: "status desconhecido", n: null };
}

/** 4.7 — Dias sem status report. SEMPRE data_ultimo_status_report, NUNCA data_ultima_atividade. */
export function diasSemReport(projeto: Pick<ProjetoParaKpi, "data_ultimo_status_report">, hoje: Date): RetornoKpi {
  if (!projeto.data_ultimo_status_report) {
    return base(null, "cinza", "dado ausente", null);
  }
  const dias = diffDiasCorridos(hoje, projeto.data_ultimo_status_report);
  const status: StatusRag = dias > THRESHOLDS.sem_report_dias ? "amarelo" : "verde";
  return base(dias, status, null, null);
}

export interface ProgressoObjetivoResultado extends RetornoKpi {
  divergencia_progresso: number | null;
}

/** 4.8 — Progresso objetivo (indicador de CONFIABILIDADE do dado, não de desempenho). */
export function progressoObjetivo(
  progressoInformado: number | null,
  tarefas: Pick<TarefaParaKpi, "status" | "estimativa_horas">[]
): ProgressoObjetivoResultado {
  const comEstimativa = tarefas.filter((t) => t.estimativa_horas !== null && t.estimativa_horas !== undefined);
  const totalHoras = comEstimativa.reduce((soma, t) => soma + (t.estimativa_horas as number), 0);

  if (comEstimativa.length === 0 || !(totalHoras > 0)) {
    return { ...base(null, "cinza", "sem estimativa de horas nas tarefas", null), divergencia_progresso: null };
  }

  const horasConcluidas = comEstimativa
    .filter((t) => t.status === "Concluído")
    .reduce((soma, t) => soma + (t.estimativa_horas as number), 0);

  const valor = horasConcluidas / totalHoras;
  const divergencia_progresso =
    progressoInformado === null || progressoInformado === undefined ? null : progressoInformado - valor;

  return { ...base(valor, "cinza", null, comEstimativa.length), divergencia_progresso };
}

export interface SaudeRagResultado {
  status: StatusRag | "pausado" | null; // null = excluído (Cancelado)
  excluido: boolean;
  sinais: { S1: boolean; S2: boolean; S3: boolean; V1: boolean; V2: boolean } | null;
  indice_ritmo: IndiceRitmoResultado | null;
  cpi: RetornoKpi | null;
  dias_sem_report: RetornoKpi | null;
}

/**
 * 4.9 — Saúde RAG.
 *
 * S1/S2/S3 são sinais "leves" (avaliados só quando o valor correspondente
 * não é null); V1/V2 são sinais SEVEROS que disparam vermelho sozinhos,
 * sem precisar de um segundo sinal — e são o gatilho para pular a
 * histerese (seção 4.10).
 *
 * "Motivo do 2 de 3": com 3 condições em OR simples, a taxa composta de
 * falso positivo torna o painel majoritariamente vermelho. Exigir 2 dos 3
 * sinais leves (ou 1 severo) mantém o vermelho como exceção, não regra.
 */
export function saudeRag(
  projeto: ProjetoParaKpi,
  tarefasDoProjeto: Pick<TarefaParaKpi, "status" | "data_bloqueio">[],
  hoje: Date
): SaudeRagResultado {
  if (projeto.status === "Cancelado") {
    return { status: null, excluido: true, sinais: null, indice_ritmo: null, cpi: null, dias_sem_report: null };
  }

  const ritmo = indiceRitmo(projeto, hoje);
  const cpiResultado = cpi(projeto);
  const reportResultado = diasSemReport(projeto, hoje);

  if (projeto.status === "Pausado") {
    // Sem cor — mas os números ficam disponíveis para quem quiser inspecionar.
    return { status: "pausado", excluido: false, sinais: null, indice_ritmo: ritmo, cpi: cpiResultado, dias_sem_report: reportResultado };
  }

  // S1 usa o limiar VERDE (não o amarelo): qualquer ritmo abaixo da faixa
  // verde já conta como sinal de atenção — a própria zona amarela do
  // indicador já é o sinal. Decisão confirmada com o usuário em 2026-09-19
  // (o enunciado original tinha "< THRESHOLDS.ritmo.amarelo" na regra, mas
  // os casos de teste 6/7 só fecham com o corte em .verde).
  const S1 = ritmo.valor !== null && ritmo.valor < THRESHOLDS.ritmo.verde;
  const S2 = cpiResultado.valor !== null && cpiResultado.valor < THRESHOLDS.cpi.amarelo;
  const S3 = tarefasDoProjeto.some(
    (t) => t.status === "Bloqueado" && t.data_bloqueio && diffDiasCorridos(hoje, t.data_bloqueio) > THRESHOLDS.bloqueio_dias.vermelho
  );

  const V1 = ritmo.valor !== null && ritmo.valor < THRESHOLDS.ritmo.severo;
  const V2 = cpiResultado.valor !== null && cpiResultado.valor < THRESHOLDS.cpi.severo;

  const sinaisLeves = [S1, S2, S3].filter(Boolean).length;
  const reportAtivo = reportResultado.valor !== null && reportResultado.valor > THRESHOLDS.sem_report_dias;

  let status: StatusRag;
  if (V1 || V2 || sinaisLeves >= 2) {
    status = "vermelho";
  } else if (sinaisLeves === 1 || reportAtivo) {
    status = "amarelo";
  } else if (ritmo.valor !== null || cpiResultado.valor !== null) {
    status = "verde";
  } else {
    status = "cinza";
  }

  return {
    status,
    excluido: false,
    sinais: { S1, S2, S3, V1, V2 },
    indice_ritmo: ritmo,
    cpi: cpiResultado,
    dias_sem_report: reportResultado,
  };
}

/**
 * 4.10 — Histerese de cor exibida. A cor só muda quando a nova cor
 * calculada se repetir em 2 leituras diárias consecutivas, EXCETO
 * transição para vermelho por sinal severo (V1/V2), que é imediata.
 *
 * Pura por construção: todo o "histórico" que ela precisa (a leitura de
 * ontem e a cor hoje exibida) é passado pelo chamador, vindo do
 * KpiSnapshot (seção 6) — esta função não lê nada sozinha.
 */
export function proximaSaudeExibida(params: {
  saude_calculada_hoje: StatusRag | "pausado" | null;
  saude_calculada_ontem: StatusRag | "pausado" | null;
  saude_exibida_atual: StatusRag | "pausado" | null;
  sinal_severo_hoje: boolean;
}): StatusRag | "pausado" | null {
  const { saude_calculada_hoje, saude_calculada_ontem, saude_exibida_atual, sinal_severo_hoje } = params;

  if (saude_calculada_hoje === null) return null; // excluído (Cancelado)
  if (saude_exibida_atual === null) return saude_calculada_hoje; // primeira leitura, nada para comparar
  if (saude_calculada_hoje === saude_exibida_atual) return saude_exibida_atual;
  if (saude_calculada_hoje === "vermelho" && sinal_severo_hoje) return "vermelho"; // transição imediata
  if (saude_calculada_hoje === saude_calculada_ontem) return saude_calculada_hoje; // 2 leituras consecutivas iguais
  return saude_exibida_atual; // ainda não confirmado, mantém a cor exibida atual
}

// ========================================================================
// 5. KPIs DO PORTFÓLIO
// Escopo padrão: STATUS_ATIVO. "Cancelado" sempre excluído pelo chamador
// antes de passar a lista para estas funções (elas não conhecem o
// universo completo de projetos, só o que recebem).
// ========================================================================

export interface OtdResultado extends RetornoKpi {
  no_prazo: number;
  total: number;
}

/** 5.1 — OTD. Usa a baseline ORIGINAL — medir contra a promessa inicial é o ponto do indicador. */
export function otd(
  projetosConcluidos: Pick<ProjetoParaKpi, "data_fim_real" | "data_fim_baseline_original">[],
  hoje: Date
): OtdResultado {
  const elegiveis = projetosConcluidos.filter(
    (p) => p.data_fim_real && p.data_fim_baseline_original && diffDiasCorridos(hoje, p.data_fim_real) <= 365
  );
  const total = elegiveis.length;
  const no_prazo = elegiveis.filter((p) => (p.data_fim_real as Date) <= (p.data_fim_baseline_original as Date)).length;

  if (total === 0) {
    return { ...base(null, "cinza", "amostra insuficiente", 0), no_prazo: 0, total: 0 };
  }
  if (total < THRESHOLDS.otd.n_minimo) {
    return { ...base(null, "cinza", "amostra insuficiente", total), no_prazo, total };
  }

  const valor = no_prazo / total;
  const status = classificarMaiorMelhor(valor, THRESHOLDS.otd.verde, THRESHOLDS.otd.amarelo);
  return { ...base(valor, status, null, total), no_prazo, total };
}

/** 5.2 — Churn de baseline: média de numero_revisoes_baseline nos projetos ativos. */
export function churnBaseline(projetosAtivos: Pick<ProjetoParaKpi, "numero_revisoes_baseline">[]): RetornoKpi {
  if (projetosAtivos.length === 0) return base(null, "cinza", "sem projetos ativos", 0);
  const soma = projetosAtivos.reduce((s, p) => s + (p.numero_revisoes_baseline ?? 0), 0);
  return base(soma / projetosAtivos.length, "cinza", null, projetosAtivos.length);
}

/** 5.3 — Slip mediano dos projetos concluídos nos últimos 365 dias. Mediana, não média. */
export function slipMediano(slipsDias: number[]): RetornoKpi {
  if (slipsDias.length === 0) return base(null, "cinza", "amostra insuficiente", 0);
  return base(mediana(slipsDias), "cinza", null, slipsDias.length);
}

export interface PctAtrasadosResultado extends RetornoKpi {
  atrasados: number;
  total: number;
}

/** 5.4 — % de projetos ativos atrasados. Pausado é excluído do numerador e do denominador. */
export function pctAtrasados(
  projetosAtivos: Pick<ProjetoParaKpi, "status"> [] & { status: string; dias_atraso: number | null }[]
): PctAtrasadosResultado {
  const elegiveis = (projetosAtivos as { status: string; dias_atraso: number | null }[]).filter((p) => p.status !== "Pausado");
  const total = elegiveis.length;
  if (total === 0) return { ...base(null, "cinza", "sem projetos ativos", 0), atrasados: 0, total: 0 };

  const atrasados = elegiveis.filter((p) => p.dias_atraso !== null && p.dias_atraso > 0).length;
  const valor = atrasados / total;
  const status = classificarMenorMelhor(valor, THRESHOLDS.atrasados.verde, THRESHOLDS.atrasados.amarelo);
  return { ...base(valor, status, null, total), atrasados, total };
}

/** 5.5 — Progresso ponderado por orçamento. Substitui a média simples de progresso. */
export function progressoPonderado(projetosAtivos: Pick<ProjetoParaKpi, "progresso" | "orcamento">[]): RetornoKpi {
  const validos = projetosAtivos.filter((p) => p.orcamento !== null && p.orcamento! > 0 && p.progresso !== null);
  const somaOrcamento = validos.reduce((s, p) => s + (p.orcamento as number), 0);
  if (!(somaOrcamento > 0)) return base(null, "cinza", "sem orçamento", 0);
  const somaPonderada = validos.reduce((s, p) => s + (p.progresso as number) * (p.orcamento as number), 0);
  return base(somaPonderada / somaOrcamento, "cinza", null, validos.length);
}

/** 5.6 — CPI do portfólio: agregação de EV sobre AC. NUNCA média de CPIs individuais. */
export function cpiPortfolio(projetosAtivos: Pick<ProjetoParaKpi, "progresso" | "orcamento" | "gasto">[]): RetornoKpi {
  const validos = projetosAtivos.filter((p) => p.progresso !== null && p.orcamento !== null && p.gasto !== null);
  const somaGasto = validos.reduce((s, p) => s + (p.gasto as number), 0);
  if (!(somaGasto > 0)) return base(null, "cinza", "gasto zero", validos.length);
  const somaEv = validos.reduce((s, p) => s + (p.progresso as number) * (p.orcamento as number), 0);
  const valor = somaEv / somaGasto;
  const status = classificarMaiorMelhor(valor, THRESHOLDS.cpi.verde, THRESHOLDS.cpi.amarelo);
  return base(valor, status, null, validos.length);
}

/** 5.7 — EAC do portfólio: Σ orçamento / CPI do portfólio. */
export function eacPortfolio(projetosAtivos: Pick<ProjetoParaKpi, "progresso" | "orcamento" | "gasto">[]): RetornoKpi {
  const cpiPort = cpiPortfolio(projetosAtivos);
  if (cpiPort.valor === null) return base(null, "cinza", cpiPort.motivo_nulo, cpiPort.n);
  const somaOrcamento = projetosAtivos.reduce((s, p) => s + (p.orcamento ?? 0), 0);
  if (!(somaOrcamento > 0)) return base(null, "cinza", "sem orçamento", cpiPort.n);
  return base(somaOrcamento / cpiPort.valor, cpiPort.status, null, cpiPort.n);
}

export interface ContribuicaoDesvio {
  projetoId: number;
  nome?: string;
  variancia: number;
  contribuicao: number | null;
}

/** 5.8 — Decomposição do desvio de custo (diagnóstico): quais projetos explicam o desvio do portfólio. */
export function decomposicaoDesvioCusto(
  projetosAtivos: Pick<ProjetoParaKpi, "id" | "nome" | "progresso" | "orcamento" | "gasto">[]
): { itens: ContribuicaoDesvio[]; n: number } {
  const validos = projetosAtivos.filter((p) => p.progresso !== null && p.orcamento !== null && p.gasto !== null);
  const brutos = validos.map((p) => ({
    projetoId: p.id,
    nome: p.nome,
    variancia: (p.gasto as number) - (p.progresso as number) * (p.orcamento as number),
  }));
  const somaAbs = brutos.reduce((s, i) => s + Math.abs(i.variancia), 0);
  const itens = brutos
    .map((i) => ({ ...i, contribuicao: somaAbs > 0 ? i.variancia / somaAbs : null }))
    .sort((a, b) => b.variancia - a.variancia);
  return { itens, n: itens.length };
}

/** 5.9 — Mix do portfólio (Run vs Change), por orçamento. Rótulo na UI: "Mix do portfólio de projetos". */
export function mixPortfolio(projetosAtivos: Pick<ProjetoParaKpi, "tipo" | "orcamento">[]): RetornoKpi & { mix_change: number | null } {
  const comOrcamento = projetosAtivos.filter((p) => p.orcamento !== null && p.orcamento! > 0);
  const total = comOrcamento.reduce((s, p) => s + (p.orcamento as number), 0);
  if (!(total > 0)) return { ...base(null, "cinza", "sem orçamento", 0), mix_change: null };
  const run = comOrcamento.filter((p) => p.tipo === "Run").reduce((s, p) => s + (p.orcamento as number), 0);
  const valor = run / total;
  return { ...base(valor, "cinza", null, comOrcamento.length), mix_change: 1 - valor };
}

export interface BloqueiosResultado {
  pct_tarefas_bloqueadas: RetornoKpi & { bloqueadas: number; total: number };
  idade_media_bloqueio: RetornoKpi;
}

/** 5.10 (parte 1) — % de tarefas bloqueadas e idade média das bloqueadas atuais. */
export function bloqueios(tarefasAtivas: Pick<TarefaParaKpi, "status" | "data_bloqueio">[], hoje: Date): BloqueiosResultado {
  const total = tarefasAtivas.length;
  if (total === 0) {
    return {
      pct_tarefas_bloqueadas: { ...base(null, "cinza", "sem tarefas ativas", 0), bloqueadas: 0, total: 0 },
      idade_media_bloqueio: base(null, "cinza", "sem tarefas ativas", 0),
    };
  }

  const bloqueadas = tarefasAtivas.filter((t) => t.status === "Bloqueado");
  const pct = bloqueadas.length / total;
  const statusPct = classificarMenorMelhorBanda(pct, THRESHOLDS.bloqueio_pct.verde, THRESHOLDS.bloqueio_pct.vermelho);

  const comData = bloqueadas.filter((t) => t.data_bloqueio);
  let idade_media_bloqueio: RetornoKpi;
  if (comData.length === 0) {
    idade_media_bloqueio = base(null, "cinza", bloqueadas.length === 0 ? "sem tarefas bloqueadas" : "dado ausente", bloqueadas.length);
  } else {
    const idades = comData.map((t) => diffDiasCorridos(hoje, t.data_bloqueio as Date));
    const media = idades.reduce((s, x) => s + x, 0) / idades.length;
    const statusIdade = classificarMenorMelhorBanda(media, THRESHOLDS.bloqueio_dias.verde, THRESHOLDS.bloqueio_dias.vermelho);
    idade_media_bloqueio = base(media, statusIdade, null, comData.length);
  }

  return {
    pct_tarefas_bloqueadas: { ...base(pct, statusPct, null, total), bloqueadas: bloqueadas.length, total },
    idade_media_bloqueio,
  };
}

/**
 * 5.10 (parte 2) — Tempo de bloqueio resolvido, mediano, a partir dos
 * PARES de evento (entrada em "Bloqueado" -> saída de "Bloqueado")
 * encerrados nos últimos 28 dias. Sem isto o painel só vê bloqueios
 * abertos e subestima o problema sistematicamente.
 */
export function tempoBloqueioResolvidoMediano(eventos: TarefaEventoParaKpi[], hoje: Date): RetornoKpi {
  const porTarefa = new Map<number, TarefaEventoParaKpi[]>();
  for (const e of eventos) {
    const chave = (e as any).tarefaId as number;
    if (!porTarefa.has(chave)) porTarefa.set(chave, []);
    porTarefa.get(chave)!.push(e);
  }

  const duracoes: number[] = [];
  for (const eventosDaTarefa of porTarefa.values()) {
    const ordenados = [...eventosDaTarefa].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    let entradaBloqueio: Date | null = null;
    for (const e of ordenados) {
      if (e.para_status === "Bloqueado") {
        entradaBloqueio = e.timestamp;
      } else if (entradaBloqueio && e.de_status === "Bloqueado") {
        const saida = e.timestamp;
        if (diffDiasCorridos(hoje, saida) <= 28) {
          duracoes.push(diffDiasCorridos(saida, entradaBloqueio));
        }
        entradaBloqueio = null;
      }
    }
  }

  if (duracoes.length === 0) return base(null, "cinza", "sem bloqueios resolvidos no período", 0);
  return base(mediana(duracoes), "cinza", null, duracoes.length);
}

/** 5.11 — WIP envelhecido: tarefas "Em Andamento" com data_inicio mais antiga que THRESHOLDS.wip_dias. */
export function wipEnvelhecido(
  tarefasEmAndamento: Pick<TarefaParaKpi, "id" | "data_inicio">[],
  hoje: Date
): { itens: Pick<TarefaParaKpi, "id" | "data_inicio">[]; n: number; status: StatusRag } {
  const itens = tarefasEmAndamento.filter((t) => t.data_inicio && diffDiasCorridos(hoje, t.data_inicio) > THRESHOLDS.wip_dias);
  return { itens, n: itens.length, status: itens.length > 0 ? "amarelo" : "verde" };
}

export interface DistribuicaoTempo {
  mediana: RetornoKpi;
  p85: RetornoKpi;
}

function distribuicaoComAmostraMinima(valores: number[]): DistribuicaoTempo {
  const n = valores.length;
  const medianaResultado =
    n >= THRESHOLDS.lead_time.n_min_mediana ? base(mediana(valores), "cinza", null, n) : base(null, "cinza", "amostra insuficiente", n);

  const ordenado = [...valores].sort((a, b) => a - b);
  const p85Resultado =
    n >= THRESHOLDS.lead_time.n_min_p85
      ? base(percentilNearestRank(ordenado, 85), "cinza", null, n)
      : base(null, "cinza", "amostra insuficiente", n);

  return { mediana: medianaResultado, p85: p85Resultado };
}

/**
 * 5.12 — Cycle time (o que o time controla) e lead time (o que o
 * solicitante sente), sobre tarefas "Concluído" nos últimos 28 dias.
 * Suprimido inteiro enquanto (hoje - DATA_INICIO_COLETA) < 28 dias.
 */
export function fluxoCicloLead(
  tarefasConcluidasUltimos28Dias: Pick<TarefaParaKpi, "data_inicio" | "data_conclusao" | "data_criacao">[],
  hoje: Date,
  dataInicioColeta: Date | null
): { cycle_time: DistribuicaoTempo; lead_time: DistribuicaoTempo } {
  if (!dataInicioColeta || diffDiasCorridos(hoje, dataInicioColeta) < 28) {
    const suprimido = base(null, "cinza", "coleta em andamento", null);
    return {
      cycle_time: { mediana: suprimido, p85: suprimido },
      lead_time: { mediana: suprimido, p85: suprimido },
    };
  }

  const cycleValores = tarefasConcluidasUltimos28Dias
    .filter((t) => t.data_inicio && t.data_conclusao)
    .map((t) => diffDiasCorridos(t.data_conclusao as Date, t.data_inicio as Date));

  const leadValores = tarefasConcluidasUltimos28Dias
    .filter((t) => t.data_criacao && t.data_conclusao)
    .map((t) => diffDiasCorridos(t.data_conclusao as Date, t.data_criacao as Date));

  return {
    cycle_time: distribuicaoComAmostraMinima(cycleValores),
    lead_time: distribuicaoComAmostraMinima(leadValores),
  };
}

export interface SemanaThroughput {
  inicio: Date;
  fim: Date;
  quantidade: number;
  media_movel_4_semanas: number | null;
}

/** 5.13 — Throughput semanal (últimas 8 semanas) + média móvel de 4 semanas. Mesma supressão de 5.12. */
export function throughputSemanal(
  tarefasConcluidas: Pick<TarefaParaKpi, "data_conclusao">[],
  hoje: Date,
  dataInicioColeta: Date | null
): { semanas: SemanaThroughput[]; motivo_nulo: string | null } {
  if (!dataInicioColeta || diffDiasCorridos(hoje, dataInicioColeta) < 28) {
    return { semanas: [], motivo_nulo: "coleta em andamento" };
  }

  const DIA_MS = 86400000;
  const brutas: { inicio: Date; fim: Date; quantidade: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const fim = new Date(hoje.getTime() - i * 7 * DIA_MS);
    const inicio = new Date(fim.getTime() - 6 * DIA_MS);
    const quantidade = tarefasConcluidas.filter(
      (t) => t.data_conclusao && t.data_conclusao >= inicio && t.data_conclusao <= fim
    ).length;
    brutas.push({ inicio, fim, quantidade });
  }

  const semanas: SemanaThroughput[] = brutas.map((s, idx) => {
    if (idx < 3) return { ...s, media_movel_4_semanas: null };
    const janela = brutas.slice(idx - 3, idx + 1).map((x) => x.quantidade);
    return { ...s, media_movel_4_semanas: janela.reduce((a, b) => a + b, 0) / 4 };
  });

  return { semanas, motivo_nulo: null };
}

function semanasRestantes(dataFimPlanejadaTarefa: Date | null, hoje: Date): number {
  if (!dataFimPlanejadaTarefa) return 1;
  const dias = diffDiasCorridos(dataFimPlanejadaTarefa, hoje);
  if (dias <= 0) return 1; // não é futura
  return Math.max(1, Math.ceil(dias / 7));
}

export interface AlocacaoPessoaResultado {
  pessoaId: number;
  nome?: string;
  horas_previstas_semana: number;
  taxa_alocacao: RetornoKpi;
  semanas_backlog: number | null;
}

/**
 * 5.14 — Alocação semanal por pessoa. ATENÇÃO: NÃO é esforço total /
 * capacidade (isso dá semanas de backlog, não percentual, e deixa todo
 * mundo acima de 100%). É esforço distribuído pelas semanas restantes de
 * cada tarefa até seu prazo.
 */
export function alocacaoPessoa(
  pessoa: Pick<PessoaParaKpi, "id" | "nome" | "capacidade_horas_semana">,
  tarefasAtivasDaPessoa: Pick<TarefaParaKpi, "estimativa_horas" | "data_fim_planejada">[],
  hoje: Date
): AlocacaoPessoaResultado {
  const comEstimativa = tarefasAtivasDaPessoa.filter((t) => t.estimativa_horas !== null && t.estimativa_horas !== undefined);

  const horas_previstas_semana = comEstimativa.reduce((soma, t) => {
    const semanas = semanasRestantes(t.data_fim_planejada, hoje);
    return soma + (t.estimativa_horas as number) / semanas;
  }, 0);

  let taxa_alocacao: RetornoKpi;
  if (!(pessoa.capacidade_horas_semana > 0)) {
    taxa_alocacao = base(null, "cinza", "capacidade zero", null);
  } else {
    const valor = horas_previstas_semana / pessoa.capacidade_horas_semana;
    taxa_alocacao = base(valor, classificarAlocacao(valor), null, comEstimativa.length);
  }

  const semanas_backlog =
    pessoa.capacidade_horas_semana > 0
      ? comEstimativa.reduce((soma, t) => soma + (t.estimativa_horas as number), 0) / pessoa.capacidade_horas_semana
      : null;

  return { pessoaId: pessoa.id, nome: pessoa.nome, horas_previstas_semana, taxa_alocacao, semanas_backlog };
}

/** 5.14 (agregado) — Taxa de alocação do portfólio inteiro. */
export function taxaAlocacaoPortfolio(
  horasPrevistasSemanaPorPessoa: number[],
  capacidadesHorasSemana: number[]
): RetornoKpi {
  const somaHoras = horasPrevistasSemanaPorPessoa.reduce((s, h) => s + h, 0);
  const somaCapacidade = capacidadesHorasSemana.reduce((s, c) => s + c, 0);
  if (!(somaCapacidade > 0)) return base(null, "cinza", "sem capacidade cadastrada", 0);
  const valor = somaHoras / somaCapacidade;
  return base(valor, classificarAlocacao(valor), null, capacidadesHorasSemana.length);
}

/** 5.15 — Pessoas ativas com mais de 3 tarefas em TAREFA_EM_CURSO. */
export function pessoasSobrecarregadas(
  pessoasComContagem: { pessoaId: number; nome?: string; qtd_tarefas_em_curso: number }[]
): { itens: typeof pessoasComContagem; n: number } {
  const itens = pessoasComContagem.filter((p) => p.qtd_tarefas_em_curso > 3);
  return { itens, n: itens.length };
}

/** 5.16 — Projetos ativos (exceto Pausado) com dias_sem_report acima do limite. */
export function projetosDesatualizados(
  projetosAtivos: { id: number; nome?: string; status: string; dias_sem_report: number | null }[]
): { itens: typeof projetosAtivos; n: number } {
  const itens = projetosAtivos.filter(
    (p) => p.status !== "Pausado" && p.dias_sem_report !== null && p.dias_sem_report > THRESHOLDS.sem_report_dias
  );
  return { itens, n: itens.length };
}
