import type { Projeto, Tarefa } from "@prisma/client";
import type { ProjetoParaKpi, TarefaParaKpi } from "../kpis";

/**
 * Adaptador Prisma -> kpis.ts. Não faz NENHUM cálculo de KPI — só resolve
 * uma incompatibilidade de representação: Projeto.progresso é gravado como
 * inteiro 0–100 (conveniente pra formulário), mas a convenção de kpis.ts
 * (seção 2 do spec da entrega 3) é fração 0–1. Esta é a única linha do
 * projeto inteiro que faz essa divisão — todo consumidor de kpis.ts
 * (job de snapshot, API do dashboard) passa por aqui.
 */
export function projetoParaKpi(p: Projeto): ProjetoParaKpi {
  return {
    id: p.id,
    nome: p.nome,
    status: p.status,
    tipo: p.tipo,
    progresso: p.progresso === null || p.progresso === undefined ? null : p.progresso / 100,
    orcamento: p.orcamento,
    gasto: p.gasto,
    data_inicio: p.data_inicio,
    data_fim_planejada: p.data_fim_planejada,
    data_fim_baseline: p.data_fim_baseline,
    data_fim_baseline_original: p.data_fim_baseline_original,
    data_fim_real: p.data_fim_real,
    data_pausa: p.data_pausa,
    dias_pausado_acumulado: p.dias_pausado_acumulado,
    numero_revisoes_baseline: p.numero_revisoes_baseline,
    data_ultimo_status_report: p.data_ultimo_status_report,
  };
}

export function tarefaParaKpi(t: Tarefa): TarefaParaKpi {
  return {
    id: t.id,
    projetoId: t.projetoId,
    status: t.status,
    data_criacao: t.data_criacao,
    data_inicio: t.data_inicio,
    data_conclusao: t.data_conclusao,
    data_bloqueio: t.data_bloqueio,
    data_fim_planejada: t.data_fim_planejada,
    estimativa_horas: t.estimativa_horas,
  };
}
