import assert from "node:assert/strict";
import { prisma, garantirTriggersDeImutabilidade } from "./db";
import { criarProjeto } from "./domain/projetoService";
import { criarTarefa } from "./domain/tarefaService";
import { executarBackfillDadosLegados } from "./migrations/002_backfill_dados_legados";
import { getDataInicioColeta, invalidarCacheAppConfig } from "./domain/appConfig";
import { listarProjetosParaRegularizar, contarRegularizacao, regularizarProjeto } from "./domain/regularizacaoService";

let passou = 0;
let falhou = 0;

async function criterio(numero: number, descricao: string, fn: () => Promise<void>) {
  try {
    await fn();
    passou++;
    console.log(`✅ [${numero}] ${descricao}`);
  } catch (err) {
    falhou++;
    console.log(`❌ [${numero}] ${descricao}`);
    console.log(`   -> ${(err as Error).message}`);
  }
}

async function limparBanco() {
  await prisma.baselineAuditLog.deleteMany();
  await prisma.tarefaEvento.deleteMany();
  await prisma.tarefa.deleteMany();
  await prisma.projeto.deleteMany();
  await prisma.pessoa.deleteMany();
  await prisma.appConfig.deleteMany();
  invalidarCacheAppConfig();
}

/**
 * Simula dados "legados": grava direto via Prisma, ignorando os serviços da
 * entrega 1 (que sempre exigem data_inicio/data_fim_planejada) — é assim
 * que dados de um sistema anterior (Base44) chegariam: sem passar pelas
 * regras de negócio que só existem no app novo.
 */
async function seedProjetoLegado(nome: string, status: string, createdAt: Date) {
  return prisma.projeto.create({
    data: {
      nome,
      status,
      // campos que o schema antigo do Base44 não tinha: tudo ausente/zerado
      data_inicio: null,
      data_fim_planejada: null,
      progresso: 0,
      createdAt,
      updatedAt: createdAt,
    },
  });
}

async function seedTarefaLegada(projetoId: number, nome: string, status: string, createdAt: Date) {
  return prisma.tarefa.create({
    data: {
      projetoId,
      nome,
      status,
      data_criacao: createdAt,
    },
  });
}

