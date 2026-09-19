import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-troque-em-producao";
const JWT_EXPIRA_EM = "30d";

export interface UsuarioLogado {
  id: number;
  nome: string;
  email: string;
}

export interface TokenPayload {
  usuarioId: number;
}

export async function autenticar(email: string, senha: string): Promise<UsuarioLogado> {
  const pessoa = await prisma.pessoa.findFirst({ where: { email: email.trim().toLowerCase() } });
  if (!pessoa || !pessoa.senha_hash) throw new Error("Email ou senha inválidos");

  const senhaOk = await bcrypt.compare(senha, pessoa.senha_hash);
  if (!senhaOk) throw new Error("Email ou senha inválidos");

  return { id: pessoa.id, nome: pessoa.nome, email: pessoa.email! };
}

export function gerarToken(usuarioId: number): string {
  const payload: TokenPayload = { usuarioId };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRA_EM });
}

export function verificarToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export async function buscarUsuarioLogado(usuarioId: number): Promise<UsuarioLogado | null> {
  const pessoa = await prisma.pessoa.findUnique({ where: { id: usuarioId } });
  if (!pessoa || !pessoa.senha_hash || !pessoa.email) return null;
  return { id: pessoa.id, nome: pessoa.nome, email: pessoa.email };
}

export async function definirSenha(pessoaId: number, novaSenha: string): Promise<void> {
  if (novaSenha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres");
  const senha_hash = await bcrypt.hash(novaSenha, 10);
  await prisma.pessoa.update({ where: { id: pessoaId }, data: { senha_hash } });
}

export async function criarUsuario(nome: string, email: string, senha: string): Promise<UsuarioLogado> {
  const emailNormalizado = email.trim().toLowerCase();
  const existente = await prisma.pessoa.findFirst({ where: { email: emailNormalizado } });
  if (existente) throw new Error(`Já existe uma pessoa cadastrada com o email ${emailNormalizado}`);
  if (senha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres");

  const senha_hash = await bcrypt.hash(senha, 10);
  const pessoa = await prisma.pessoa.create({
    data: { nome, email: emailNormalizado, senha_hash },
  });
  return { id: pessoa.id, nome: pessoa.nome, email: pessoa.email! };
}
