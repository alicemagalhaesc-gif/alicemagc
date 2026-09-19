import { prisma } from "../db";

export type EntidadeExploravel = "projeto" | "tarefa" | "pessoa";
export type TipoCampo = "string" | "number" | "date" | "boolean" | "enum";
export type Operador = "=" | "!=" | ">" | ">=" | "<" | "<=" | "contem" | "vazio" | "nao_vazio";
export type FuncaoAgregacao = "contagem" | "soma" | "media" | "min" | "max";

export interface DefinicaoCampo {
  chave: string;
  label: string;
  tipo: TipoCampo;
  opcoes?: string[];
}

/**
 * Whitelist explícita de campos navegáveis por entidade — é isso que torna
 * este "SQL sem SQL" seguro: o usuário nunca escreve nome de coluna livre,
 * só escolhe entre estas opções, então nenhum filtro/agrupamento chega ao
 * Prisma com um campo que não exista ou não devesse ser exposto.
 */
export const ENTIDADES: Record<EntidadeExploravel, { label: string; campos: DefinicaoCampo[] }> = {
  projeto: {
    label: "Projetos",
    campos: [
      { chave: "id", label: "ID", tipo: "number" },
      { chave: "nome", label: "Nome", tipo: "string" },
      { chave: "status", label: "Status", tipo: "enum", opcoes: ["Planejamento", "Em Andamento", "Pausado", "Concluído", "Cancelado"] },
      { chave: "tipo", label: "Tipo", tipo: "enum", opcoes: ["Run", "Change"] },
      { chave: "prioridade", label: "Prioridade", tipo: "enum", opcoes: ["Alta", "Média", "Baixa"] },
      { chave: "progresso", label: "Progresso (0-100)", tipo: "number" },
      { chave: "orcamento", label: "Orçamento", tipo: "number" },
      { chave: "gasto", label: "Gasto", tipo: "number" },
      { chave: "data_inicio", label: "Data de Início", tipo: "date" },
      { chave: "data_fim_planejada", label: "Data Fim Planejada", tipo: "date" },
      { chave: "data_fim_real", label: "Data Fim Real", tipo: "date" },
      { chave: "numero_revisoes_baseline", label: "Revisões de Baseline", tipo: "number" },
      { chave: "dados_estimados", label: "Dados Estimados", tipo: "boolean" },
    ],
  },
  tarefa: {
    label: "Tarefas",
    campos: [
      { chave: "id", label: "ID", tipo: "number" },
      { chave: "nome", label: "Nome", tipo: "string" },
      { chave: "status", label: "Status", tipo: "enum", opcoes: ["A Fazer", "Em Andamento", "Bloqueado", "Concluído"] },
      { chave: "prioridade", label: "Prioridade", tipo: "enum", opcoes: ["Alta", "Média", "Baixa"] },
      { chave: "estimativa_horas", label: "Estimativa (horas)", tipo: "number" },
      { chave: "data_inicio", label: "Data de Início", tipo: "date" },
      { chave: "data_conclusao", label: "Data de Conclusão", tipo: "date" },
      { chave: "data_fim_planejada", label: "Data Fim Planejada", tipo: "date" },
    ],
  },
  pessoa: {
    label: "Pessoas",
    campos: [
      { chave: "id", label: "ID", tipo: "number" },
      { chave: "nome", label: "Nome", tipo: "string" },
      { chave: "cargo", label: "Cargo", tipo: "string" },
      { chave: "email", label: "Email", tipo: "string" },
      { chave: "capacidade_horas_semana", label: "Capacidade (h/semana)", tipo: "number" },
      { chave: "ativo", label: "Ativo", tipo: "boolean" },
    ],
  },
};

export interface FiltroConsulta {
  campo: string;
  operador: Operador;
  valor?: string;
}

export interface AgregacaoConsulta {
  campo: string;
  funcao: FuncaoAgregacao;
}

export interface ConsultaExplorer {
  entidade: EntidadeExploravel;
  campos: string[];
  filtros: FiltroConsulta[];
  agruparPor?: string;
  agregacoes?: AgregacaoConsulta[];
  ordenarPor?: string;
  ordenarDirecao?: "asc" | "desc";
}

const LIMITE_LINHAS = 500;

function campoValido(entidade: EntidadeExploravel, chave: string): DefinicaoCampo | undefined {
  return ENTIDADES[entidade].campos.find((c) => c.chave === chave);
}

function converterValor(campo: DefinicaoCampo, valor: string | undefined): unknown {
  if (valor === undefined) return undefined;
  if (campo.tipo === "number") return Number(valor);
  if (campo.tipo === "boolean") return valor === "true";
  if (campo.tipo === "date") return new Date(valor);
  return valor;
}

