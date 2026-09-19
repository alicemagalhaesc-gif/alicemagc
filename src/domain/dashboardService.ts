import { prisma } from "../db";
import { hojeBahia } from "./datetime";
import { getDataInicioColeta } from "./appConfig";
import { STATUS_ATIVO, TAREFA_ATIVA } from "./constants";
import { projetoParaKpi, tarefaParaKpi } from "./kpiAdapters";
import * as kpis from "../kpis";

/**
 * ÚNICO lugar (além de kpiSnapshotJob.ts) que carrega dado do Prisma para
 * alimentar kpis.ts. Monta exatamente o payload que a tela de dashboard
 * consome — nenhum cálculo de KPI acontece aqui nem no frontend; tudo é
 * `kpis.<funcao>(...)`. Isto satisfaz a regra rígida da entrega 4: "nenhum
 * componente do app pode conter cálculo de KPI inline".
 */
/**
 * `escopoProjetoId` restringe TODAS as consultas abaixo a um único
 * projeto, mantendo exatamente as mesmas fórmulas de kpis.ts — é assim que
 * a aba "Projetos" reaproveita o dashboard inteiro (mesmos cards, mesmos
 * gráficos, mesma tabela) só que com universo de 1 projeto em vez do
 * portfólio inteiro. Nenhum componente de UI muda; só o dado que entra.
 */
