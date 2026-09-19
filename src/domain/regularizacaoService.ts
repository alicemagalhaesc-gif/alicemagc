import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { STATUS_EXECUCAO, StatusProjeto } from "./constants";

/**
 * Filtro da tela "Regularizar projetos" (entrega 2, seção 2):
 * projetos com dados_estimados = true OU data_fim_planejada nula.
 */
const FILTRO_PENDENTES: Prisma.ProjetoWhereInput = {
  OR: [{ dados_estimados: true }, { data_fim_planejada: null }],
};

export async function listarProjetosParaRegularizar() {
  return prisma.projeto.findMany({
    where: FILTRO_PENDENTES,
    orderBy: { id: "asc" },
  });
}

export interface ContadorRegularizacao {
  total: number;
  pendentes: number;
  regularizados: number;
}

export async function contarRegularizacao(): Promise<ContadorRegularizacao> {
  const [total, pendentes] = await Promise.all([
    prisma.projeto.count(),
    prisma.projeto.count({ where: FILTRO_PENDENTES }),
  ]);
  return { total, pendentes, regularizados: total - pendentes };
}

export interface RegularizarProjetoInput {
  data_inicio: Date;
  data_fim_planejada: Date;
}

/**
 * Único caminho para um projeto legado ganhar datas reais. Nunca chamado
 * automaticamente — é a ação explícita de alguém preenchendo a tela.
 *
 * Se o projeto já está em status de execução, grava as duas baselines
 * (o trigger de imutabilidade garante que isso só funciona se
 * data_fim_baseline_original ainda estiver vazia, como é o caso de todo
 * projeto legado) e zera dados_estimados.
 *
 * Se ainda está em Planejamento, salva as datas mas NÃO fabrica uma
 * baseline agora — ela será copiada automaticamente pelo gatilho da
 * entrega 1 quando (e se) o projeto entrar em execução de verdade.
 */
export async function regularizarProjeto(id: number, input: RegularizarProjetoInput) {
  const atual = await prisma.projeto.findUniqueOrThrow({ where: { id } });

  const data: Record<string, unknown> = {
    data_inicio: input.data_inicio,
    data_fim_planejada: input.data_fim_planejada,
  };

  if (STATUS_EXECUCAO.includes(atual.status as StatusProjeto)) {
    data.data_fim_baseline = input.data_fim_planejada;
    data.data_fim_baseline_original = input.data_fim_planejada;
    data.dados_estimados = false;
  }

  return prisma.projeto.update({ where: { id }, data: data as any });
}
