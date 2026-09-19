import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { normalizarCabecalho, parsearArquivo } from "./importService";

/**
 * Importador do export "Planilha de Tarefas" do MS Project (EAP completa).
 * Diferente do importarService genérico: aqui as colunas são conhecidas de
 * antemão (formato fixo do MS Project), então não há tela de mapeamento —
 * é upload -> preview -> confirmar.
 *
 * Linha de EDT sem ponto (ex: "1") é o próprio projeto, não uma tarefa.
 * MS Project aqui só fornece dados de PLANEJAMENTO (datas, custo, recurso
 * alocado) — nunca progresso/status real, que continuam vindo de fora
 * (Jira ou edição manual). Por isso o importador nunca escreve em
 * Tarefa.status/Projeto.progresso.
 */

const ALIASES_COLUNA: Record<string, string[]> = {
  edt: ["edt", "wbs"],
  nome: ["nome", "nome da tarefa"],
  duracao: ["duracao", "duração"],
  predecessoras: ["predecessoras"],
  inicio: ["inicio", "início"],
  termino: ["termino", "término"],
  recursos: ["nomes dos recursos", "nome dos recursos", "recursos"],
  marco: ["marco"],
  custo: ["custo"],
};

function localizarColuna(colunas: string[], chave: keyof typeof ALIASES_COLUNA): string | null {
  const aliases = ALIASES_COLUNA[chave];
  for (const col of colunas) {
    if (aliases.includes(normalizarCabecalho(col))) return col;
  }
  return null;
}

function paraDataMsProject(v: string | undefined): Date | null {
  if (!v || !v.trim()) return null;
  const semDiaSemana = v.trim().replace(/^[A-Za-zÀ-ÿ]{3}\s+/, "");
  const m = semDiaSemana.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, d, mo, yRaw] = m;
  const ano = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
  return new Date(Date.UTC(ano, Number(mo) - 1, Number(d)));
}

