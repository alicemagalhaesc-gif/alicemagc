import assert from "node:assert/strict";
import * as kpis from "./kpis";
import { hojeBahia } from "./domain/datetime";

let passou = 0;
let falhou = 0;

async function caso(numero: number, descricao: string, fn: () => void) {
  try {
    fn();
    passou++;
    console.log(`✅ [${numero}] ${descricao}`);
  } catch (err) {
    falhou++;
    console.log(`❌ [${numero}] ${descricao}`);
    console.log(`   -> ${(err as Error).message}`);
  }
}

function subDias(data: Date, n: number): Date {
  return new Date(data.getTime() - n * 86400000);
}
function somaDias(data: Date, n: number): Date {
  return new Date(data.getTime() + n * 86400000);
}

function projetoBase(overrides: Partial<kpis.ProjetoParaKpi>): kpis.ProjetoParaKpi {
  return {
    id: 1,
    status: "Em Andamento",
    progresso: null,
    orcamento: null,
    gasto: null,
    data_inicio: null,
    data_fim_planejada: null,
    data_fim_baseline: null,
    data_fim_baseline_original: null,
    data_fim_real: null,
    data_pausa: null,
    dias_pausado_acumulado: 0,
    numero_revisoes_baseline: 0,
    data_ultimo_status_report: null,
    ...overrides,
  };
}

