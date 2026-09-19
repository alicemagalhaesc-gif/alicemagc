import { prisma } from "../db";
import { hojeBahia } from "./datetime";

const CHAVE_DATA_INICIO_COLETA = "DATA_INICIO_COLETA";

let cacheDataInicioColeta: Date | null | undefined; // undefined = ainda não lida do banco

/**
 * Marco global: data em que a migração de dados legados (entrega 2) foi
 * executada. Usado na entrega 4 para marca d'água nos gráficos de fluxo e
 * para suprimir KPIs de fluxo antes de 28 dias de coleta.
 * Retorna null se a migração ainda não rodou.
 */
export async function getDataInicioColeta(): Promise<Date | null> {
  if (cacheDataInicioColeta !== undefined) return cacheDataInicioColeta;
  const linha = await prisma.appConfig.findUnique({ where: { chave: CHAVE_DATA_INICIO_COLETA } });
  cacheDataInicioColeta = linha ? new Date(linha.valor) : null;
  return cacheDataInicioColeta;
}

/**
 * Grava DATA_INICIO_COLETA uma única vez. Idempotente: se já existir,
 * apenas retorna o valor já gravado — nunca sobrescreve (a data marca
 * quando a coleta de verdade começou, não pode "andar para frente").
 */
export async function definirDataInicioColetaSeAusente(agora: Date = new Date()): Promise<Date> {
  const existente = await getDataInicioColeta();
  if (existente) return existente;

  const hoje = hojeBahia(agora);
  await prisma.appConfig.create({
    data: { chave: CHAVE_DATA_INICIO_COLETA, valor: hoje.toISOString() },
  });
  cacheDataInicioColeta = hoje;
  return hoje;
}

/** Só para os testes/demo: força o cache em memória a reler do banco. */
export function invalidarCacheAppConfig(): void {
  cacheDataInicioColeta = undefined;
}