// Custo do MS Project vem como "R$ 46,580.78" — vírgula de milhar, ponto
// decimal (diferente do paraNumero() do importador genérico, que assume
// vírgula decimal). Não reaproveitar aquele helper aqui.
function paraCustoMsProject(v: string | undefined): number | null {
  if (!v || !v.trim()) return null;
  const limpo = v.replace(/R\$\s?/g, "").replace(/,/g, "").trim();
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

// Calendário padrão do MS Project: 8h = 1 dia útil.
function paraDuracaoDias(v: string | undefined): number | null {
  if (!v || !v.trim()) return null;
  const m = v.trim().match(/^([\d.,]+)\s*(dias?|hrs?|horas?)$/i);
  if (!m) return null;
  const valor = Number(m[1].replace(",", "."));
  if (!Number.isFinite(valor)) return null;
  const ehHora = /^h/i.test(m[2]);
  return ehHora ? valor / 8 : valor;
}

export interface RecursoAlocado {
  nome: string;
  percentual: number;
}

// "Fulano (apoio) [27%],Ciclano (Maria) [11%]" -> lista de {nome, percentual}
function paraRecursos(v: string | undefined): RecursoAlocado[] {
  if (!v || !v.trim()) return [];
  return v
    .split(",")
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((parte) => {
      const m = parte.match(/^(.*?)\s*\[(\d+(?:[.,]\d+)?)%\]$/);
      if (!m) return { nome: parte, percentual: 100 };
      return { nome: m[1].trim(), percentual: Number(m[2].replace(",", ".")) };
    });
}

function fmtData(d: Date | null): string {
  if (!d) return "—";
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getUTCFullYear()}`;
}

interface LinhaMsProject {
  edt: string;
  nome: string;
  duracao_dias: number | null;
  predecessoras_raw: string | null;
  data_inicio: Date | null;
  data_fim_planejada: Date | null;
  recursos: RecursoAlocado[];
  eh_marco: boolean;
  custo_planejado: number | null;
}

function parsearLinhas(registros: Record<string, string>[]): LinhaMsProject[] {
  if (registros.length === 0) return [];
  const colunas = Object.keys(registros[0]);

  const colEdt = localizarColuna(colunas, "edt");
  const colNome = localizarColuna(colunas, "nome");
  if (!colEdt || !colNome) {
    throw new Error('Não encontrei as colunas "EDT" e "Nome" no arquivo — confira se é um export de Planilha de Tarefas do MS Project.');
  }
  const colDuracao = localizarColuna(colunas, "duracao");
  const colPredecessoras = localizarColuna(colunas, "predecessoras");
  const colInicio = localizarColuna(colunas, "inicio");
  const colTermino = localizarColuna(colunas, "termino");
  const colRecursos = localizarColuna(colunas, "recursos");
  const colMarco = localizarColuna(colunas, "marco");
  const colCusto = localizarColuna(colunas, "custo");

  return registros
    .filter((r) => r[colEdt]?.trim())
    .map((r) => ({
      edt: r[colEdt].trim(),
      nome: (r[colNome] ?? "").trim(),
      duracao_dias: colDuracao ? paraDuracaoDias(r[colDuracao]) : null,
      predecessoras_raw: colPredecessoras && r[colPredecessoras]?.trim() ? r[colPredecessoras].trim() : null,
      data_inicio: colInicio ? paraDataMsProject(r[colInicio]) : null,
      data_fim_planejada: colTermino ? paraDataMsProject(r[colTermino]) : null,
      recursos: colRecursos ? paraRecursos(r[colRecursos]) : [],
      eh_marco: colMarco ? normalizarCabecalho(r[colMarco] ?? "") === "sim" : false,
      custo_planejado: colCusto ? paraCustoMsProject(r[colCusto]) : null,
    }));
}

export interface PreviewMsProject {
  importId: string;
  nomeProjeto: string;
  projetoExistente: boolean;
  totalLinhas: number;
  totalMarcos: number;
  recursosDetectados: string[];
  linhasPreview: { edt: string; nome: string; inicio: string; termino: string; marco: boolean }[];
  avisos: string[];
}

const cacheImportacoesMsProject = new Map<string, { linhaProjeto: LinhaMsProject; linhas: LinhaMsProject[] }>();

export async function prepararPreviewMsProject(buffer: Buffer, nomeArquivo: string): Promise<PreviewMsProject> {
  const registros = await parsearArquivo(buffer, nomeArquivo);
  const todasLinhas = parsearLinhas(registros);

  const linhaProjeto = todasLinhas.find((l) => /^\d+$/.test(l.edt));
  if (!linhaProjeto) {
    throw new Error("Não encontrei a linha do projeto (EDT de nível 1, ex: \"1\") no arquivo — confira se o export inclui a EAP inteira.");
  }
  if (!linhaProjeto.data_inicio || !linhaProjeto.data_fim_planejada) {
    throw new Error("Não consegui ler as datas de início/término da linha do projeto (EDT 1) — confira o formato de data do arquivo.");
  }

  const linhas = todasLinhas.filter((l) => l !== linhaProjeto);
  const avisos: string[] = [];

  const existente = await prisma.projeto.findFirst({ where: { nome: linhaProjeto.nome } });
  if (existente?.data_fim_baseline && linhaProjeto.data_fim_planejada.getTime() !== existente.data_fim_baseline.getTime()) {
    avisos.push(
      `O término do projeto no MS Project (${fmtData(linhaProjeto.data_fim_planejada)}) é diferente da baseline já registrada no sistema (${fmtData(
        existente.data_fim_baseline
      )}). A baseline NÃO será alterada por este import — use "Revisar baseline" no site se isso for uma mudança formal.`
    );
  }

  const importId = randomUUID();
  cacheImportacoesMsProject.set(importId, { linhaProjeto, linhas });

  const recursosDetectados = [...new Set(linhas.flatMap((l) => l.recursos.map((r) => r.nome)))].sort();

  return {
    importId,
    nomeProjeto: linhaProjeto.nome,
    projetoExistente: !!existente,
    totalLinhas: linhas.length,
    totalMarcos: linhas.filter((l) => l.eh_marco).length,
    recursosDetectados,
    linhasPreview: linhas
      .slice(0, 8)
      .map((l) => ({ edt: l.edt, nome: l.nome, inicio: fmtData(l.data_inicio), termino: fmtData(l.data_fim_planejada), marco: l.eh_marco })),
    avisos,
  };
}

export interface ResultadoImportacaoMsProject {
  projeto: { id: number; nome: string; criado: boolean };
  tarefasCriadas: number;
  tarefasAtualizadas: number;
  pessoasCriadas: number;
  avisos: string[];
  erros: { edt: string; motivo: string }[];
}

export async function confirmarImportacaoMsProject(importId: string): Promise<ResultadoImportacaoMsProject> {
  const cache = cacheImportacoesMsProject.get(importId);
  if (!cache) throw new Error("Importação expirada ou não encontrada — refaça o upload");
  const { linhaProjeto, linhas } = cache;
  const avisos: string[] = [];
  const erros: { edt: string; motivo: string }[] = [];
  const agora = new Date();

  let projeto = await prisma.projeto.findFirst({ where: { nome: linhaProjeto.nome } });
  let projetoCriado = false;

  if (!projeto) {
    projeto = await prisma.projeto.create({
      data: {
        nome: linhaProjeto.nome,
        status: "Planejamento",
        data_inicio: linhaProjeto.data_inicio,
        data_fim_planejada: linhaProjeto.data_fim_planejada,
        // Baseline é capturada já na 1a importação — para um projeto vindo
        // do MS Project, o cronograma exportado É o compromisso original,
        // independente do status escolhido depois (diferente da regra de
        // criarProjeto(), que só grava baseline ao entrar em execução).
        data_fim_baseline: linhaProjeto.data_fim_planejada,
        data_fim_baseline_original: linhaProjeto.data_fim_planejada,
        orcamento: linhaProjeto.custo_planejado,
        origem_dados: "msproject",
        data_ultimo_status_report: agora,
        data_ultima_atividade: agora,
      },
    });
    projetoCriado = true;
  } else {
    if (projeto.data_fim_baseline && linhaProjeto.data_fim_planejada!.getTime() !== projeto.data_fim_baseline.getTime()) {
      avisos.push(
        `Término no MS Project (${fmtData(linhaProjeto.data_fim_planejada)}) diverge da baseline registrada (${fmtData(
          projeto.data_fim_baseline
        )}) — baseline não foi alterada. Revise manualmente se for uma mudança formal.`
      );
    }
    projeto = await prisma.projeto.update({
      where: { id: projeto.id },
      data: {
        data_inicio: linhaProjeto.data_inicio ?? undefined,
        data_fim_planejada: linhaProjeto.data_fim_planejada ?? undefined,
        orcamento: linhaProjeto.custo_planejado ?? undefined,
        origem_dados: "msproject",
        data_ultima_atividade: agora,
      },
    });
  }

  const nomesRecursos = [...new Set(linhas.flatMap((l) => l.recursos.map((r) => r.nome)))];
  const mapaPessoas = new Map<string, number>();
  let pessoasCriadas = 0;
  for (const nome of nomesRecursos) {
    let pessoa = await prisma.pessoa.findFirst({ where: { nome } });
    if (!pessoa) {
      pessoa = await prisma.pessoa.create({ data: { nome, capacidade_horas_semana: 40, ativo: true } });
      pessoasCriadas++;
    }
    mapaPessoas.set(nome, pessoa.id);
  }

  let tarefasCriadas = 0;
  let tarefasAtualizadas = 0;
  for (const linha of linhas) {
    try {
      const principal = [...linha.recursos].sort((a, b) => b.percentual - a.percentual)[0];
      const responsavelId = principal ? mapaPessoas.get(principal.nome) ?? null : null;

      const dadosComuns = {
        nome: linha.nome,
        data_fim_planejada: linha.data_fim_planejada,
        responsavelId,
        eh_marco: linha.eh_marco,
        duracao_dias: linha.duracao_dias,
        custo_planejado: linha.custo_planejado,
        predecessoras_raw: linha.predecessoras_raw,
      };

      const existente = await prisma.tarefa.findFirst({ where: { projetoId: projeto.id, edt: linha.edt } });
      let tarefaId: number;
      if (existente) {
        await prisma.tarefa.update({ where: { id: existente.id }, data: dadosComuns });
        tarefaId = existente.id;
        tarefasAtualizadas++;
        await prisma.tarefaRecurso.deleteMany({ where: { tarefaId } });
      } else {
        const nova = await prisma.tarefa.create({
          data: { ...dadosComuns, projetoId: projeto.id, edt: linha.edt, status: "A Fazer" },
        });
        tarefaId = nova.id;
        tarefasCriadas++;
        await prisma.tarefaEvento.create({
          data: { tarefaId, projetoId: projeto.id, de_status: null, para_status: "A Fazer", timestamp: agora },
        });
      }

      if (linha.recursos.length > 0) {
        await prisma.tarefaRecurso.createMany({
          data: linha.recursos.map((r) => ({ tarefaId, pessoaId: mapaPessoas.get(r.nome)!, percentual_alocacao: r.percentual })),
        });
      }
    } catch (err) {
      erros.push({ edt: linha.edt, motivo: (err as Error).message });
    }
  }

  cacheImportacoesMsProject.delete(importId);

  return {
    projeto: { id: projeto.id, nome: projeto.nome, criado: projetoCriado },
    tarefasCriadas,
    tarefasAtualizadas,
    pessoasCriadas,
    avisos,
    erros,
  };
}
