import type { DashboardPayload, StatusRag } from "../types";
import { StatusDot, Tooltip } from "./Common";
import { pct, moeda, dias, num } from "../format";

function CelulaNumOuTraco({ valor, texto, motivo }: { valor: number | null; texto: string; motivo: string | null }) {
  if (valor === null) {
    return (
      <td className="cell-num cell-muted">
        <Tooltip text={motivo ?? "sem dado"}>—</Tooltip>
      </td>
    );
  }
  return <td className="cell-num">{texto}</td>;
}

export function ProjectsTable({
  linhas,
  filtroSaude,
  onAbrirProjeto,
  titulo = "Projetos Recentes",
}: {
  linhas: DashboardPayload["tabela_projetos"];
  filtroSaude: StatusRag | null;
  onAbrirProjeto: (id: number) => void;
  titulo?: string;
}) {
  const visiveis = filtroSaude ? linhas.filter((l) => l.saude === filtroSaude) : linhas;

  return (
    <div className="chart-card" style={{ overflowX: "auto" }}>
      <h3>
        {titulo} {filtroSaude && <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>· filtrado por {filtroSaude}</span>}
      </h3>
      <table className="projects-table">
        <thead>
          <tr>
            <th>Saúde</th>
            <th>Projeto</th>
            <th>Área</th>
            <th>Status</th>
            <th>Progresso</th>
            <th>
              <Tooltip text="Progresso dividido pelo prazo decorrido. Assume avanço linear; suprimido nos primeiros 20% do prazo.">
                Ritmo
              </Tooltip>
            </th>
            <th>CPI</th>
            <th>Dias de Atraso</th>
            <th>Orçamento</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((l) => (
            <tr key={l.id}>
              <td>
                <StatusDot status={l.saude} />
              </td>
              <td>
                <button
                  onClick={() => onAbrirProjeto(l.id)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    font: "inherit",
                    color: "var(--series-1)",
                    cursor: "pointer",
                    textDecoration: "underline",
                    textDecorationColor: "transparent",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = "currentColor")}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = "transparent")}
                >
                  {l.nome}
                </button>
                {l.dados_estimados && (
                  <Tooltip text="Datas não preenchidas — indicadores de prazo indisponíveis. Regularize em Projetos > Regularizar.">
                    <span className="icon-warn">⚠</span>
                  </Tooltip>
                )}
                {l.numero_revisoes_baseline >= 2 && (
                  <Tooltip text={`Baseline revisada ${l.numero_revisoes_baseline} vezes.`}>
                    <span className="icon-info">ⓘ</span>
                  </Tooltip>
                )}
              </td>
              <td>{l.area}</td>
              <td>{l.status}</td>
              <td className="cell-num">{l.progresso === null ? "—" : pct(l.progresso / 100, 0)}</td>
              <CelulaNumOuTraco valor={l.ritmo} texto={num(l.ritmo, 2)} motivo={l.ritmo_motivo_nulo} />
              <CelulaNumOuTraco valor={l.cpi} texto={num(l.cpi, 2)} motivo={l.cpi_motivo_nulo} />
              <CelulaNumOuTraco
                valor={l.dias_atraso ?? l.slip_dias}
                texto={l.dias_atraso !== null ? dias(l.dias_atraso) : dias(l.slip_dias)}
                motivo={l.status === "Cancelado" ? "não aplicável a projeto cancelado" : "dado ausente"}
              />
              <td className="cell-num">{moeda(l.orcamento)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
