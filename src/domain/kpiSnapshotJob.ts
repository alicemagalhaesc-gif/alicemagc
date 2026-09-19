import { prisma } from "../db";
import { hojeBahia } from "./datetime";
import { getDataInicioColeta } from "./appConfig";
import { STATUS_ATIVO, TAREFA_ATIVA } from "./constants";
import { projetoParaKpi, tarefaParaKpi } from "./kpiAdapters";
import * as kpis from "../kpis";

interface RegistroSnapshot {
  data_referencia: Date;
  escopo: "portfolio" | "projeto";
  projetoId: number | null;
  kpi: string;
  valor: number | null;
  status_rag: string | null;
}

/**
 * Job diário (seção 6 do spec): grava o snapshot de todos os KPIs do
 * portfólio e a saúde de cada projeto. Append-only — nunca faz update.
 *
 * Esta é a ÚNICA parte da camada de KPI que toca o Prisma: carrega os
 * dados, monta os objetos simples que kpis.ts espera, chama as funções
 * puras, e persiste o resultado. Toda a lógica de cálculo em si vive em
 * kpis.ts.
 *
 * Escopo: snapshotamos os KPIs "escalares" (valor único por leitura) —
 * saúde por projeto e os agregados de portfólio de custo/prazo/mix/
 * bloqueio/alocação. KPIs que são séries/listas por natureza (WIP
 * envelhecido, throughput semanal, cycle/lead time, decomposição de
 * desvio, pessoas sobrecarregadas, projetos desatualizados) não cabem
 * numa linha (data_referencia, kpi, valor) e ficam de fora do snapshot
 * por ora — continuam calculáveis sob demanda direto de kpis.ts.
 */
export async function rodarJobDiarioKpiSnapshot(agora: Date = new Date()) {
  const hoje = hojeBahia(agora);
  const dataInicioColeta = await getDataInicioColeta();

  const projetosAtivosRaw = await prisma.projeto.findMany({ where: { status: { in: [...STATUS_ATIVO] } } });
  const tarefasAtivasRaw = await prisma.tarefa.findMany({
    where: { status: { in: [...TAREFA_ATIVA] }, projetoId: { in: projetosAtivosRaw.map((p) => p.id) } },
  });
  const projetosConcluidosRaw = await prisma.projeto.findMany({ where: { status: "Concluído" } });

  const projetosAtivos = projetosAtivosRaw.map(projetoParaKpi);
  const tarefasAtivas = tarefasAtivasRaw.map(tarefaParaKpi);
  const projetosConcluidos = projetosConcluidosRaw.map(projetoParaKpi);

  // Leituras de "saude_rag_calculada" de ontem, para a histerese (4.10) —
  // uma consulta só, agrupada em memória (escala de protótipo).
  const leiturasAnteriores = await prisma.kpiSnapshot.findMany({
    where: { escopo: "projeto", kpi: "saude_rag_calculada", projetoId: { in: projetosAtivosRaw.map((p) => p.id) }, data_referencia: { lt: hoje } },
    orderBy: { data_referencia: "desc" },
  });
  const ontemPorProjeto = new Map<number, string | null>();
  for (const leitura of leiturasAnteriores) {
    if (leitura.projetoId !== null && !ontemPorProjeto.has(leitura.projetoId)) {
      ontemPorProjeto.set(leitura.projetoId, leitura.status_rag);
    }
  }

  const registros: RegistroSnapshot[] = [];

  // --- Saúde + KPIs individuais, um projeto ativo por vez ---
  for (let i = 0; i < projetosAtivos.length; i++) {
    const p = projetosAtivos[i];
    const pRaw = projetosAtivosRaw[i];
    const tarefasDoProjeto = tarefasAtivas.filter((t) => t.projetoId === p.id);
    const saude = kpis.saudeRag(p, tarefasDoProjeto, hoje);

    const sinalSevero = saude.sinais?.V1 === true || saude.sinais?.V2 === true;
    const saudeExibida = kpis.proximaSaudeExibida({
      saude_calculada_hoje: saude.status,
      saude_calculada_ontem: (ontemPorProjeto.get(p.id) ?? null) as any,
      saude_exibida_atual: pRaw.saude_exibida as any,
      sinal_severo_hoje: sinalSevero,
    });

    await prisma.projeto.update({
      where: { id: p.id },
      data: { saude_calculada: saude.status, saude_exibida: saudeExibida },
    });

    registros.push({
      data_referencia: hoje,
      escopo: "projeto",
      projetoId: p.id,
      kpi: "saude_rag_calculada",
      valor: null,
      status_rag: saude.status,
    });
    registros.push({
      data_referencia: hoje,
      escopo: "projeto",
      projetoId: p.id,
      kpi: "saude_rag_exibida",
      valor: null,
      status_rag: saudeExibida,
    });
    if (saude.indice_ritmo) {
      registros.push({
        data_referencia: hoje,
        escopo: "projeto",
        projetoId: p.id,
        kpi: "indice_ritmo",
        valor: saude.indice_ritmo.valor,
        status_rag: saude.indice_ritmo.status,
      });
    }
    if (saude.cpi) {
      registros.push({
        data_referencia: hoje,
        escopo: "projeto",
        projetoId: p.id,
        kpi: "cpi",
        valor: saude.cpi.valor,
        status_rag: saude.cpi.status,
      });
    }
  }

  // --- Agregados de portfólio ---
  const atrasoPorProjeto = projetosAtivos.map((p) => ({ status: p.status, dias_atraso: kpis.atraso(p, hoje).dias_atraso }));
  const pctAtr = kpis.pctAtrasados(atrasoPorProjeto as any);
  const progPond = kpis.progressoPonderado(projetosAtivos);
  const cpiPort = kpis.cpiPortfolio(projetosAtivos);
  const eacPort = kpis.eacPortfolio(projetosAtivos);
  const churn = kpis.churnBaseline(projetosAtivos);
  const mix = kpis.mixPortfolio(projetosAtivos);
  const bloqueiosResultado = kpis.bloqueios(tarefasAtivas, hoje);
  const otdResultado = kpis.otd(projetosConcluidos, hoje);

  const agregadosPortfolio: [string, kpis.RetornoKpi][] = [
    ["pct_atrasados", pctAtr],
    ["progresso_ponderado", progPond],
    ["cpi_portfolio", cpiPort],
    ["eac_portfolio", eacPort],
    ["churn_baseline", churn],
    ["mix_run", mix],
    ["pct_tarefas_bloqueadas", bloqueiosResultado.pct_tarefas_bloqueadas],
    ["idade_media_bloqueio", bloqueiosResultado.idade_media_bloqueio],
    ["otd", otdResultado],
  ];

  for (const [kpi, resultado] of agregadosPortfolio) {
    registros.push({
      data_referencia: hoje,
      escopo: "portfolio",
      projetoId: null,
      kpi,
      valor: resultado.valor,
      status_rag: resultado.status,
    });
  }

  await prisma.kpiSnapshot.createMany({ data: registros });

  return { quantidade: registros.length, data_referencia: hoje, coletaMadura: dataInicioColeta !== null };
}

if (require.main === module) {
  rodarJobDiarioKpiSnapshot()
    .then((r) => console.log(`Snapshot gravado: ${r.quantidade} registro(s) para ${r.data_referencia.toISOString().slice(0, 10)}.`))
    .finally(() => prisma.$disconnect());
}
