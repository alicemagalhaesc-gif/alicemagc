import { prisma } from "../db";
import { hojeBahia } from "./datetime";
import { StatusTarefa, DEBOUNCE_ATIVIDADE_MS } from "./constants";

/**
 * ATENÇÃO: data_inicio, data_conclusao, data_bloqueio e data_criacao NÃO
 * aparecem aqui. São controladas exclusivamente pelos gatilhos de
 * atualizarStatusTarefa (seção 6.5) — ninguém as digita manualmente.
 */
export interface TarefaEditInput {
  nome?: string;
  prioridade?: string;
  data_fim_planejada?: Date | null;
  responsavelId?: number | null;
  estimativa_horas?: number | null;
}

export interface TarefaCriarInput extends TarefaEditInput {
  nome: string;
  projetoId: number;
  status: StatusTarefa;
}

const CAMPOS_EDITAVEIS = [
  "nome",
  "prioridade",
  "data_fim_planejada",
  "responsavelId",
  "estimativa_horas",
] as const;

function filtrarCamposEditaveis<T extends object>(input: T): Partial<T> {
  const origem = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const chave of CAMPOS_EDITAVEIS) {
    if (chave in origem) {
      out[chave] = origem[chave];
    }
  }
  return out as Partial<T>;
}

function deveGravarAtividade(ultima: Date | null, agora: Date): boolean {
  if (!ultima) return true;
  return agora.getTime() - ultima.getTime() >= DEBOUNCE_ATIVIDADE_MS;
}

/**
 * 6.6 Qualquer escrita em Tarefa atualiza data_ultima_atividade do projeto
 * pai (debounce de 1h). NUNCA atualiza data_ultimo_status_report.
 */
async function bumpAtividadeProjeto(projetoId: number, agora: Date) {
  const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: projetoId } });
  if (deveGravarAtividade(projeto.data_ultima_atividade, agora)) {
    await prisma.projeto.update({
      where: { id: projetoId },
      data: { data_ultima_atividade: agora },
    });
  }
}

export async function listarTarefas() {
  return prisma.tarefa.findMany({
    include: { projeto: { select: { id: true, nome: true } }, responsavel: { select: { id: true, nome: true } } },
    orderBy: { id: "desc" },
  });
}

/** Apaga a tarefa e seu histórico de eventos (TarefaEvento é filho obrigatório dela). */
export async function excluirTarefa(id: number) {
  await prisma.$transaction([
    prisma.tarefaEvento.deleteMany({ where: { tarefaId: id } }),
    prisma.tarefa.delete({ where: { id } }),
  ]);
}

export async function criarTarefa(input: TarefaCriarInput, agora: Date = new Date()) {
  const patch = filtrarCamposEditaveis(input) as TarefaEditInput;

  const tarefa = await prisma.tarefa.create({
    data: {
      ...patch,
      projetoId: input.projetoId,
      status: input.status,
      data_criacao: agora,
    } as any,
  });

  // 4. Registrar em TODA mudança de status de tarefa, incluindo a criação.
  await prisma.tarefaEvento.create({
    data: {
      tarefaId: tarefa.id,
      projetoId: input.projetoId,
      de_status: null,
      para_status: tarefa.status,
      timestamp: agora,
    },
  });

  await bumpAtividadeProjeto(input.projetoId, agora);

  return tarefa;
}

/** Edição de campos "normais" da tarefa — nunca mexe em status ou datas controladas por gatilho. */
export async function atualizarTarefa(id: number, input: TarefaEditInput, agora: Date = new Date()) {
  const atual = await prisma.tarefa.findUniqueOrThrow({ where: { id } });
  const patch = filtrarCamposEditaveis(input);

  const tarefa = await prisma.tarefa.update({ where: { id }, data: patch as any });
  await bumpAtividadeProjeto(atual.projetoId, agora);
  return tarefa;
}

export interface AtualizarStatusTarefaInput {
  novoStatus: StatusTarefa;
  usuarioId?: number;
}

/**
 * 6.5 Único caminho para mudar o status de uma tarefa. Aplica os gatilhos
 * de data_inicio/data_conclusao/data_bloqueio e grava o evento em
 * TarefaEvento (append-only).
 */
export async function atualizarStatusTarefa(
  id: number,
  input: AtualizarStatusTarefaInput,
  agora: Date = new Date()
) {
  const atual = await prisma.tarefa.findUniqueOrThrow({ where: { id } });
  const novoStatus = input.novoStatus;

  if (novoStatus === atual.status) {
    return atual; // não é uma mudança — não gera evento nem toca datas
  }

  const hoje = hojeBahia(agora);
  const data: Record<string, unknown> = { status: novoStatus };

  // Entrando em "Em Andamento": só preenche data_inicio se ainda vazia.
  if (novoStatus === "Em Andamento" && atual.data_inicio === null) {
    data.data_inicio = hoje;
  }

  // Entrando em "Concluído": só preenche data_conclusao se ainda vazia.
  if (novoStatus === "Concluído" && atual.data_conclusao === null) {
    data.data_conclusao = hoje;
  }
  // Saindo de "Concluído" (reabertura): limpa data_conclusao, mantém data_inicio.
  if (atual.status === "Concluído" && novoStatus !== "Concluído") {
    data.data_conclusao = null;
  }

  // Entrando em "Bloqueado": só preenche data_bloqueio se ainda vazia.
  if (novoStatus === "Bloqueado" && atual.data_bloqueio === null) {
    data.data_bloqueio = hoje;
  }
  // Saindo de "Bloqueado": limpa data_bloqueio (histórico fica em TarefaEvento).
  if (atual.status === "Bloqueado" && novoStatus !== "Bloqueado") {
    data.data_bloqueio = null;
  }

  const [tarefaAtualizada] = await prisma.$transaction([
    prisma.tarefa.update({ where: { id }, data: data as any }),
    prisma.tarefaEvento.create({
      data: {
        tarefaId: id,
        projetoId: atual.projetoId,
        de_status: atual.status,
        para_status: novoStatus,
        timestamp: agora,
        usuarioId: input.usuarioId,
      },
    }),
  ]);

  // 6.6 Atualiza data_ultima_atividade do projeto, NUNCA data_ultimo_status_report.
  await bumpAtividadeProjeto(atual.projetoId, agora);

  return tarefaAtualizada;
}