function montarWhere(entidade: EntidadeExploravel, filtros: FiltroConsulta[]): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  for (const f of filtros) {
    const campo = campoValido(entidade, f.campo);
    if (!campo) continue; // ignora silenciosamente campo fora da whitelist

    if (f.operador === "vazio") {
      where[f.campo] = null;
      continue;
    }
    if (f.operador === "nao_vazio") {
      where[f.campo] = { not: null };
      continue;
    }

    const valor = converterValor(campo, f.valor);
    if (valor === undefined || (typeof valor === "number" && Number.isNaN(valor))) continue;

    switch (f.operador) {
      case "=":
        where[f.campo] = valor;
        break;
      case "!=":
        where[f.campo] = { not: valor };
        break;
      case ">":
        where[f.campo] = { gt: valor };
        break;
      case ">=":
        where[f.campo] = { gte: valor };
        break;
      case "<":
        where[f.campo] = { lt: valor };
        break;
      case "<=":
        where[f.campo] = { lte: valor };
        break;
      case "contem":
        where[f.campo] = { contains: String(valor) };
        break;
    }
  }
  return where;
}

function modeloPrisma(entidade: EntidadeExploravel) {
  if (entidade === "projeto") return prisma.projeto;
  if (entidade === "tarefa") return prisma.tarefa;
  return prisma.pessoa;
}

export interface ResultadoExplorer {
  colunas: string[];
  linhas: Record<string, unknown>[];
  total: number;
  truncado: boolean;
}

export async function executarConsulta(consulta: ConsultaExplorer): Promise<ResultadoExplorer> {
  const { entidade } = consulta;
  const camposValidos = consulta.campos.filter((c) => campoValido(entidade, c));
  const where = montarWhere(entidade, consulta.filtros);
  const modelo = modeloPrisma(entidade) as any;

  if (consulta.agruparPor && campoValido(entidade, consulta.agruparPor)) {
    const agregacoesValidas = (consulta.agregacoes ?? []).filter((a) => campoValido(entidade, a.campo));

    const _sum: Record<string, boolean> = {};
    const _avg: Record<string, boolean> = {};
    const _min: Record<string, boolean> = {};
    const _max: Record<string, boolean> = {};
    for (const a of agregacoesValidas) {
      if (a.funcao === "soma") _sum[a.campo] = true;
      if (a.funcao === "media") _avg[a.campo] = true;
      if (a.funcao === "min") _min[a.campo] = true;
      if (a.funcao === "max") _max[a.campo] = true;
    }

    const grupos = await modelo.groupBy({
      by: [consulta.agruparPor],
      where,
      orderBy: { [consulta.agruparPor]: "asc" },
      _count: { _all: true },
      ...(Object.keys(_sum).length ? { _sum } : {}),
      ...(Object.keys(_avg).length ? { _avg } : {}),
      ...(Object.keys(_min).length ? { _min } : {}),
      ...(Object.keys(_max).length ? { _max } : {}),
      take: LIMITE_LINHAS,
    });

    const linhas = grupos.map((g: any) => {
      const linha: Record<string, unknown> = { [consulta.agruparPor as string]: g[consulta.agruparPor as string], contagem: g._count._all };
      for (const a of agregacoesValidas) {
        const chaveResultado = `${a.funcao}_${a.campo}`;
        if (a.funcao === "soma") linha[chaveResultado] = g._sum?.[a.campo] ?? null;
        if (a.funcao === "media") linha[chaveResultado] = g._avg?.[a.campo] ?? null;
        if (a.funcao === "min") linha[chaveResultado] = g._min?.[a.campo] ?? null;
        if (a.funcao === "max") linha[chaveResultado] = g._max?.[a.campo] ?? null;
      }
      return linha;
    });

    return {
      colunas: [consulta.agruparPor, "contagem", ...agregacoesValidas.map((a) => `${a.funcao}_${a.campo}`)],
      linhas,
      total: linhas.length,
      truncado: linhas.length >= LIMITE_LINHAS,
    };
  }

  const select: Record<string, boolean> = {};
  for (const c of camposValidos.length > 0 ? camposValidos : ["id", "nome"]) select[c] = true;

  const orderBy =
    consulta.ordenarPor && campoValido(entidade, consulta.ordenarPor)
      ? { [consulta.ordenarPor]: consulta.ordenarDirecao ?? "asc" }
      : undefined;

  const [linhas, total] = await Promise.all([
    modelo.findMany({ where, select, orderBy, take: LIMITE_LINHAS }),
    modelo.count({ where }),
  ]);

  return {
    colunas: Object.keys(select),
    linhas,
    total,
    truncado: total > LIMITE_LINHAS,
  };
}
