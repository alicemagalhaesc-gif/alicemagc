import { useEffect, useState } from "react";
import { buscarDashboard } from "../api";
import type { DashboardPayload } from "../types";
import { DashboardView } from "../components/DashboardView";
import { useLanguage } from "../i18n/LanguageContext";

export function DashboardPage({ onAbrirProjeto }: { onAbrirProjeto: (id: number) => void }) {
  const [dados, setDados] = useState<DashboardPayload | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    buscarDashboard()
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, []);

  if (erro)
    return (
      <div className="error">
        {t("geral.erroCarregarDashboard")}: {erro}
      </div>
    );
  if (!dados) return <div className="loading">{t("geral.carregando")}</div>;

  return <DashboardView dados={dados} titulo={t("dashboard.titulo")} onAbrirProjeto={onAbrirProjeto} />;
}