export async function montarPayloadDashboard(agora: Date = new Date(), escopoProjetoId?: number) {
  const hoje = hojeBahia(agora);
  const dataInicioColeta = await getDataInicioColeta();

  const filtroEscopo = escopoProjetoId ? { id: escopoProjetoId } : {};

  const projetosAtivosRaw = await prisma.projeto.findMany({
    where: { ...filtroEscopo, status: { in: [...STATUS_ATIVO] } },
    include: { sponsor: true },
  });
  const projetosConcluidosRaw = await prisma.projeto.findMany({ where: { ...filtroEscopo, status: "Concluído" } });
  const todosProjetosVisiveisRaw = await prisma.projeto.findMany({
    where: { ...filtroEscopo, status: { not: "Cancelado" } },
    orderBy: { id: "asc" },
  });

  const tarefasAtivasRaw = await prisma.tarefa.findMany({
    where: { status: { in: [...TAREFA_ATIVA] }, projetoId: { in: projetosAtivosRaw.map((p) => p.id) } },
  });
  const todasTarefasRaw = await prisma.tarefa.findMany({
    where: { projetoId: { in: todosProjetosVisiveisRaw.map((p) => p.id) } },
  });
  const eventosBloqueio = await prisma.tarefaEvento.findMany({
    where: { ...(escopoProjetoId ? { projetoId: escopoProjetoId } : {}), OR: [{ de_status: "Bloqueado" }, { para_status: "Bloqueado" }] },
  });
  const idsResponsaveisNoEscopo = escopoProjetoId ? new Set(tarefasAtivasRaw.map((t) => t.responsavelId).filter((id): id is number => id !== null)) : null;
  const pessoasAtivasRaw = await prisma.pessoa.findMany({
    where: { ativo: true, ...(idsResponsaveisNoEscopo ? { id: { in: [...idsResponsaveisNoEscopo] } } : {}) },
  });

  const projetosAtivos = projetosAtivosRaw.map(projetoParaKpi);
  const projetosConcluidos = projetosConcluidosRaw.map(projetoParaKpi);
  const tarefasAtivas = tarefasAtivasRaw.map(tarefaParaKpi);

  // ---------------------------------------------------------------
  // Linha 1 — cards principais
  // ---------------------------------------------------------------

  const contagemSaude = { verde: 0, amarelo: 0, vermelho: 0, cinza: 0 };
  let pausados = 0;
  for (const p of projetosAtivosRaw) {
    if (p.status === "Pausado") {
      pausados++;
      continue;
    }
    const cor = (p.saude_exibida ?? "cinza") as keyof typeof contagemSaude;
    if (cor in contagemSaude) contagemSaude[cor]++;
    else contagemSaude.cinza++;
  }
  const totalComCor = contagemSaude.verde + contagemSaude.amarelo + contagemSaude.vermelho + contagemSaude.cinza;
  const pctVerde = totalComCor > 0 ? contagemSaude.verde / totalComCor : null;

  const otdResultado = kpis.otd(projetosConcluidos, hoje);
  const cpiPortResultado = kpis.cpiPortfolio(projetosAtivos);
  const eacPortResultado = kpis.eacPortfolio(projetosAtivos);

  const atrasoPorProjeto = projetosAtivos.map((p) => ({ status: p.status, dias_atraso: kpis.atraso(p, hoje).dias_atraso }));
  const pctAtrasadosResultado = kpis.pctAtrasados(atrasoPorProjeto as any);
  const slipsConcluidos = projetosConcluidos
    .map((p) => kpis.atraso(p, hoje).slip_dias)
    .filter((v): v is number => v !== null);
  const slipMedianoResultado = kpis.slipMediano(slipsConcluidos);

  // ---------------------------------------------------------------
  // Linha 2 — cards secundários
  // ---------------------------------------------------------------

  const progressoPonderadoResultado = kpis.progressoPonderado(projetosAtivos);

  // Divergência média entre progresso reportado e progresso_objetivo (4.8),
  // só entre projetos onde ambos existem.
  const divergencias: number[] = [];
  for (const p of projetosAtivos) {
    const tarefasDoProjeto = todasTarefasRaw.filter((t) => t.projetoId === p.id).map(tarefaParaKpi);
    const objetivo = kpis.progressoObjetivo(p.progresso, tarefasDoProjeto);
    if (objetivo.divergencia_progresso !== null) divergencias.push(objetivo.divergencia_progresso);
  }
  const divergenciaMedia = divergencias.length > 0 ? divergencias.reduce((s, v) => s + v, 0) / divergencias.length : null;
  const progressoReportadoMedio =
    projetosAtivos.filter((p) => p.progresso !== null).length > 0
      ? (projetosAtivos.reduce((s, p) => s + (p.progresso ?? 0), 0) / projetosAtivos.filter((p) => p.progresso !== null).length)
      : null;

  const bloqueiosResultado = kpis.bloqueios(tarefasAtivas, hoje);
  const tempoBloqueioResolvidoResultado = kpis.tempoBloqueioResolvidoMediano(
    eventosBloqueio.map((e) => ({ tarefaId: e.tarefaId, de_status: e.de_status, para_status: e.para_status, timestamp: e.timestamp })),
    hoje
  );

  const alocacoesPorPessoa = pessoasAtivasRaw.map((pessoa) => {
    const tarefasDaPessoa = tarefasAtivasRaw.filter((t) => t.responsavelId === pessoa.id).map(tarefaParaKpi);
    return kpis.alocacaoPessoa(pessoa, tarefasDaPessoa, hoje);
  });
  const taxaAlocacaoPortfolioResultado = kpis.taxaAlocacaoPortfolio(
    alocacoesPorPessoa.map((a) => a.horas_previstas_semana),
    pessoasAtivasRaw.map((p) => p.capacidade_horas_semana)
  );
  const backlogMedioSemanas =
    alocacoesPorPessoa.filter((a) => a.semanas_backlog !== null).length > 0
      ? alocacoesPorPessoa.reduce((s, a) => s + (a.semanas_backlog ?? 0), 0) / alocacoesPorPessoa.filter((a) => a.semanas_backlog !== null).length
      : null;

  const diasSemReportPorProjeto = projetosAtivos
    .filter((p) => p.status !== "Pausado")
    .map((p) => ({ id: p.id, nome: p.nome, status: p.status, dias_sem_report: kpis.diasSemReport(p, hoje).valor }));
  const projetosDesatualizadosResultado = kpis.projetosDesatualizados(diasSemReportPorProjeto);

  // ---------------------------------------------------------------
  // Linha 3 — gráficos
  // ---------------------------------------------------------------

  const tarefasConcluidas28dRaw = todasTarefasRaw.filter(
    (t) => t.status === "Concluído" && t.data_conclusao && hojeBahia(t.data_conclusao).getTime() >= hoje.getTime() - 28 * 86400000
  );
  const fluxoResultado = kpis.fluxoCicloLead(tarefasConcluidas28dRaw.map(tarefaParaKpi), hoje, dataInicioColeta);
  const throughputResultado = kpis.throughputSemanal(
    todasTarefasRaw.filter((t) => t.status === "Concluído").map(tarefaParaKpi),
    hoje,
    dataInicioColeta
  );

  const orcamentoVsGasto = projetosAtivosRaw
    .filter((p) => p.orcamento !== null)
    .map((p) => ({ id: p.id, nome: p.nome, orcamento: p.orcamento, gasto: p.gasto }));

  // "Cancelado" foi excluído da busca principal (todosProjetosVisiveisRaw);
  // busca à parte só para completar o donut de distribuição de status.
  const totalCancelados = await prisma.projeto.count({ where: { ...filtroEscopo, status: "Cancelado" } });
  const distribuicaoStatus = ["Planejamento", "Em Andamento", "Pausado", "Concluído", "Cancelado"].map((status) => ({
    status,
    quantidade: status === "Cancelado" ? totalCancelados : todosProjetosVisiveisRaw.filter((p) => p.status === status).length,
  }));

  const decomposicaoDesvio = kpis.decomposicaoDesvioCusto(projetosAtivos);
  const top5Desvio = decomposicaoDesvio.itens.slice(0, 5);

  const mixResultado = kpis.mixPortfolio(projetosAtivos);

  // ---------------------------------------------------------------
  // Tabela "Projetos recentes"
  // ---------------------------------------------------------------

  const ORDEM_SAUDE: Record<string, number> = { vermelho: 0, amarelo: 1, verde: 2, cinza: 3, pausado: 4 };
  const linhasTabela = todosProjetosVisiveisRaw.map((p) => {
    const pKpi = projetoParaKpi(p);
    const ritmo = kpis.indiceRitmo(pKpi, hoje);
    const cpiResultado = kpis.cpi(pKpi);
    const atrasoResultado = kpis.atraso(pKpi, hoje);
    const cor = p.status === "Pausado" ? "pausado" : p.saude_exibida ?? "cinza";

    return {
      id: p.id,
      nome: p.nome,
      area: p.tipo,
      status: p.status,
      progresso: p.progresso,
      ritmo: ritmo.valor,
      ritmo_status: ritmo.status,
      ritmo_motivo_nulo: ritmo.motivo_nulo,
      cpi: cpiResultado.valor,
      cpi_status: cpiResultado.status,
      cpi_motivo_nulo: cpiResultado.motivo_nulo,
      dias_atraso: atrasoResultado.dias_atraso,
      slip_dias: atrasoResultado.slip_dias,
      orcamento: p.orcamento,
      saude: cor,
      dados_estimados: p.dados_estimados,
      numero_revisoes_baseline: p.numero_revisoes_baseline,
    };
  });

  linhasTabela.sort((a, b) => {
    const ordemDiff = (ORDEM_SAUDE[a.saude] ?? 5) - (ORDEM_SAUDE[b.saude] ?? 5);
    if (ordemDiff !== 0) return ordemDiff;
    return (b.orcamento ?? 0) - (a.orcamento ?? 0);
  });

  return {
    data_referencia: hoje.toISOString().slice(0, 10),
    data_inicio_coleta: dataInicioColeta ? dataInicioColeta.toISOString().slice(0, 10) : null,
    linha1: {
      saude_portfolio: { contagem: contagemSaude, pausados, pct_verde: pctVerde, meta_pct_verde: 0.75 },
      otd: otdResultado,
      cpi_portfolio: { ...cpiPortResultado, eac_portfolio: eacPortResultado },
      projetos_atrasados: { ...pctAtrasadosResultado, slip_mediano: slipMedianoResultado },
    },
    linha2: {
      progresso_ponderado: {
        ...progressoPonderadoResultado,
        progresso_reportado_medio: progressoReportadoMedio,
        divergencia_media: divergenciaMedia,
        divergencia_destaque: divergenciaMedia !== null && Math.abs(divergenciaMedia) > 0.15,
      },
      tarefas_bloqueadas: {
        pct: bloqueiosResultado.pct_tarefas_bloqueadas,
        idade_media: bloqueiosResultado.idade_media_bloqueio,
        tempo_resolvido_mediano: tempoBloqueioResolvidoResultado,
      },
      alocacao_equipe: {
        ...taxaAlocacaoPortfolioResultado,
        backlog_medio_semanas: backlogMedioSemanas,
        por_pessoa: alocacoesPorPessoa,
      },
      projetos_sem_atualizacao: projetosDesatualizadosResultado,
    },
    linha3: {
      throughput_semanal: throughputResultado,
      fluxo: fluxoResultado,
      orcamento_vs_gasto: orcamentoVsGasto,
      distribuicao_status: distribuicaoStatus,
      desvio_custo: top5Desvio,
      mix_portfolio: mixResultado,
    },
    tabela_projetos: linhasTabela,
  };
}
