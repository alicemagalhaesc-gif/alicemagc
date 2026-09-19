import type { DashboardPayload, StatusRag } from "../types";
import { Card, Tooltip, ValorOuTraco } from "./Common";
import { pct, moeda, dias } from "../format";
import { useLanguage } from "../i18n/LanguageContext";

const ORDEM: StatusRag[] = ["verde", "amarelo", "vermelho", "cinza"];

export function SaudePortfolioCard({
  dados,
  filtroAtivo,
  onFiltrar,
}: {
  dados: DashboardPayload["linha1"]["saude_portfolio"];
  filtroAtivo: StatusRag | null;
  onFiltrar: (status: StatusRag | null) => void;
}) {
  const { t } = useLanguage();
  const total = dados.contagem.verde + dados.contagem.amarelo + dados.contagem.vermelho + dados.contagem.cinza;

  return (
    <Card titulo={t("card.saude.titulo")}>
      <div className="card-main">
        <span className="card-value">{total > 0 ? pct(dados.pct_verde, 0) : "—"}</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("card.saude.emVerde")}</span>
      </div>

      <div className="segmented-bar" role="group" aria-label={t("card.saude.titulo")}>
        {ORDEM.map((cor) => {
          const largura = total > 0 ? (dados.contagem[cor] / total) * 100 : 0;
          if (largura === 0) return null;
          return (
            <div
              key={cor}
              className={`seg ${cor} is-clickable`}
              style={{ width: `${largura}%`, opacity: filtroAtivo && filtroAtivo !== cor ? 0.35 : 1 }}
              title={`${cor}: ${dados.contagem[cor]}`}
              onClick={() => onFiltrar(filtroAtivo === cor ? null : cor)}
            />
          );
        })}
      </div>

      <div className="legend-row">
        {ORDEM.map((cor) => (
          <span key={cor} className="legend-item">
            <span className={`status-dot ${cor}`} /> {dados.contagem[cor]}
          </span>
        ))}
      </div>

      {dados.pausados > 0 && (
        <span className="badge-pausado">
          + {dados.pausados} {t("card.saude.pausados")}
        </span>
      )}

      <div className="card-context">
        {t("card.saude.meta")}: {pct(dados.meta_pct_verde, 0)} {t("card.saude.metaEmVerde")}
      </div>
    </Card>
  );
}

export function OtdCard({ dados }: { dados: DashboardPayload["linha1"]["otd"] }) {
  const { t } = useLanguage();
  const mostrarContagem = dados.n !== null && dados.n < 5;
  return (
    <Card titulo={t("card.otd.titulo")} status={dados.status}>
      {mostrarContagem ? (
        <Tooltip text={t("card.otd.tooltipAmostra")}>
          <span className="card-value">
            {dados.no_prazo} {t("card.otd.de")} {dados.total} {t("card.otd.noPrazo")}
          </span>
        </Tooltip>
      ) : (
        <div className="card-main">
          <ValorOuTraco valor={dados.valor} texto={pct(dados.valor, 0)} motivoNulo={dados.motivo_nulo} />
        </div>
      )}
      <div className="card-context">{t("card.otd.contexto")}</div>
    </Card>
  );
}

export function CpiPortfolioCard({ dados }: { dados: DashboardPayload["linha1"]["cpi_portfolio"] }) {
  const { t } = useLanguage();
  const eac = dados.eac_portfolio;
  return (
    <Card titulo={t("card.cpi.titulo")} status={dados.status}>
      <div className="card-main">
        <ValorOuTraco valor={dados.valor} texto={num2(dados.valor)} motivoNulo={dados.motivo_nulo} />
      </div>
      <div className="card-context">
        {t("card.cpi.projecao")}:{" "}
        {eac.valor === null ? (
          <Tooltip text={eac.motivo_nulo ?? "—"}>—</Tooltip>
        ) : eac.truncado ? (
          t("card.cpi.acimaDe3x")
        ) : (
          moeda(eac.valor)
        )}
      </div>
    </Card>
  );
}

export function AtrasadosCard({ dados }: { dados: DashboardPayload["linha1"]["projetos_atrasados"] }) {
  const { t, idioma } = useLanguage();
  return (
    <Card titulo={t("card.atrasados.titulo")} status={dados.status}>
      <div className="card-main">
        <ValorOuTraco valor={dados.valor} texto={`${dados.atrasados} · ${pct(dados.valor, 0)}`} motivoNulo={dados.motivo_nulo} />
      </div>
      <div className="card-context">
        {t("card.atrasados.slipMediano")}:{" "}
        {dados.slip_mediano.valor === null ? (
          <Tooltip text={dados.slip_mediano.motivo_nulo ?? "—"}>—</Tooltip>
        ) : (
          dias(dados.slip_mediano.valor, idioma)
        )}
      </div>
    </Card>
  );
}

function num2(v: number | null): string {
  if (v === null) return "—";
  return v.toFixed(2).replace(".", ",");
}
