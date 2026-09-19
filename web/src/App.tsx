import { useState } from "react";
import { Nav, type Aba } from "./components/Nav";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectListPage } from "./pages/ProjectListPage";
import { PeoplePage } from "./pages/PeoplePage";
import { TasksPage } from "./pages/TasksPage";
import { ImportPage } from "./pages/ImportPage";
import { ExplorerPage } from "./pages/ExplorerPage";
import { LoginPage } from "./pages/LoginPage";
import { useAuth } from "./auth/AuthContext";

export default function App() {
  const { usuario, carregando } = useAuth();
  const [aba, setAba] = useState<Aba>("dashboard");
  const [projetoSelecionado, setProjetoSelecionado] = useState<number | null>(null);

  function abrirProjeto(id: number) {
    setProjetoSelecionado(id);
    setAba("projetos");
  }

  if (carregando) return null;
  if (!usuario) return <LoginPage />;

  return (
    <div className="app-shell">
      <Nav ativa={aba} onMudar={setAba} />
      <main className="app">
        {aba === "dashboard" && <DashboardPage onAbrirProjeto={abrirProjeto} />}
        {aba === "projetos" && (
          <ProjectListPage projetoSelecionadoId={projetoSelecionado} onSelecionarProjeto={setProjetoSelecionado} />
        )}
        {aba === "pessoas" && <PeoplePage />}
        {aba === "tarefas" && <TasksPage />}
        {aba === "importar" && <ImportPage />}
        {aba === "explorar" && <ExplorerPage />}
      </main>
    </div>
  );
}
