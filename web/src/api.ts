import type { DashboardPayload } from "./types";

export async function buscarDashboard(projetoId?: number): Promise<DashboardPayload> {
  const url = projetoId ? `/api/dashboard?projetoId=${projetoId}` : "/api/dashboard";
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Falha ao carregar dashboard (${resposta.status})`);
  return resposta.json();
}
