export type Aba = "dashboard" | "projetos" | "importar" | "explorar";

export function Nav({ ativa, onMudar }: { ativa: Aba; onMudar: (a: Aba) => void }) {
  const itens: { chave: Aba; label: string }[] = [
    { chave: "dashboard", label: "Dashboard" },
    { chave: "projetos", label: "Projetos" },
    { chave: "importar", label: "Importar Dados" },
    { chave: "explorar", label: "Explorar Dados" },
  ];
  return (
    <nav className="nav-tabs">
      {itens.map((i) => (
        <button key={i.chave} className={`nav-tab${ativa === i.chave ? " is-active" : ""}`} onClick={() => onMudar(i.chave)}>
          {i.label}
        </button>
      ))}
    </nav>
  );
}