async function main() {
  const hoje = hojeBahia(new Date());

  await caso(1, "orcamento=100000, gasto=0, progresso=0.30 -> cpi = null, motivo 'gasto zero'", () => {
    const r = kpis.cpi({ orcamento: 100000, gasto: 0, progresso: 0.3 });
    assert.equal(r.valor, null);
    assert.equal(r.motivo_nulo, "gasto zero");
  });

  await caso(2, "orcamento=100000, gasto=50000, progresso=0.60 -> cpi = 1.20 (verde)", () => {
    const r = kpis.cpi({ orcamento: 100000, gasto: 50000, progresso: 0.6 });
    assert.equal(r.valor, 1.2);
    assert.equal(r.status, "verde");
  });

  await caso(3, "orcamento=420000, gasto=350000, progresso=0.72 -> cpi = 0.864 (vermelho)", () => {
    const r = kpis.cpi({ orcamento: 420000, gasto: 350000, progresso: 0.72 });
    assert.ok(r.valor !== null && Math.abs(r.valor - 0.864) < 1e-9);
    assert.equal(r.status, "vermelho");
  });

  await caso(4, "data_inicio=hoje-10d, data_fim_planejada=hoje+90d, progresso=0.05 -> indice_ritmo null, 'aguardando maturidade'", () => {
    const projeto = projetoBase({
      data_inicio: subDias(hoje, 10),
      data_fim_planejada: somaDias(hoje, 90),
      progresso: 0.05,
    });
    const r = kpis.indiceRitmo(projeto, hoje);
    assert.equal(r.valor, null);
    assert.equal(r.motivo_nulo, "aguardando maturidade");
  });

  await caso(
    5,
    "data_inicio=hoje-60d, data_fim_planejada=hoje+40d, progresso=0.30 -> pct_prazo=0.60, ritmo=0.50 -> V1 -> saúde VERMELHO imediato",
    () => {
      const projeto = projetoBase({
        data_inicio: subDias(hoje, 60),
        data_fim_planejada: somaDias(hoje, 40),
        progresso: 0.3,
      });
      const ritmo = kpis.indiceRitmo(projeto, hoje);
      assert.ok(ritmo.pct_prazo_decorrido !== null && Math.abs(ritmo.pct_prazo_decorrido - 0.6) < 1e-9);
      assert.ok(ritmo.valor !== null && Math.abs(ritmo.valor - 0.5) < 1e-9);

      const saude = kpis.saudeRag(projeto, [], hoje);
      assert.equal(saude.sinais?.V1, true);
      assert.equal(saude.status, "vermelho");
    }
  );

  await caso(6, "indice_ritmo=0.90 (S1) e cpi=1.10, sem bloqueios -> 1 sinal -> AMARELO", () => {
    // Construído para que indiceRitmo() calcule exatamente 0.90:
    // progresso=0.45, pct_prazo_decorrido=0.50 (50 de 100 dias) -> 0.45/0.50=0.90
    const projeto = projetoBase({
      data_inicio: subDias(hoje, 50),
      data_fim_planejada: somaDias(hoje, 50),
      progresso: 0.45,
      orcamento: 100000,
    });
    // cpi=1.10 exige (progresso*orcamento)/gasto=1.10 com o mesmo progresso do ritmo:
    const gastoParaCpi110 = ((projeto.progresso as number) * (projeto.orcamento as number)) / 1.1;
    const projetoAjustado = { ...projeto, gasto: gastoParaCpi110 };

    const ritmo = kpis.indiceRitmo(projetoAjustado, hoje);
    assert.ok(ritmo.valor !== null && Math.abs(ritmo.valor - 0.9) < 1e-9);
    const cpiResultado = kpis.cpi(projetoAjustado);
    assert.ok(cpiResultado.valor !== null && Math.abs(cpiResultado.valor - 1.1) < 1e-9);

    const saude = kpis.saudeRag(projetoAjustado, [], hoje);
    assert.equal(saude.sinais?.S1, true);
    assert.equal(saude.sinais?.S2, false);
    assert.equal(saude.status, "amarelo");
  });

  await caso(7, "indice_ritmo=0.90 (S1) e cpi=0.88 (S2) -> 2 sinais -> VERMELHO", () => {
    const projeto = projetoBase({
      data_inicio: subDias(hoje, 50),
      data_fim_planejada: somaDias(hoje, 50),
      progresso: 0.45,
      orcamento: 100000,
    });
    const gastoParaCpi088 = ((projeto.progresso as number) * 100000) / 0.88;
    const projetoAjustado = { ...projeto, gasto: gastoParaCpi088 };

    const ritmo = kpis.indiceRitmo(projetoAjustado, hoje);
    assert.ok(ritmo.valor !== null && Math.abs(ritmo.valor - 0.9) < 1e-9);
    const cpiResultado = kpis.cpi(projetoAjustado);
    assert.ok(cpiResultado.valor !== null && Math.abs(cpiResultado.valor - 0.88) < 1e-9);

    const saude = kpis.saudeRag(projetoAjustado, [], hoje);
    assert.equal(saude.sinais?.S1, true);
    assert.equal(saude.sinais?.S2, true);
    assert.equal(saude.status, "vermelho");
  });

  await caso(8, "Projeto sem datas, sem gasto, dias_sem_report=3 -> CINZA", () => {
    const projeto = projetoBase({ data_ultimo_status_report: subDias(hoje, 3) });
    const saude = kpis.saudeRag(projeto, [], hoje);
    assert.equal(saude.status, "cinza");
  });

  await caso(9, 'Projeto "Pausado" há 30 dias, atrasado -> status "pausado", fora de pct_atrasados, sem cor RAG', () => {
    const projetoPausado = projetoBase({
      id: 42,
      status: "Pausado",
      data_pausa: subDias(hoje, 30),
      data_fim_planejada: subDias(hoje, 5), // já deveria ter terminado -> "atrasado"
    });
    const saude = kpis.saudeRag(projetoPausado, [], hoje);
    assert.equal(saude.status, "pausado");

    const outroAtivo = projetoBase({ id: 43, status: "Em Andamento", data_fim_planejada: somaDias(hoje, 30) });
    const listaParaPctAtrasados = [
      { status: projetoPausado.status, dias_atraso: kpis.atraso(projetoPausado, hoje).dias_atraso },
      { status: outroAtivo.status, dias_atraso: kpis.atraso(outroAtivo, hoje).dias_atraso },
    ];
    const pct = kpis.pctAtrasados(listaParaPctAtrasados as any);
    assert.equal(pct.total, 1, "Pausado deve sair do denominador");
    assert.equal(pct.atrasados, 0);
  });

  await caso(10, "Pausado 20 dias, 100 dias de prazo total, 60 dias desde o início -> pct_prazo_decorrido = 0.40", () => {
    const projeto = projetoBase({
      status: "Em Andamento", // já retomado
      data_inicio: subDias(hoje, 60),
      data_fim_planejada: somaDias(hoje, 40), // total = 100 dias
      dias_pausado_acumulado: 20,
      data_pausa: null,
    });
    const r = kpis.pctPrazoDecorrido(projeto, hoje);
    assert.equal(r.dias_totais, 100);
    assert.equal(r.dias_corridos, 40);
    assert.ok(r.valor !== null && Math.abs(r.valor - 0.4) < 1e-9);
  });

  await caso(11, "2 concluídos nos últimos 365 dias, 1 no prazo -> otd valor=null (n<5), {no_prazo:1,total:2}", () => {
    const concluidos = [
      { data_fim_real: subDias(hoje, 35), data_fim_baseline_original: subDias(hoje, 30) }, // no prazo (entregou antes da baseline)
      { data_fim_real: subDias(hoje, 10), data_fim_baseline_original: subDias(hoje, 20) }, // atrasado (entregou depois da baseline)
    ];
    const r = kpis.otd(concluidos, hoje);
    assert.equal(r.valor, null);
    assert.equal(r.motivo_nulo, "amostra insuficiente");
    assert.equal(r.no_prazo, 1);
    assert.equal(r.total, 2);
  });

  await caso(12, "Pessoa 40h/semana, 3 tarefas de 40h com prazo em 4 semanas -> horas=30, taxa=0.75 (verde), backlog=3.0", () => {
    const pessoa = { id: 1, nome: "Ana", capacidade_horas_semana: 40 };
    const prazoEm4Semanas = somaDias(hoje, 28);
    const tarefas = [
      { estimativa_horas: 40, data_fim_planejada: prazoEm4Semanas },
      { estimativa_horas: 40, data_fim_planejada: prazoEm4Semanas },
      { estimativa_horas: 40, data_fim_planejada: prazoEm4Semanas },
    ];
    const r = kpis.alocacaoPessoa(pessoa, tarefas, hoje);
    assert.equal(r.horas_previstas_semana, 30);
    assert.ok(r.taxa_alocacao.valor !== null && Math.abs(r.taxa_alocacao.valor - 0.75) < 1e-9);
    assert.equal(r.taxa_alocacao.status, "verde");
    assert.equal(r.semanas_backlog, 3.0);
  });

  await caso(13, "progresso=0.05, orcamento=100000, gasto=40000 -> eac = null, motivo 'progresso insuficiente'", () => {
    const r = kpis.eac({ progresso: 0.05, orcamento: 100000, gasto: 40000 });
    assert.equal(r.valor, null);
    assert.equal(r.motivo_nulo, "progresso insuficiente");
  });

  await caso(14, "Tarefa bloqueada e desbloqueada 3 vezes nos últimos 28 dias -> tempo_bloqueio_resolvido_mediano correto", () => {
    // 3 ciclos de bloqueio/desbloqueio com durações 2, 4 e 6 dias.
    const eventos: kpis.TarefaEventoParaKpi[] = [
      { tarefaId: 1, de_status: "Em Andamento", para_status: "Bloqueado", timestamp: subDias(hoje, 20) },
      { tarefaId: 1, de_status: "Bloqueado", para_status: "Em Andamento", timestamp: subDias(hoje, 18) }, // 2 dias
      { tarefaId: 1, de_status: "Em Andamento", para_status: "Bloqueado", timestamp: subDias(hoje, 15) },
      { tarefaId: 1, de_status: "Bloqueado", para_status: "Em Andamento", timestamp: subDias(hoje, 11) }, // 4 dias
      { tarefaId: 1, de_status: "Em Andamento", para_status: "Bloqueado", timestamp: subDias(hoje, 9) },
      { tarefaId: 1, de_status: "Bloqueado", para_status: "Concluído", timestamp: subDias(hoje, 3) }, // 6 dias
    ];
    const r = kpis.tempoBloqueioResolvidoMediano(eventos, hoje);
    assert.equal(r.n, 3);
    assert.equal(r.valor, 4); // mediana nearest-rank de [2,4,6] = 4
  });

  await caso(15, "(hoje - DATA_INICIO_COLETA) = 10 dias -> cycle_time, lead_time e throughput retornam null, 'coleta em andamento'", () => {
    const dataInicioColeta = subDias(hoje, 10);
    const fluxo = kpis.fluxoCicloLead([], hoje, dataInicioColeta);
    assert.equal(fluxo.cycle_time.mediana.valor, null);
    assert.equal(fluxo.cycle_time.mediana.motivo_nulo, "coleta em andamento");
    assert.equal(fluxo.lead_time.p85.valor, null);
    assert.equal(fluxo.lead_time.p85.motivo_nulo, "coleta em andamento");

    const throughput = kpis.throughputSemanal([], hoje, dataInicioColeta);
    assert.equal(throughput.semanas.length, 0);
    assert.equal(throughput.motivo_nulo, "coleta em andamento");
  });

  console.log(`\n${passou} passaram, ${falhou} falharam`);
  if (falhou > 0) process.exit(1);
}

main();
