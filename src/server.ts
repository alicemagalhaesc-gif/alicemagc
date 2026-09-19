import "dotenv/config";
import path from "node:path";
import { existsSync } from "node:fs";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer from "multer";
import { prisma, garantirTriggersDeImutabilidade } from "./db";
import { montarPayloadDashboard } from "./domain/dashboardService";
import { prepararPreview, confirmarImportacao, EntidadeImportavel } from "./domain/importService";
import { executarConsulta, ENTIDADES, ConsultaExplorer } from "./domain/explorerService";
import { listarPessoas, criarPessoa, atualizarPessoa, excluirPessoa } from "./domain/pessoaService";
import { listarTarefas, criarTarefa, atualizarTarefa, atualizarStatusTarefa, excluirTarefa } from "./domain/tarefaService";
import { STATUS_TAREFA, PRIORIDADE_PROJETO } from "./domain/constants";
import { autenticar, gerarToken, verificarToken, buscarUsuarioLogado } from "./domain/authService";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const NOME_COOKIE = "token";

declare global {
  namespace Express {
    interface Request {
      usuarioId?: number;
    }
  }
}

function exigirAutenticacao(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[NOME_COOKIE];
  const payload = token ? verificarToken(token) : null;
  if (!payload) return res.status(401).json({ erro: "Não autenticado" });
  req.usuarioId = payload.usuarioId;
  next();
}

// --- Autenticação ---

app.post("/api/login", async (req, res) => {
  try {
    const { email, senha } = req.body as { email?: string; senha?: string };
    if (!email || !senha) return res.status(400).json({ erro: "Informe email e senha" });

    const usuario = await autenticar(email, senha);
    const token = gerarToken(usuario.id);
    res.cookie(NOME_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.json(usuario);
  } catch (err) {
    res.status(401).json({ erro: (err as Error).message });
  }
});

app.post("/api/logout", (_req, res) => {
  res.clearCookie(NOME_COOKIE);
  res.status(204).end();
});

app.get("/api/me", async (req, res) => {
  const token = req.cookies?.[NOME_COOKIE];
  const payload = token ? verificarToken(token) : null;
  if (!payload) return res.status(401).json({ erro: "Não autenticado" });
  const usuario = await buscarUsuarioLogado(payload.usuarioId);
  if (!usuario) return res.status(401).json({ erro: "Não autenticado" });
  res.json(usuario);
});

app.use("/api", (req, res, next) => {
  if (req.path === "/login" || req.path === "/logout" || req.path === "/me") return next();
  exigirAutenticacao(req, res, next);
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const projetoIdRaw = req.query.projetoId;
    const projetoId = typeof projetoIdRaw === "string" && projetoIdRaw !== "" ? Number(projetoIdRaw) : undefined;
    if (projetoId !== undefined && !Number.isInteger(projetoId)) {
      return res.status(400).json({ erro: "projetoId inválido" });
    }
    const payload = await montarPayloadDashboard(new Date(), projetoId);
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Falha ao montar o dashboard" });
  }
});

// --- Importação de planilha (CSV/XLSX) ---

app.post("/api/import/preview", upload.single("arquivo"), async (req, res) => {
  try {
    const entidade = req.body.entidade as EntidadeImportavel;
    if (!["projeto", "tarefa", "pessoa"].includes(entidade)) {
      return res.status(400).json({ erro: "entidade inválida" });
    }
    if (!req.file) {
      return res.status(400).json({ erro: "arquivo não enviado" });
    }
    const preview = await prepararPreview(entidade, req.file.buffer, req.file.originalname);
    res.json(preview);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: (err as Error).message });
  }
});

app.post("/api/import/commit", async (req, res) => {
  try {
    const { importId, mapeamento } = req.body as { importId: string; mapeamento: Record<string, string | null> };
    const resultado = await confirmarImportacao(importId, mapeamento);
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: (err as Error).message });
  }
});

// --- Explorador de dados (filtros + agrupamento) ---

app.get("/api/explorer/entidades", (_req, res) => {
  res.json(ENTIDADES);
});

app.post("/api/explorer/query", async (req, res) => {
  try {
    const consulta = req.body as ConsultaExplorer;
    const resultado = await executarConsulta(consulta);
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: (err as Error).message });
  }
});

// --- Pessoas (recursos do escritório de projetos) ---

app.get("/api/pessoas", async (_req, res) => {
  try {
    res.json(await listarPessoas());
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Falha ao listar pessoas" });
  }
});

app.post("/api/pessoas", async (req, res) => {
  try {
    res.status(201).json(await criarPessoa(req.body));
  } catch (err) {
    res.status(400).json({ erro: (err as Error).message });
  }
});

app.put("/api/pessoas/:id", async (req, res) => {
  try {
    res.json(await atualizarPessoa(Number(req.params.id), req.body));
  } catch (err) {
    res.status(400).json({ erro: (err as Error).message });
  }
});

app.delete("/api/pessoas/:id", async (req, res) => {
  try {
    await excluirPessoa(Number(req.params.id));
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ erro: (err as Error).message });
  }
});

// --- Tarefas ---

app.get("/api/tarefas", async (_req, res) => {
  try {
    res.json(await listarTarefas());
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Falha ao listar tarefas" });
  }
});

app.post("/api/tarefas", async (req, res) => {
  try {
    res.status(201).json(await criarTarefa(req.body));
  } catch (err) {
    res.status(400).json({ erro: (err as Error).message });
  }
});

app.put("/api/tarefas/:id", async (req, res) => {
  try {
    const { novoStatus, ...resto } = req.body as { novoStatus?: string; [k: string]: unknown };
    if (novoStatus) {
      await atualizarStatusTarefa(Number(req.params.id), { novoStatus: novoStatus as any });
    }
    if (Object.keys(resto).length > 0) {
      await atualizarTarefa(Number(req.params.id), resto);
    }
    const [tarefa] = (await listarTarefas()).filter((t) => t.id === Number(req.params.id));
    res.json(tarefa);
  } catch (err) {
    res.status(400).json({ erro: (err as Error).message });
  }
});

app.delete("/api/tarefas/:id", async (req, res) => {
  try {
    await excluirTarefa(Number(req.params.id));
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ erro: (err as Error).message });
  }
});

// --- Listas auxiliares pra formulários (dropdowns) ---

app.get("/api/projetos/lista", async (_req, res) => {
  try {
    const projetos = await prisma.projeto.findMany({
      where: { status: { not: "Cancelado" } },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    });
    res.json(projetos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Falha ao listar projetos" });
  }
});

app.get("/api/opcoes", (_req, res) => {
  res.json({ statusTarefa: STATUS_TAREFA, prioridade: PRIORIDADE_PROJETO });
});

// --- Frontend (build do React/Vite) ---
// Em produção o mesmo processo Node serve a API e os arquivos estáticos do
// dashboard — uma URL só, sem CORS entre serviços separados. Em dev local
// (`npm run dev` dentro de web/) o Vite continua servindo com proxy pro
// :4000, então esta pasta pode não existir — por isso o `existsSync`.
const pastaFrontend = path.join(__dirname, "..", "web", "dist");
if (existsSync(pastaFrontend)) {
  app.use(express.static(pastaFrontend));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(pastaFrontend, "index.html"));
  });
}

const PORTA = Number(process.env.PORT ?? 4000);

async function iniciar() {
  await garantirTriggersDeImutabilidade();
  app.listen(PORTA, () => {
    console.log(`Servidor no ar em http://localhost:${PORTA}`);
  });
}

iniciar().catch((err) => {
  console.error("Falha ao iniciar o servidor:", err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
