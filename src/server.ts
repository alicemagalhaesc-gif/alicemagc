import "dotenv/config";
import path from "node:path";
import { existsSync } from "node:fs";
import express from "express";
import cors from "cors";
import multer from "multer";
import { prisma, garantirTriggersDeImutabilidade } from "./db";
import { montarPayloadDashboard } from "./domain/dashboardService";
import { prepararPreview, confirmarImportacao, EntidadeImportavel } from "./domain/importService";
import { executarConsulta, ENTIDADES, ConsultaExplorer } from "./domain/explorerService";

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
