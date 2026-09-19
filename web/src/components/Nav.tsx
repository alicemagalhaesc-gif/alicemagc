import { useLanguage } from "../i18n/LanguageContext";
import { IDIOMAS } from "../i18n/translations";
import type { ChaveTraducao } from "../i18n/translations";
import { useAuth } from "../auth/AuthContext";

export type Aba = "dashboard" | "projetos" | "pessoas" | "tarefas" | "importar" | "explorar";

const ITENS: { chave: Aba; labelKey: ChaveTraducao; icone: string }[] = [
  { chave: "dashboard", labelKey: "nav.dashboard", icone: "▦" },
  { chave: "projetos", labelKey: "nav.projetos", icone: "▤" },
  { chave: "pessoas", labelKey: "nav.pessoas", icone: "◍" },
  { chave: "tarefas", labelKey: "nav.tarefas", icone: "☑" },
  { chave: "importar", labelKey: "nav.importar", icone: "⇧" },
  { chave: "explorar", labelKey: "nav.explorar", icone: "⌕" },
];

export function Nav({ ativa, onMudar }: { ativa: Aba; onMudar: (a: Aba) => void }) {
  const { idioma, setIdioma, t } = useLanguage();
  const { usuario, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark">PM</span>
        <div>
          <div className="sidebar-brand-title">{t("sidebar.brandTitle")}</div>
          <div className="sidebar-brand-sub">{t("sidebar.brandSub")}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {ITENS.map((i) => (
          <button key={i.chave} className={`sidebar-link${ativa === i.chave ? " is-active" : ""}`} onClick={() => onMudar(i.chave)}>
            <span className="sidebar-link-icon">{i.icone}</span>
            {t(i.labelKey)}
          </button>
        ))}
      </nav>

      <div className="sidebar-lang">
        <label className="sidebar-lang-label">{t("sidebar.idioma")}</label>
        <select value={idioma} onChange={(e) => setIdioma(e.target.value as typeof idioma)}>
          {IDIOMAS.map((i) => (
            <option key={i.codigo} value={i.codigo}>
              {i.bandeira} {i.label}
            </option>
          ))}
        </select>
      </div>

      <div className="sidebar-user">
        <span className="sidebar-user-nome">{usuario?.nome}</span>
        <button className="sidebar-user-sair" onClick={() => logout()}>
          {t("sidebar.sair")}
        </button>
      </div>
    </aside>
  );
}
