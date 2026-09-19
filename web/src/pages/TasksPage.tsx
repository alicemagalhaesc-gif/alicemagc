import { useEffect, useState } from "react";
import { Modal, CampoForm } from "../components/Modal";
import { useLanguage } from "../i18n/LanguageContext";

interface Tarefa {
  id: number;
  nome: string;
  status: string;
  prioridade: string;
  estimativa_horas: number | null;
  data_fim_planejada: string | null;
  projeto: { id: number; nome: string };
  responsavel: { id: number; nome: string } | null;
}

interface ProjetoOpcao {
  id: number;
  nome: string;
}
interface PessoaOpcao {
  id: number;
  nome: string;
}

const STATUS_FILTROS = ["Todas", "A Fazer", "Em Andamento", "Bloqueado", "Concluído"];
const PRIORIDADES = ["Alta", "Média", "Baixa"];
const STATUS_OPCOES = ["A Fazer", "Em Andamento", "Bloqueado", "Concluído"];

const TAREFA_VAZIA = { nome: "", projetoId: "", status: "A Fazer", prioridade: "Média", estimativa_horas: "", responsavelId: "", data_fim_planejada: "" };

function classeStatus(status: string): string {
  return status.toLowerCase().replace(/\s+/g, "-").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function TasksPage() {
  const { t } = useLanguage();
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);
  const [projetos, setProjetos] = useState<ProjetoOpcao[]>([]);
  const [pessoas, setPessoas] = useState<PessoaOpcao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("Todas");
  const [editando, setEditando] = useState<Tarefa | null>(null);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState(TAREFA_VAZIA);
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    fetch("/api/tarefas")
      .then((r) => r.json())
      .then(setTarefas)
      .catch((e) => setErro(e.message));
  }

  useEffect(() => {
    carregar();
    fetch("/api/projetos/lista").then((r) => r.json()).then(setProjetos);
    fetch("/api/pessoas").then((r) => r.json()).then(setPessoas);
  }, []);

  const visiveis = (tarefas ?? []).filter((t) => {
    if (filtroStatus !== "Todas" && t.status !== filtroStatus) return false;
    if (busca && !t.nome.toLowerCase().includes(busca.toLowerCase()) && !(t.responsavel?.nome ?? "").toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  function abrirNova() {
    setForm({ ...TAREFA_VAZIA, projetoId: projetos[0] ? String(projetos[0].id) : "" });
    setCriando(true);
  }

  function abrirEdicao(tarefa: Tarefa) {
    setForm({
      nome: tarefa.nome,
      projetoId: String(tarefa.projeto.id),
      status: tarefa.status,
      prioridade: tarefa.prioridade,
      estimativa_horas: tarefa.estimativa_horas === null ? "" : String(tarefa.estimativa_horas),
      responsavelId: tarefa.responsavel ? String(tarefa.responsavel.id) : "",
      data_fim_planejada: tarefa.data_fim_planejada ? tarefa.data_fim_planejada.slice(0, 10) : "",
    });
    setEditando(tarefa);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      if (editando) {
        const mudouStatus = form.status !== editando.status;
        const payload: Record<string, unknown> = {
          nome: form.nome,
          prioridade: form.prioridade,
          estimativa_horas: form.estimativa_horas === "" ? null : Number(form.estimativa_horas),
          responsavelId: form.responsavelId === "" ? null : Number(form.responsavelId),
          data_fim_planejada: form.data_fim_planejada === "" ? null : form.data_fim_planejada,
        };
        if (mudouStatus) payload.novoStatus = form.status;
        const resp = await fetch(`/api/tarefas/${editando.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!resp.ok) throw new Error((await resp.json()).erro ?? t("form.falhaSalvar"));
      } else {
        const payload = {
          nome: form.nome,
          projetoId: Number(form.projetoId),
          status: form.status,
          prioridade: form.prioridade,
          estimativa_horas: form.estimativa_horas === "" ? null : Number(form.estimativa_horas),
          responsavelId: form.responsavelId === "" ? null : Number(form.responsavelId),
          data_fim_planejada: form.data_fim_planejada === "" ? null : form.data_fim_planejada,
        };
        const resp = await fetch("/api/tarefas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!resp.ok) throw new Error((await resp.json()).erro ?? t("form.falhaCriar"));
      }
      setEditando(null);
      setCriando(false);
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(tarefa: Tarefa) {
    if (!confirm(t("tarefas.confirmarExcluir", { nome: tarefa.nome }))) return;
    try {
      const resp = await fetch(`/api/tarefas/${tarefa.id}`, { method: "DELETE" });
      if (!resp.ok && resp.status !== 204) throw new Error((await resp.json()).erro ?? t("form.falhaExcluir"));
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const modalAberto = criando || editando !== null;

  return (
    <div>
      <div className="app-header">
        <h1>{t("tarefas.titulo")}</h1>
        <button className="btn" onClick={abrirNova} disabled={projetos.length === 0}>
          {t("tarefas.nova")}
        </button>
      </div>
      <p className="page-sub">{t("tarefas.subtitulo")}</p>

      <div className="field-row">
        <input type="text" placeholder={t("tarefas.buscar")} value={busca} onChange={(e) => setBusca(e.target.value)} style={{ minWidth: 260 }} />
      </div>

      <div className="pill-tabs">
        {STATUS_FILTROS.map((s) => (
          <button key={s} className={filtroStatus === s ? "is-active" : ""} onClick={() => setFiltroStatus(s)}>
            {s === "Todas" ? t("tarefas.todas") : s}
          </button>
        ))}
      </div>

      {erro && <div className="summary-box warn">{erro}</div>}
      {!tarefas && <div className="loading">{t("geral.carregando")}</div>}

      {tarefas && (
        <div className="chart-card" style={{ overflowX: "auto" }}>
          <table className="projects-table">
            <thead>
              <tr>
                <th>{t("tarefas.tarefa")}</th>
                <th>{t("tarefas.projeto")}</th>
                <th>{t("tarefas.status")}</th>
                <th>{t("tarefas.prioridade")}</th>
                <th>{t("tarefas.responsavel")}</th>
                <th>{t("tarefas.estimativa")}</th>
                <th>{t("tarefas.acoes")}</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((tarefa) => (
                <tr key={tarefa.id}>
                  <td>{tarefa.nome}</td>
                  <td>{tarefa.projeto.nome}</td>
                  <td>
                    <span className={`status-pill ${classeStatus(tarefa.status)}`}>{tarefa.status}</span>
                  </td>
                  <td>{tarefa.prioridade}</td>
                  <td>{tarefa.responsavel?.nome ?? "—"}</td>
                  <td className="cell-num">{tarefa.estimativa_horas === null ? "—" : `${tarefa.estimativa_horas}h`}</td>
                  <td className="table-actions">
                    <button onClick={() => abrirEdicao(tarefa)} title={t("form.editarTooltip")}>
                      ✎
                    </button>
                    <button className="danger" onClick={() => excluir(tarefa)} title={t("form.excluirTooltip")}>
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={7} className="cell-muted" style={{ textAlign: "center", padding: 20 }}>
                    {t("tarefas.nenhuma")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalAberto && (
        <Modal titulo={editando ? t("tarefas.editar") : t("tarefas.novaTitulo")} onFechar={() => (setEditando(null), setCriando(false))}>
          <CampoForm label={t("form.nomeObrigatorio")}>
            <input type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus />
          </CampoForm>
          {!editando && (
            <CampoForm label={t("tarefas.projetoObrigatorio")}>
              <select value={form.projetoId} onChange={(e) => setForm({ ...form, projetoId: e.target.value })}>
                {projetos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </CampoForm>
          )}
          <CampoForm label={t("tarefas.status")}>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS_OPCOES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </CampoForm>
          <CampoForm label={t("tarefas.prioridade")}>
            <select value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}>
              {PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </CampoForm>
          <CampoForm label={t("tarefas.responsavel")}>
            <select value={form.responsavelId} onChange={(e) => setForm({ ...form, responsavelId: e.target.value })}>
              <option value="">{t("tarefas.semResponsavel")}</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </CampoForm>
          <CampoForm label={t("tarefas.estimativaLabel")}>
            <input type="number" value={form.estimativa_horas} onChange={(e) => setForm({ ...form, estimativa_horas: e.target.value })} />
          </CampoForm>
          <CampoForm label={t("tarefas.prazo")}>
            <input type="date" value={form.data_fim_planejada} onChange={(e) => setForm({ ...form, data_fim_planejada: e.target.value })} />
          </CampoForm>
          <button className="btn" disabled={!form.nome.trim() || (!editando && !form.projetoId) || salvando} onClick={salvar}>
            {salvando ? t("form.salvando") : t("form.salvar")}
          </button>
        </Modal>
      )}
    </div>
  );
}
