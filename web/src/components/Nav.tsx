export type Aba = "dashboard" | "projetos" | "pessoas" | "tarefas" | "importar" | "explorar";

const ITENS: { chave: Aba; label: string; icone: string }[] = [
  { chave: "dashboard", label: "Dashboard", icone: "▦" },
  { chave: "projetos", label: "Projetos", icone: "▤" },
  { chave: "pessoas", label: "Pessoas", icone: "◍" },
  { chave: "tarefas", label: "Tarefas", icone: "☑" },
  { chave: "importar", label: "Importar Dados", icone: "⇧" },
  { chave: "explorar", label: "Explorar Dados", icone: "⌕" },
];

export function Nav({ ativa, onMudar }: { ativa: Aba; onMudar: (a: Aba) => void }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark">PM</span>
        <div>
          <div className="sidebar-brand-title">Portfólio</div>
          <div className="sidebar-brand-sub">Gestão de Projetos</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {ITENS.map((i) => (
          <button key={i.chave} className={`sidebar-link${ativa === i.chave ? " is-active" : ""}`} onClick={() => onMudar(i.chave)}>
            <span className="sidebar-link-icon">{i.icone}</span>
            {i.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
