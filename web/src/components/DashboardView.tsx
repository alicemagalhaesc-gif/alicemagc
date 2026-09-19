import { useState } from "react";
import type { DashboardPayload, StatusRag } from "../types";
import { SaudePortfolioCard, OtdCard, CpiPortfolioCard, AtrasadosCard } from "./CardsLinha1";
import { ProgressoPonderadoCard, TarefasBloqueadasCard, AlocacaoEquipeCard, ProjetosSemAtualizacaoCard } from "./CardsLinha2";
import { ThroughputChart, OrcamentoGastoChart, DistribuicaoStatusDonut, DesvioCustoChart, MixPortfolioBar } from "./Charts";
import { ProjectsTable } from "./ProjectsTable";
import { dataBR } from "../format";
import { useLanguage } from "../i18n/LanguageContext";

/**
 * O MESMO layout de dashboard (cards, gráficos, tabela) usado tanto na aba
 * "Dashboard" (escopo = portfólio inteiro) quanto na aba "Projetos" (escopo
 * = um projeto só). Nenhum componente aqui sabe qual é o escopo — só
 * renderiza o payload que recebe. O escopo é decidido no backend
 * (montarPayloadDashboard com/sem projetoId), não aqui.
 */
export function DashboardView({
  dados,
  titulo,
  onAbrirProjeto,
}: {
  dados: DashboardPayload;
  titulo: string;
  onAbrirProjeto: (id: number) => void;
}) {
  const [filtroSaude, setFiltroSaude] = useState<StatusRag | null>(null);
  const [alocacaoAberta, setAlocacaoAberta] = useState(false);
  const { t } = useLanguage();

  return (
    <div>
      <div className="app-header">
        <h1>{titulo}</h1>
        <span className="ref">
          {t("dashboard.referencia")}: {dataBR(dados.data_referencia)}
        </span>
      </div>

      <div className="grid-4">
        <SaudePortfolioCard dados={dados.linha1.saude_portfolio} filtroAtivo={filtroSaude} onFiltrar={setFiltroSaude} />
        <OtdCard dados={dados.linha1.otd} />
        <CpiPortfolioCard dados={dados.linha1.cpi_portfolio} />
        <AtrasadosCard dados={dados.linha1.projetos_atrasados} />
      </div>

      <div className="grid-4">
        <ProgressoPonderadoCard dados={dados.linha2.progresso_ponderado} />
        <TarefasBloqueadasCard dados={dados.linha2.tarefas_bloqueadas} />
        <AlocacaoEquipeCard dados={dados.linha2.alocacao_equipe} aberto={alocacaoAberta} onToggle={() => setAlocacaoAberta((v) => !v)} />
        <ProjetosSemAtualizacaoCard dados={dados.linha2.projetos_sem_atualizacao} />
      </div>

      <div className="grid-charts">
        <ThroughputChart dados={dados.linha3.throughput_semanal} dataInicioColeta={dados.data_inicio_coleta} />
        <OrcamentoGastoChart dados={dados.linha3.orcamento_vs_gasto} />
      </div>

      <div className="grid-charts-2">
        <DistribuicaoStatusDonut dados={dados.linha3.distribuicao_status} />
        <DesvioCustoChart dados={dados.linha3.desvio_custo} />
      </div>

      <div style={{ maxWidth: 420, marginBottom: 14 }}>
        <MixPortfolioBar dados={dados.linha3.mix_portfolio} />
      </div>

      <ProjectsTable linhas={dados.tabela_projetos} filtroSaude={filtroSaude} onAbrirProjeto={onAbrirProjeto} />
    </div>
  );
}
