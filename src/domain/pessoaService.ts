import { prisma } from "../db";

export interface PessoaInput {
  nome: string;
  cargo?: string | null;
  email?: string | null;
  capacidade_horas_semana?: number;
  ativo?: boolean;
}

export interface PessoaEditInput {
  nome?: string;
  cargo?: string | null;
  email?: string | null;
  capacidade_horas_semana?: number;
  ativo?: boolean;
}

export async function listarPessoas() {
  return prisma.pessoa.findMany({ orderBy: { nome: "asc" } });
}

export async function criarPessoa(input: PessoaInput) {
  if (!input.nome || !input.nome.trim()) {
    throw new Error("nome é obrigatório");
  }
  return prisma.pessoa.create({
    data: {
      nome: input.nome.trim(),
      cargo: input.cargo ?? null,
      email: input.email ?? null,
      capacidade_horas_semana: input.capacidade_horas_semana ?? 40,
      ativo: input.ativo ?? true,
    },
  });
}

export async function atualizarPessoa(id: number, input: PessoaEditInput) {
  if (input.nome !== undefined && !input.nome.trim()) {
    throw new Error("nome não pode ficar vazio");
  }
  return prisma.pessoa.update({
    where: { id },
    data: {
      ...(input.nome !== undefined ? { nome: input.nome.trim() } : {}),
      ...(input.cargo !== undefined ? { cargo: input.cargo } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.capacidade_horas_semana !== undefined ? { capacidade_horas_semana: input.capacidade_horas_semana } : {}),
      ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
    },
  });
}

export async function excluirPessoa(id: number) {
  // Referências em Projeto.sponsor / Tarefa.responsavel / eventos ficam
  // null automaticamente (relação opcional) — não é preciso limpar à mão.
  await prisma.pessoa.delete({ where: { id } });
}
