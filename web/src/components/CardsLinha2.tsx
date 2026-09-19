import type { DashboardPayload } from "../types";
import { Card, Tooltip, ValorOuTraco } from "./Common";
import { pct, dias, num } from "../format";
import { useLanguage } from "../i18n/LanguageContext";

export function ProgressoPonderadoCard({ dados }: { dados: DashboardPayload["linha2"]["progresso_ponderado"] }) {
  const { t } = useLanguage();
  return (
    <Card titulo={t("card.progresso.titulo")} status={dados.status}>
      <div className="card-main">
        <ValorOuTraco valor={dados.valor} texto={pct(dados.valor, 0)} motivoNulo={dados.motivo_nulo} />
      </div>
      {dados.divergencia_destaque ? (
        <div className="card-context destaque">
          {t("card.progresso.reportado")} {pct(dados.progresso_reportado_medio, 0)} · {t("card.progresso.calculado")}{" "}
          {pct(
            dados.progresso_reportado_medio !== null && dados.divergencia_media !== null
              ? dados.progresso_reportado_medio - dados.divergencia_media
              : null,
            0
          )}
        </div>
      ) : (
        <div className="card-context">{t("card.progresso.contexto")}</div>
      )}
    </Card>
  );
}

export function TarefasBloqueadasCard({ dados }: { dados: DashboardPayload["linha2"]["tarefas_bloqueadas"] }) {
  const { t, idioma } = useLanguage();
  const statusGeral =
    (dados.pct.valor !== null && dados.pct.valor > 0.1) || (dados.idade_media.valor !== null && dados.idade_media.valor > 7)
      ? "vermelho"
      : dados.pct.valor === null && dados.idade_media.valor === null
      ? "cinza"
      : "verde";

  return (
    <Card titulo={t("card.bloqueadas.titulo")} status={statusGeral}>
      <div className="card-main">
        {dados.pct.valor === null ? (
          <Tooltip text={dados.pct.motivo_nulo ?? t("geral.semDado")}>
            <span className="card-value is-muted">—</span>
          </Tooltip>
        ) : (
          <span className="card-value">
            {pct(dados.pct.valor, 0)}
            {dados.idade_media.valor !== null && (
              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)" }}>
                {" "}
                · {num(dados.idade_media.valor, 0)} {t("card.bloqueadas.diasEmMedia")}
              </span>
            )}
          </span>
        )}
      </div>
      <div className="card-context">
        {t("card.bloqueadas.contexto")}{" "}
        {dados.tempo_resolvido_mediano.valor === null ? (
          <Tooltip text={dados.tempo_resolvido_mediano.motivo_nulo ?? t("geral.semDado")}>—</Tooltip>
        ) : (
          dias(dados.tempo_resolvido_mediano.valor, idioma)
        )}
      </div>
    </Card>
  );
}

export function AlocacaoEquipeCard({
  dados,
  aberto,
  onToggle,
}: {
  dados: DashboardPayload["linha2"]["alocacao_equipe"];
  aberto: boolean;
  onToggle: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Card titulo={t("card.alocacao.titulo")} status={dados.status} onClick={onToggle}>
      <div className="card-main">
        <ValorOuTraco valor={dados.valor} texto={pct(dados.valor, 0)} motivoNulo={dados.motivo_nulo} />
      </div>
      <div className="card-context">
        {t("card.alocacao.backlogMedio")}: {dados.backlog_medio_semanas === null ? "—" : `${num(dados.backlog_medio_semanas, 1)} ${t("card.alocacao.semanasPorPessoa")}`}
      </div>

      {aberto && (
        <div style={{ marginTop: 4, borderTop: "1px solid var(--gridline)", paddingTop: 8 }} onClick={(e) => e.stopPropagation()}>
          {dados.por_pessoa.map((p) => (
            <div key={p.pessoaId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
              <span>
                <span className={`status-dot ${p.taxa_alocacao.status}`} style={{ marginRight: 6 }} />
                {p.nome ?? `${t("geral.pessoa")} ${p.pessoaId}`}
              </span>
              <span className="cell-num">{pct(p.taxa_alocacao.valor, 0)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function ProjetosSemAtualizacaoCard({ dados }: { dados: DashboardPayload["linha2"]["projetos_sem_atualizacao"] }) {
  const { t } = useLanguage();
  const status = dados.n === 0 ? "verde" : dados.n <= 2 ? "amarelo" : "vermelho";
  return (
    <Card titulo={t("card.desatualizados.titulo")} status={status}>
      <div className="card-main">
        <span className="card-value">{dados.n}</span>
      </div>
      <div className="card-context">{t("card.desatualizados.contexto")}</div>
    </Card>
  );
}