async function main() {
  await garantirTriggersDeImutabilidade();
  await limparBanco();

  // Três projetos "legados" com datas de criação diferentes, um deles já
  // em execução (representa o caso mais delicado: projeto rodando sem
  // nunca ter tido baseline real).
  const legado1 = await seedProjetoLegado("Portal do fornecedor (legado)", "Em Andamento", new Date("2025-03-10T10:00:00.000Z"));
  const legado2 = await seedProjetoLegado("Migração de CRM (legado)", "Planejamento", new Date("2025-06-01T10:00:00.000Z"));
  const legado3 = await seedProjetoLegado("Descontinuado (legado)", "Cancelado", new Date("2024-11-20T10:00:00.000Z"));

  const tarefaLegada1 = await seedTarefaLegada(legado1.id, "Levantar requisitos", "Concluído", new Date("2025-03-12T10:00:00.000Z"));
  const tarefaLegada2 = await seedTarefaLegada(legado1.id, "Homologar com fornecedor", "Em Andamento", new Date("2025-04-01T10:00:00.000Z"));

  const resultado = await executarBackfillDadosLegados(new Date("2026-09-19T09:00:00.000Z"));

  await criterio(1, "Nenhum projeto pré-existente tem data de baseline preenchida", async () => {
    const projetos = await prisma.projeto.findMany({ where: { id: { in: [legado1.id, legado2.id, legado3.id] } } });
    for (const p of projetos) {
      assert.equal(p.data_fim_baseline, null, `projeto ${p.id} não deveria ter data_fim_baseline`);
      assert.equal(p.data_fim_baseline_original, null, `projeto ${p.id} não deveria ter data_fim_baseline_original`);
      assert.equal(p.data_fim_planejada, null, `projeto ${p.id} não deveria ter data_fim_planejada`);
    }
  });

  await criterio(2, "Todos os projetos pré-existentes têm dados_estimados = true", async () => {
    const projetos = await prisma.projeto.findMany({ where: { id: { in: [legado1.id, legado2.id, legado3.id] } } });
    for (const p of projetos) {
      assert.equal(p.dados_estimados, true, `projeto ${p.id} deveria estar marcado como estimado`);
    }
    // Efeito colateral também verificado: data_inicio veio da data de criação.
    const p1 = projetos.find((p) => p.id === legado1.id)!;
    assert.equal(p1.data_inicio?.toISOString().slice(0, 10), "2025-03-10");
  });

  await criterio(3, 'A tela "Regularizar projetos" lista todos eles e o contador funciona', async () => {
    const lista = await listarProjetosParaRegularizar();
    const idsListados = lista.map((p) => p.id);
    assert.ok(idsListados.includes(legado1.id));
    assert.ok(idsListados.includes(legado2.id));
    assert.ok(idsListados.includes(legado3.id));

    const contador = await contarRegularizacao();
    assert.equal(contador.total, 3);
    assert.equal(contador.pendentes, 3);
    assert.equal(contador.regularizados, 0);
  });

  await criterio(4, "Regularizar um projeto em execução grava as duas baselines e zera a flag", async () => {
    const antes = await contarRegularizacao();

    const atualizado = await regularizarProjeto(legado1.id, {
      data_inicio: new Date("2025-03-10T00:00:00.000Z"),
      data_fim_planejada: new Date("2026-12-31T00:00:00.000Z"),
    });

    assert.equal(atualizado.data_fim_baseline?.toISOString().slice(0, 10), "2026-12-31");
    assert.equal(atualizado.data_fim_baseline_original?.toISOString().slice(0, 10), "2026-12-31");
    assert.equal(atualizado.dados_estimados, false);

    const depois = await contarRegularizacao();
    assert.equal(depois.regularizados, antes.regularizados + 1);
    assert.equal(depois.pendentes, antes.pendentes - 1);
  });

  await criterio(5, "Existe um TarefaEvento inicial para cada tarefa existente", async () => {
    for (const t of [tarefaLegada1, tarefaLegada2]) {
      const eventos = await prisma.tarefaEvento.findMany({ where: { tarefaId: t.id } });
      assert.equal(eventos.length, 1, `tarefa ${t.id} deveria ter exatamente 1 evento inicial`);
      assert.equal(eventos[0].de_status, null);
      assert.equal(eventos[0].para_status, t.status);
    }
    const eventoConcluido = await prisma.tarefaEvento.findFirst({ where: { tarefaId: tarefaLegada1.id } });
    assert.equal(eventoConcluido?.timestamp.toISOString().slice(0, 10), "2025-03-12");

    // Datas de tarefa continuam null — não reconstruímos histórico.
    const tarefaAtualizada = await prisma.tarefa.findUniqueOrThrow({ where: { id: tarefaLegada1.id } });
    assert.equal(tarefaAtualizada.data_inicio, null);
    assert.equal(tarefaAtualizada.data_conclusao, null);
    assert.equal(tarefaAtualizada.data_bloqueio, null);
  });

  await criterio(6, "DATA_INICIO_COLETA está gravada e legível pelo app", async () => {
    assert.equal(resultado.jaExecutada, false);
    assert.equal(resultado.dataInicioColeta.toISOString().slice(0, 10), "2026-09-19");

    invalidarCacheAppConfig();
    const lida = await getDataInicioColeta();
    assert.equal(lida?.toISOString().slice(0, 10), "2026-09-19");
  });

  await criterio(6.1, "Rodar a migração de novo é inofensivo (idempotente)", async () => {
    const totalAntes = await prisma.tarefaEvento.count();
    const segundaExecucao = await executarBackfillDadosLegados(new Date("2026-09-25T09:00:00.000Z"));
    assert.equal(segundaExecucao.jaExecutada, true);
    assert.equal(segundaExecucao.dataInicioColeta.toISOString().slice(0, 10), "2026-09-19", "marco não deve andar para frente");
    const totalDepois = await prisma.tarefaEvento.count();
    assert.equal(totalDepois, totalAntes, "não deve duplicar eventos");
  });

  await criterio(6.2, "Projeto novo (criado após a migração) continua exigindo data_fim_planejada", async () => {
    const projetoNovo = await criarProjeto({
      nome: "Projeto novo pós-migração",
      status: "Planejamento",
      data_inicio: new Date("2026-09-20T00:00:00.000Z"),
      data_fim_planejada: new Date("2027-01-31T00:00:00.000Z"),
    });
    assert.ok(projetoNovo.data_fim_planejada, "projeto novo deve ter data_fim_planejada");

    const tarefaNova = await criarTarefa({
      nome: "Tarefa do projeto novo",
      projetoId: projetoNovo.id,
      status: "A Fazer",
    });
    assert.ok(tarefaNova.data_criacao);
  });

  console.log(`\n${passou} passaram, ${falhou} falharam`);
  await prisma.$disconnect();
  if (falhou > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
