import type { DashboardPayload, StatusRag } from "../types";
import { StatusDot, Tooltip, InfoTooltip } from "./Common";
import { pct, moeda, dias, num } from "../format";
import { useLanguage } from "../i18n/LanguageContext";

function CelulaNumOuTraco({ valor, texto, motivo }: { valor: number | null; texto: string; motivo: string | null }) {
  const { t } = useLanguage();
  if (valor === null) {
    return (
      <td className="cell-num cell-muted">
        <Tooltip text={motivo ?? t("geral.semDado")}>—</Tooltip>
      </td>
    );
  }
  return <td className="cell-num">{texto}</td>;
}

export function ProjectsTable({
  linhas,
  filtroSaude,
  onAbrirProjeto,
  titulo,
}: {
  linhas: DashboardPayload["tabela_projetos"];
  filtroSaude: StatusRag | null;
  onAbrirProjeto: (id: number) => void;
  titulo?: string;
}) {
  const { t, idioma } = useLanguage();
  const visiveis = filtroSaude ? linhas.filter((l) => l.saude === filtroSaude) : linhas;
  const tituloExibido = titulo ?? t("tabela.titulo");

  return (
    <div className="chart-card" style={{ overflowX: "auto" }}>
      <h3>
        {tituloExibido}{" "}
        {filtroSaude && (
          <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
            · {t("tabela.filtradoPor")} {filtroSaude}
          </span>
        )}
      </h3>
      <table className="projects-table">
        <thead>
          <tr>
            <th>
              {t("tabela.saude")} <InfoTooltip text={t("tabela.saudeLegenda")} />
            </th>
            <th>{t("tabela.projeto")}</th>
            <th>{t("tabela.area")}</th>
            <th>{t("tabela.status")}</th>
            <th>{t("tabela.progresso")}</th>
            <th>
              {t("tabela.ritmo")} <InfoTooltip text={t("tabela.ritmoTooltip")} />
            </th>
            <th>
              {t("tabela.cpi")} <InfoTooltip text={t("tabela.cpiLegenda")} />
            </th>
            <th>
              {t("tabela.diasAtraso")} <InfoTooltip text={t("tabela.diasAtrasoLegenda")} />
            </th>
            <th>{t("tabela.orcamento")}</th>
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
                  <Tooltip text={t("tabela.avisoDadosEstimados")}>
                    <span className="icon-warn">⚠</span>
                  </Tooltip>
                )}
                {l.numero_revisoes_baseline >= 2 && (
                  <Tooltip text={t("tabela.baselineRevisada", { n: l.numero_revisoes_baseline })}>
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
                texto={l.dias_atraso !== null ? dias(l.dias_atraso, idioma) : dias(l.slip_dias, idioma)}
                motivo={l.status === "Cancelado" ? t("geral.naoAplicavelCancelado") : t("geral.dadoAusente")}
              />
              <td className="cell-num">{moeda(l.orcamento)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
