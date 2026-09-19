import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { criarProjeto, ProjetoCriarInput } from "./projetoService";
import { criarTarefa } from "./tarefaService";
import { STATUS_PROJETO, STATUS_TAREFA, TIPO_PROJETO, PRIORIDADE_PROJETO, StatusProjeto, StatusTarefa } from "./constants";

export type EntidadeImportavel = "projeto" | "tarefa" | "pessoa";

export interface CampoImportavel {
  chave: string;
  label: string;
  obrigatorio: boolean;
}

const CAMPOS: Record<EntidadeImportavel, CampoImportavel[]> = {
  projeto: [
    { chave: "nome", label: "Nome", obrigatorio: true },
    { chave: "status", label: "Status", obrigatorio: false },
    { chave: "tipo", label: "Tipo (Run/Change)", obrigatorio: false },
    { chave: "prioridade", label: "Prioridade", obrigatorio: false },
    { chave: "progresso", label: "Progresso (0-100)", obrigatorio: false },
    { chave: "orcamento", label: "Orçamento", obrigatorio: false },
    { chave: "gasto", label: "Gasto", obrigatorio: false },
    { chave: "data_inicio", label: "Data de Início", obrigatorio: false },
    { chave: "data_fim_planejada", label: "Data Fim Planejada", obrigatorio: false },
    { chave: "sponsor", label: "Sponsor (nome da pessoa)", obrigatorio: false },
  ],
  tarefa: [
    { chave: "nome", label: "Nome", obrigatorio: true },
    { chave: "projeto", label: "Projeto (nome)", obrigatorio: true },
    { chave: "status", label: "Status", obrigatorio: false },
    { chave: "prioridade", label: "Prioridade", obrigatorio: false },
    { chave: "estimativa_horas", label: "Estimativa (horas)", obrigatorio: false },
    { chave: "responsavel", label: "Responsável (nome da pessoa)", obrigatorio: false },
    { chave: "data_fim_planejada", label: "Data Fim Planejada", obrigatorio: false },
  ],
  pessoa: [
    { chave: "nome", label: "Nome", obrigatorio: true },
    { chave: "cargo", label: "Cargo", obrigatorio: false },
    { chave: "email", label: "Email", obrigatorio: false },
    { chave: "capacidade_horas_semana", label: "Capacidade (h/semana)", obrigatorio: false },
    { chave: "ativo", label: "Ativo", obrigatorio: false },
  ],
};

const ALIASES: Record<EntidadeImportavel, Record<string, string>> = {
  projeto: {
    nome: "nome",
    "nome do projeto": "nome",
    projeto: "nome",
    status: "status",
    tipo: "tipo",
    area: "tipo",
    área: "tipo",
    prioridade: "prioridade",
    progresso: "progresso",
    "% progresso": "progresso",
    orcamento: "orcamento",
    orçamento: "orcamento",
    gasto: "gasto",
    custo: "gasto",
    "data inicio": "data_inicio",
    "data de inicio": "data_inicio",
    "data início": "data_inicio",
    "data fim": "data_fim_planejada",
    "data fim planejada": "data_fim_planejada",
    prazo: "data_fim_planejada",
    sponsor: "sponsor",
    patrocinador: "sponsor",
  },
  tarefa: {
    nome: "nome",
    tarefa: "nome",
    projeto: "projeto",
    "nome do projeto": "projeto",
    status: "status",
    prioridade: "prioridade",
    "estimativa horas": "estimativa_horas",
    estimativa: "estimativa_horas",
    horas: "estimativa_horas",
    responsavel: "responsavel",
    responsável: "responsavel",
    "data fim planejada": "data_fim_planejada",
    prazo: "data_fim_planejada",
  },
  pessoa: {
    nome: "nome",
    cargo: "cargo",
    email: "email",
    "capacidade horas semana": "capacidade_horas_semana",
    capacidade: "capacidade_horas_semana",
    ativo: "ativo",
  },
};

