import { useState } from "react";
import { Nav, type Aba } from "./components/Nav";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectListPage } from "./pages/ProjectListPage";
import { ImportPage } from "./pages/ImportPage";
import { ExplorerPage } from "./pages/ExplorerPage";

export default function App() {
  const [aba, setAba] = useState<Aba>("dashboard");
  const [projetoSelecionado, setProjetoSelecionado] = useState<number | null>(null);

  function abrirProjeto(id: number) {
    setProjetoSelecionado(id);
    setAba("projetos");
  }

  return (
    <div className="app">
      <Nav ativa={aba} onMudar={setAba} />
      {aba === "dashboard" && <DashboardPage onAbrirProjeto={abrirProjeto} />}
      {aba === "projetos" && <ProjectListPage projetoSelecionadoId={projetoSelecionado} onSelecionarProjeto={setProjetoSelecionado} />}
      {aba === "importar" && <ImportPage />}
      {aba === "explorar" && <ExplorerPage />}
    </div>
  );
}
