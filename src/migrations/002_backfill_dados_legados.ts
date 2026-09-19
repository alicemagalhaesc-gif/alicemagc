import { prisma } from "../db";
import { hojeBahia } from "../domain/datetime";
import { getDataInicioColeta, definirDataInicioColetaSeAusente } from "../domain/appConfig";

export interface ResultadoBackfill {
  jaExecutada: boolean;
  projetosProcessados: number;
  tarefasProcessadas: number;
  dataInicioColeta: Date;
}

/**
 * Entrega 2 — migração única de dados legados (seções 1, 3 e 4 do spec).
 *
 * PRINCÍPIO QUE NÃO PODE SER VIOLADO: nenhuma data é fabricada. Um dado
 * ausente permanece null e o projeto/tarefa fica marcado como incompleto
 * (dados_estimados = true) até alguém regularizar manualmente pela tela
 * "Regularizar projetos" (src/domain/regularizacaoService.ts).
 *
 * Idempotente: usa a presença de DATA_INICIO_COLETA como marca de que já
 * rodou. Rodar de novo depois disso não repete o backfill (não re-marca
 * projetos já regularizados como estimados, nem duplica TarefaEvento).
 */
export async function executarBackfillDadosLegados(agora: Date = new Date()): Promise<ResultadoBackfill> {
  const marcoExistente = await getDataInicioColeta();
  if (marcoExistente) {
    return {
      jaExecutada: true,
      projetosProcessados: 0,
      tarefasProcessadas: 0,
      dataInicioColeta: marcoExistente,
    };
  }

  // 1. Projetos existentes
  const projetos = await prisma.projeto.findMany();
  for (const p of projetos) {
    await prisma.projeto.update({
      where: { id: p.id },
      data: {
        // data_inicio: só se houver data de criação conhecida do registro.
        data_inicio: p.createdAt ? hojeBahia(p.createdAt) : null,
        // data_fim_planejada / baselines: DEIXAR NULL — nunca estimar.
        data_fim_planejada: null,
        dados_estimados: true,
        tipo: p.tipo ?? "Change",
        prioridade: p.prioridade ?? "Média",
        data_ultimo_status_report: p.updatedAt ?? null,
        // data_fim_baseline / data_fim_baseline_original: propositalmente
        // OMITIDOS do payload — não tocamos neles. Em dado legado eles já
        // nascem null; o trigger de imutabilidade protege qualquer projeto
        // que por acaso já tenha uma baseline real gravada.
      },
    });
  }

  // 3. Tarefas existentes
  const tarefas = await prisma.tarefa.findMany();
  for (const t of tarefas) {
    await prisma.tarefa.update({
      where: { id: t.id },
      data: {
        data_inicio: null,
        data_conclusao: null,
        data_bloqueio: null,
      },
    });

    // Um TarefaEvento inicial por tarefa, se ainda não existir nenhum
    // (evita duplicar caso o backfill seja chamado mais de uma vez antes
    // do marco ser gravado, ex.: falha no meio da execução).
    const jaTemEvento = await prisma.tarefaEvento.findFirst({ where: { tarefaId: t.id } });
    if (!jaTemEvento) {
      await prisma.tarefaEvento.create({
        data: {
          tarefaId: t.id,
          projetoId: t.projetoId,
          de_status: null,
          para_status: t.status,
          timestamp: t.data_criacao ?? agora,
        },
      });
    }
  }

  // 4. Marco de início da coleta — grava por último, marca a migração como concluída.
  const dataInicioColeta = await definirDataInicioColetaSeAusente(agora);

  return {
    jaExecutada: false,
    projetosProcessados: projetos.length,
    tarefasProcessadas: tarefas.length,
    dataInicioColeta,
  };
}

if (require.main === module) {
  executarBackfillDadosLegados()
    .then((r) => {
      console.log(
        r.jaExecutada
          ? `Migração já havia rodado em ${r.dataInicioColeta.toISOString().slice(0, 10)}. Nada a fazer.`
          : `Backfill concluído: ${r.projetosProcessados} projeto(s), ${r.tarefasProcessadas} tarefa(s). DATA_INICIO_COLETA = ${r.dataInicioColeta.toISOString().slice(0, 10)}.`
      );
    })
    .finally(() => prisma.$disconnect());
}