export function normalizarCabecalho(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export interface PreviewImportacao {
  importId: string;
  colunas: string[];
  sugestaoMapeamento: Record<string, string | null>;
  linhasPreview: Record<string, string>[];
  totalLinhas: number;
  camposDisponiveis: CampoImportavel[];
}

// Cache em memória, curta duração — protótipo de processo único. Cada
// importId guarda as linhas já parseadas pra não precisar reenviar o
// arquivo inteiro na hora de confirmar a importação.
const cacheImportacoes = new Map<string, { entidade: EntidadeImportavel; linhas: Record<string, string>[] }>();

export async function parsearArquivo(buffer: Buffer, nomeArquivo: string): Promise<Record<string, string>[]> {
  const ehCsv = nomeArquivo.toLowerCase().endsWith(".csv");

  if (ehCsv) {
    const registros: Record<string, string>[] = parseCsv(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
    return registros;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const planilha = workbook.worksheets[0];
  if (!planilha) return [];

  const linhas: Record<string, string>[] = [];
  const cabecalhos: string[] = [];
  planilha.eachRow((row, numeroLinha) => {
    const valores = (row.values as unknown[]).slice(1); // ExcelJS usa índice 1-based, [0] é sempre undefined
    if (numeroLinha === 1) {
      for (const v of valores) cabecalhos.push(String(v ?? "").trim());
      return;
    }
    const registro: Record<string, string> = {};
    valores.forEach((v, idx) => {
      const chave = cabecalhos[idx];
      if (!chave) return;
      registro[chave] = v === null || v === undefined ? "" : String(v instanceof Date ? v.toISOString().slice(0, 10) : v).trim();
    });
    if (Object.values(registro).some((v) => v !== "")) linhas.push(registro);
  });
  return linhas;
}

export async function prepararPreview(entidade: EntidadeImportavel, buffer: Buffer, nomeArquivo: string): Promise<PreviewImportacao> {
  const linhas = await parsearArquivo(buffer, nomeArquivo);
  const colunas = linhas.length > 0 ? Object.keys(linhas[0]) : [];

  const aliases = ALIASES[entidade];
  const sugestaoMapeamento: Record<string, string | null> = {};
  for (const coluna of colunas) {
    sugestaoMapeamento[coluna] = aliases[normalizarCabecalho(coluna)] ?? null;
  }

  const importId = randomUUID();
  cacheImportacoes.set(importId, { entidade, linhas });

  return {
    importId,
    colunas,
    sugestaoMapeamento,
    linhasPreview: linhas.slice(0, 10),
    totalLinhas: linhas.length,
    camposDisponiveis: CAMPOS[entidade],
  };
}

export interface ErroImportacao {
  linha: number;
  motivo: string;
}

export interface ResultadoImportacao {
  total: number;
  sucesso: number;
  erros: ErroImportacao[];
}

function paraNumero(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function paraData(v: string | undefined): Date | null {
  if (v === undefined || v.trim() === "") return null;
  const s = v.trim();
  // aceita DD/MM/AAAA ou AAAA-MM-DD
  const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }
  return null;
}

function paraBooleano(v: string | undefined, padrao: boolean): boolean {
  if (v === undefined || v.trim() === "") return padrao;
  return ["true", "1", "sim", "yes", "ativo"].includes(v.trim().toLowerCase());
}

async function resolverPessoaPorNome(nome: string | undefined): Promise<number | undefined> {
  if (!nome || !nome.trim()) return undefined;
  const pessoa = await prisma.pessoa.findFirst({ where: { nome: { equals: nome.trim() } } });
  return pessoa?.id;
}

async function importarLinhaProjeto(linha: Record<string, string>, mapa: Record<string, string>): Promise<void> {
  const campo = (chave: string) => linha[Object.keys(mapa).find((col) => mapa[col] === chave) ?? ""];

  const nome = campo("nome")?.trim();
  if (!nome) throw new Error("nome é obrigatório");

  const statusBruto = campo("status")?.trim();
  const status: StatusProjeto = (STATUS_PROJETO as readonly string[]).includes(statusBruto ?? "")
    ? (statusBruto as StatusProjeto)
    : "Planejamento";

  const tipoBruto = campo("tipo")?.trim();
  const tipo = (TIPO_PROJETO as readonly string[]).includes(tipoBruto ?? "") ? tipoBruto! : "Change";

  const prioridadeBruta = campo("prioridade")?.trim();
  const prioridade = (PRIORIDADE_PROJETO as readonly string[]).includes(prioridadeBruta ?? "") ? prioridadeBruta! : "Média";

  const progresso = paraNumero(campo("progresso")) ?? 0;
  const orcamento = paraNumero(campo("orcamento"));
  const gasto = paraNumero(campo("gasto"));
  const dataInicio = paraData(campo("data_inicio"));
  const dataFimPlanejada = paraData(campo("data_fim_planejada"));
  const sponsorId = await resolverPessoaPorNome(campo("sponsor"));

  if (dataInicio && dataFimPlanejada) {
    // Dado completo: passa pelo caminho de negócio normal (entrega 1) —
    // baseline é copiada automaticamente se o status já for de execução.
    const input: ProjetoCriarInput = {
      nome,
      status,
      tipo: tipo as any,
      prioridade: prioridade as any,
      progresso,
      orcamento,
      gasto,
      data_inicio: dataInicio,
      data_fim_planejada: dataFimPlanejada,
      sponsorId,
    };
    await criarProjeto(input);
  } else {
    // Dado incompleto: mesmo tratamento de "projeto legado" da entrega 2 —
    // nunca fabricar data. Fica marcado como estimado até ser regularizado.
    await prisma.projeto.create({
      data: {
        nome,
        status,
        tipo: tipo as any,
        prioridade: prioridade as any,
        progresso,
        orcamento,
        gasto,
        data_inicio: dataInicio,
        data_fim_planejada: null,
        dados_estimados: true,
        sponsorId,
      },
    });
  }
}

async function importarLinhaTarefa(linha: Record<string, string>, mapa: Record<string, string>): Promise<void> {
  const campo = (chave: string) => linha[Object.keys(mapa).find((col) => mapa[col] === chave) ?? ""];

  const nome = campo("nome")?.trim();
  if (!nome) throw new Error("nome é obrigatório");

  const nomeProjeto = campo("projeto")?.trim();
  if (!nomeProjeto) throw new Error("projeto é obrigatório");
  const projeto = await prisma.projeto.findFirst({ where: { nome: { equals: nomeProjeto } } });
  if (!projeto) throw new Error(`projeto "${nomeProjeto}" não encontrado`);

  const statusBruto = campo("status")?.trim();
  const status: StatusTarefa = (STATUS_TAREFA as readonly string[]).includes(statusBruto ?? "") ? (statusBruto as StatusTarefa) : "A Fazer";

  const prioridadeBruta = campo("prioridade")?.trim();
  const prioridade = (PRIORIDADE_PROJETO as readonly string[]).includes(prioridadeBruta ?? "") ? prioridadeBruta! : "Média";

  const estimativaHoras = paraNumero(campo("estimativa_horas"));
  const dataFimPlanejada = paraData(campo("data_fim_planejada"));
  const responsavelId = await resolverPessoaPorNome(campo("responsavel"));

  await criarTarefa({
    nome,
    projetoId: projeto.id,
    status,
    prioridade,
    estimativa_horas: estimativaHoras,
    data_fim_planejada: dataFimPlanejada,
    responsavelId,
  });
}

async function importarLinhaPessoa(linha: Record<string, string>, mapa: Record<string, string>): Promise<void> {
  const campo = (chave: string) => linha[Object.keys(mapa).find((col) => mapa[col] === chave) ?? ""];

  const nome = campo("nome")?.trim();
  if (!nome) throw new Error("nome é obrigatório");

  await prisma.pessoa.create({
    data: {
      nome,
      cargo: campo("cargo")?.trim() || null,
      email: campo("email")?.trim() || null,
      capacidade_horas_semana: paraNumero(campo("capacidade_horas_semana")) ?? 40,
      ativo: paraBooleano(campo("ativo"), true),
    },
  });
}

export async function confirmarImportacao(importId: string, mapeamento: Record<string, string | null>): Promise<ResultadoImportacao> {
  const cache = cacheImportacoes.get(importId);
  if (!cache) throw new Error("Importação expirada ou não encontrada — refaça o upload");

  const mapa: Record<string, string> = {};
  for (const [coluna, campoDestino] of Object.entries(mapeamento)) {
    if (campoDestino) mapa[coluna] = campoDestino;
  }

  const erros: ErroImportacao[] = [];
  let sucesso = 0;

  for (let i = 0; i < cache.linhas.length; i++) {
    try {
      if (cache.entidade === "projeto") await importarLinhaProjeto(cache.linhas[i], mapa);
      else if (cache.entidade === "tarefa") await importarLinhaTarefa(cache.linhas[i], mapa);
      else await importarLinhaPessoa(cache.linhas[i], mapa);
      sucesso++;
    } catch (err) {
      erros.push({ linha: i + 2, motivo: (err as Error).message }); // +2: linha 1 é cabeçalho, planilha começa em 1
    }
  }

  cacheImportacoes.delete(importId);
  return { total: cache.linhas.length, sucesso, erros };
}
