import { useEffect, useState } from "react";
import { buscarDashboard } from "../api";
import type { DashboardPayload, StatusRagOuPausado } from "../types";
import { DashboardView } from "../components/DashboardView";

const EMOJI_SAUDE: Record<StatusRagOuPausado, string> = {
  vermelho: "🔴",
  amarelo: "🟡",
  verde: "🟢",
  cinza: "⚪",
  pausado: "⏸️",
};

/**
 * Mesmo dashboard da aba "Dashboard" (mesmos cards, gráficos, cores e
 * indicadores — DashboardView é o componente compartilhado), só que com um
 * dropdown no topo para escolher o projeto. Nada de KPI novo, nada de
 * layout novo.
 */
export function ProjectListPage({
  projetoSelecionadoId,
  onSelecionarProjeto,
}: {
  projetoSelecionadoId: number | null;
  onSelecionarProjeto: (id: number | null) => void;
}) {
  const [listaCompleta, setListaCompleta] = useState<DashboardPayload | null>(null);
  const [dadosEscopo, setDadosEscopo] = useState<DashboardPayload | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Lista completa de projetos — carrega uma vez, alimenta o dropdown de seleção.
  useEffect(() => {
    buscarDashboard()
      .then(setListaCompleta)
      .catch((e) => setErro(e.message));
  }, []);

  // Dashboard escopado ao projeto selecionado — mesma rota, com ?projetoId=.
  useEffect(() => {
    if (projetoSelecionadoId === null) {
      setDadosEscopo(null);
      return;
    }
    setDadosEscopo(null);
    buscarDashboard(projetoSelecionadoId)
      .then(setDadosEscopo)
      .catch((e) => setErro(e.message));
  }, [projetoSelecionadoId]);

  if (erro) return <div className="error">Erro ao carregar projetos: {erro}</div>;
  if (!listaCompleta) return <div className="loading">Carregando…</div>;

  const projetoSelecionado = listaCompleta.tabela_projetos.find((p) => p.id === projetoSelecionadoId);

  return (
    <div>
      <h2 className="page-title">Dashboard por Projeto</h2>
      <p className="page-sub">Selecione um projeto para ver o mesmo dashboard, com o escopo desse projeto só.</p>

      <div className="field-row">
        <select
          value={projetoSelecionadoId ?? ""}
          onChange={(e) => onSelecionarProjeto(e.target.value ? Number(e.target.value) : null)}
          style={{ minWidth: 320 }}
        >
          <option value="">— Selecione um projeto —</option>
          {listaCompleta.tabela_projetos.map((p) => (
            <option key={p.id} value={p.id}>
              {EMOJI_SAUDE[p.saude]} {p.nome} ({p.status})
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 24 }}>
        {projetoSelecionadoId === null && (
          <div className="empty-state" style={{ height: 80 }}>
            Selecione um projeto acima para ver o dashboard dele.
          </div>
        )}
        {projetoSelecionadoId !== null && !dadosEscopo && <div className="loading">Carregando dashboard do projeto…</div>}
        {dadosEscopo && (
          <DashboardView
            dados={dadosEscopo}
            titulo={`Dashboard — ${projetoSelecionado?.nome ?? ""}`}
            onAbrirProjeto={onSelecionarProjeto}
          />
        )}
      </div>
    </div>
  );
}
