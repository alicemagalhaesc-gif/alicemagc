import { useEffect, useState } from "react";
import { buscarDashboard } from "../api";
import type { DashboardPayload } from "../types";
import { DashboardView } from "../components/DashboardView";

export function DashboardPage({ onAbrirProjeto }: { onAbrirProjeto: (id: number) => void }) {
  const [dados, setDados] = useState<DashboardPayload | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    buscarDashboard()
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, []);

  if (erro) return <div className="error">Erro ao carregar dashboard: {erro}</div>;
  if (!dados) return <div className="loading">Carregando…</div>;

  return <DashboardView dados={dados} titulo="Dashboard do Portfólio" onAbrirProjeto={onAbrirProjeto} />;
}
