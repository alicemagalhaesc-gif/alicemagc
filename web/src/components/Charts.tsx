import type { DashboardPayload } from "../types";
import { moeda, pct, dataBR } from "../format";

const CAT = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

function addDiasIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function ThroughputChart({
  dados,
  dataInicioColeta,
}: {
  dados: DashboardPayload["linha3"]["throughput_semanal"];
  dataInicioColeta: string | null;
}) {
  if (dados.motivo_nulo || dados.semanas.length === 0) {
    const disponivelEm = dataInicioColeta ? addDiasIso(dataInicioColeta, 28) : null;
    return (
      <div className="chart-card">
        <h3>Throughput Semanal</h3>
        <div className="empty-state">
          {dataInicioColeta
            ? `Coleta iniciada em ${dataBR(dataInicioColeta)}. Dados disponíveis a partir de ${dataBR(disponivelEm)}.`
            : "Coleta ainda não iniciada."}
        </div>
      </div>
    );
  }

  const W = 480;
  const H = 160;
  const padL = 28;
  const padB = 20;
  const larguraUtil = W - padL - 8;
  const alturaUtil = H - padB - 10;
  const maxQtd = Math.max(1, ...dados.semanas.map((s) => s.quantidade));
  const larguraBarra = larguraUtil / dados.semanas.length;

  const pontosLinha = dados.semanas
    .map((s, i) => {
      if (s.media_movel_4_semanas === null) return null;
      const x = padL + i * larguraBarra + larguraBarra / 2;
      const y = 10 + alturaUtil - (s.media_movel_4_semanas / maxQtd) * alturaUtil;
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");

  return (
    <div className="chart-card">
      <h3>Throughput Semanal</h3>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Tarefas concluídas por semana, últimas 8 semanas">
        <line x1={padL} y1={10 + alturaUtil} x2={W} y2={10 + alturaUtil} stroke="var(--gridline)" strokeWidth="1" />
        {dados.semanas.map((s, i) => {
          const x = padL + i * larguraBarra + larguraBarra * 0.2;
          const alturaBarra = (s.quantidade / maxQtd) * alturaUtil;
          const y = 10 + alturaUtil - alturaBarra;
          return (
            <g key={s.inicio}>
              <rect x={x} y={y} width={larguraBarra * 0.6} height={alturaBarra} rx="3" fill="var(--series-1)">
                <title>{`${dataBR(s.inicio.slice(0, 10))}–${dataBR(s.fim.slice(0, 10))}: ${s.quantidade} concluídas`}</title>
              </rect>
              <text x={x + larguraBarra * 0.3} y={H - 6} fontSize="9" fill="var(--text-muted)" textAnchor="middle">
                {dataBR(s.inicio.slice(0, 10))}
              </text>
            </g>
          );
        })}
        {pontosLinha && <polyline points={pontosLinha} fill="none" stroke="var(--text-primary)" strokeWidth="2" />}
      </svg>
      <div className="legend-row">
        <span className="legend-item">
          <span style={{ width: 10, height: 10, background: "var(--series-1)", borderRadius: 2, display: "inline-block" }} /> Concluídas/semana
        </span>
        <span className="legend-item">
          <span style={{ width: 14, height: 2, background: "var(--text-primary)", display: "inline-block" }} /> Média móvel 4 semanas
        </span>
      </div>
      {dataInicioColeta && <div className="watermark">Coleta iniciada em {dataBR(dataInicioColeta)}</div>}
    </div>
  );
}

export function OrcamentoGastoChart({ dados }: { dados: DashboardPayload["linha3"]["orcamento_vs_gasto"] }) {
  const itens = [...dados].sort((a, b) => (b.orcamento ?? 0) - (a.orcamento ?? 0)).slice(0, 8);
  const max = Math.max(1, ...itens.map((i) => Math.max(i.orcamento ?? 0, i.gasto ?? 0)));

  return (
    <div className="chart-card">
      <h3>Orçamento vs. Gasto por Projeto</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {itens.map((i) => (
          <div key={i.id}>
            <div style={{ fontSize: 12, marginBottom: 3, color: "var(--text-secondary)" }}>{i.nome}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: `${((i.orcamento ?? 0) / max) * 100}%`, height: 8, background: "var(--series-1)", borderRadius: 3 }} />
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{moeda(i.orcamento)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: `${((i.gasto ?? 0) / max) * 100}%`, height: 8, background: "var(--series-2)", borderRadius: 3 }} />
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{moeda(i.gasto)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="legend-row" style={{ marginTop: 10 }}>
        <span className="legend-item">
          <span style={{ width: 10, height: 10, background: "var(--series-1)", borderRadius: 2, display: "inline-block" }} /> Orçamento
        </span>
        <span className="legend-item">
          <span style={{ width: 10, height: 10, background: "var(--series-2)", borderRadius: 2, display: "inline-block" }} /> Gasto
        </span>
      </div>
    </div>
  );
}

export function DistribuicaoStatusDonut({ dados }: { dados: DashboardPayload["linha3"]["distribuicao_status"] }) {
  const total = dados.reduce((s, d) => s + d.quantidade, 0);
  const raio = 60;
  const raioInterno = 36;
  const cx = 70;
  const cy = 70;

  let anguloAtual = -Math.PI / 2;
  const fatias = dados
    .filter((d) => d.quantidade > 0)
    .map((d, idx) => {
      const fracao = total > 0 ? d.quantidade / total : 0;
      const anguloInicio = anguloAtual;
      const anguloFim = anguloAtual + fracao * Math.PI * 2;
      anguloAtual = anguloFim;

      const largeArc = anguloFim - anguloInicio > Math.PI ? 1 : 0;
      const p = (ang: number, r: number) => [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
      const [x1, y1] = p(anguloInicio, raio);
      const [x2, y2] = p(anguloFim, raio);
      const [x3, y3] = p(anguloFim, raioInterno);
      const [x4, y4] = p(anguloInicio, raioInterno);

      const path = `M ${x1} ${y1} A ${raio} ${raio} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${raioInterno} ${raioInterno} 0 ${largeArc} 0 ${x4} ${y4} Z`;
      return { path, cor: CAT[idx % CAT.length], status: d.status, quantidade: d.quantidade };
    });

  return (
    <div className="chart-card">
      <h3>Distribuição de Status</h3>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Distribuição de projetos por status">
          {fatias.map((f) => (
            <path key={f.status} d={f.path} fill={f.cor}>
              <title>{`${f.status}: ${f.quantidade}`}</title>
            </path>
          ))}
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="18" fontWeight="700" fill="var(--text-primary)">
            {total}
          </text>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {dados.map((d, idx) => (
            <span key={d.status} className="legend-item" style={{ fontSize: 12 }}>
              <span style={{ width: 10, height: 10, background: CAT[idx % CAT.length], borderRadius: 2, display: "inline-block" }} />
              {d.status} ({d.quantidade})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DesvioCustoChart({ dados }: { dados: DashboardPayload["linha3"]["desvio_custo"] }) {
  if (dados.length === 0) {
    return (
      <div className="chart-card">
        <h3>Onde Está o Desvio de Custo</h3>
        <div className="empty-state">Sem dado de custo suficiente.</div>
      </div>
    );
  }
  const maxAbs = Math.max(1, ...dados.map((d) => Math.abs(d.variancia)));

  return (
    <div className="chart-card">
      <h3>Onde Está o Desvio de Custo</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {dados.map((d) => {
          const larguraPct = (Math.abs(d.variancia) / maxAbs) * 50;
          const positivo = d.variancia >= 0;
          return (
            <div key={d.projetoId} style={{ display: "flex", alignItems: "center", fontSize: 12 }}>
              <div style={{ width: "50%", display: "flex", justifyContent: "flex-end" }}>
                {!positivo && (
                  <div
                    style={{ width: `${larguraPct}%`, height: 14, background: "var(--rag-verde)", borderRadius: "3px 0 0 3px" }}
                    title={moeda(d.variancia)}
                  />
                )}
              </div>
              <div style={{ width: "50%" }}>
                {positivo && (
                  <div
                    style={{ width: `${larguraPct}%`, height: 14, background: "var(--rag-vermelho)", borderRadius: "0 3px 3px 0" }}
                    title={moeda(d.variancia)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 8 }}>
        {dados.map((d) => (
          <div key={d.projetoId} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)" }}>
            <span>{d.nome ?? `Projeto ${d.projetoId}`}</span>
            <span className="cell-num">
              {moeda(d.variancia)} · {pct(d.contribuicao, 0)}
            </span>
          </div>
        ))}
      </div>
      <div className="chart-sub">Responde "por quê" quando o CPI do portfólio está vermelho.</div>
    </div>
  );
}

export function MixPortfolioBar({ dados }: { dados: DashboardPayload["linha3"]["mix_portfolio"] }) {
  const run = dados.valor;
  const change = dados.mix_change;
  return (
    <div className="chart-card">
      <h3 style={{ fontSize: 12 }}>Mix do Portfólio de Projetos</h3>
      {run === null ? (
        <div className="empty-state" style={{ height: 40 }}>
          — sem orçamento cadastrado
        </div>
      ) : (
        <>
          <div style={{ display: "flex", height: 16, borderRadius: 6, overflow: "hidden" }}>
            <div style={{ width: `${run * 100}%`, background: "var(--series-1)" }} title={`Run: ${pct(run, 0)}`} />
            <div style={{ width: `${(change ?? 0) * 100}%`, background: "var(--series-2)" }} title={`Change: ${pct(change, 0)}`} />
          </div>
          <div className="legend-row" style={{ marginTop: 6 }}>
            <span className="legend-item">
              <span style={{ width: 10, height: 10, background: "var(--series-1)", borderRadius: 2, display: "inline-block" }} /> Run {pct(run, 0)}
            </span>
            <span className="legend-item">
              <span style={{ width: 10, height: 10, background: "var(--series-2)", borderRadius: 2, display: "inline-block" }} /> Change {pct(change, 0)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
