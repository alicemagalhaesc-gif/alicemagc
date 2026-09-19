import { useEffect, useState } from "react";
import { Modal, CampoForm } from "../components/Modal";

interface Pessoa {
  id: number;
  nome: string;
  cargo: string | null;
  email: string | null;
  capacidade_horas_semana: number;
  ativo: boolean;
}

const PESSOA_VAZIA = { nome: "", cargo: "", email: "", capacidade_horas_semana: 40, ativo: true };

export function PeoplePage() {
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Pessoa | null>(null);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState(PESSOA_VAZIA);
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    fetch("/api/pessoas")
      .then((r) => r.json())
      .then(setPessoas)
      .catch((e) => setErro(e.message));
  }

  useEffect(carregar, []);

  const visiveis = (pessoas ?? []).filter(
    (p) => !busca || p.nome.toLowerCase().includes(busca.toLowerCase()) || (p.cargo ?? "").toLowerCase().includes(busca.toLowerCase())
  );

  function abrirNova() {
    setForm(PESSOA_VAZIA);
    setCriando(true);
  }

  function abrirEdicao(p: Pessoa) {
    setForm({ nome: p.nome, cargo: p.cargo ?? "", email: p.email ?? "", capacidade_horas_semana: p.capacidade_horas_semana, ativo: p.ativo });
    setEditando(p);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const payload = {
        nome: form.nome,
        cargo: form.cargo || null,
        email: form.email || null,
        capacidade_horas_semana: Number(form.capacidade_horas_semana),
        ativo: form.ativo,
      };
      const resp = editando
        ? await fetch(`/api/pessoas/${editando.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/pessoas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!resp.ok) throw new Error((await resp.json()).erro ?? "Falha ao salvar");
      setEditando(null);
      setCriando(false);
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(p: Pessoa) {
    if (!confirm(`Excluir "${p.nome}"? Isso não apaga projetos/tarefas, só remove o vínculo com essa pessoa.`)) return;
    try {
      const resp = await fetch(`/api/pessoas/${p.id}`, { method: "DELETE" });
      if (!resp.ok && resp.status !== 204) throw new Error((await resp.json()).erro ?? "Falha ao excluir");
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const modalAberto = criando || editando !== null;

  return (
    <div>
      <div className="app-header">
        <h1>Pessoas</h1>
        <button className="btn" onClick={abrirNova}>
          + Nova Pessoa
        </button>
      </div>
      <p className="page-sub">Cadastre sponsors e responsáveis por tarefas.</p>

      <div className="field-row">
        <input type="text" placeholder="Buscar por nome ou cargo…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ minWidth: 260 }} />
      </div>

      {erro && <div className="summary-box warn">{erro}</div>}
      {!pessoas && <div className="loading">Carregando…</div>}

      {pessoas && (
        <div className="chart-card" style={{ overflowX: "auto" }}>
          <table className="projects-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Cargo</th>
                <th>Email</th>
                <th>Capacidade (h/sem)</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((p) => (
                <tr key={p.id}>
                  <td>{p.nome}</td>
                  <td>{p.cargo ?? "—"}</td>
                  <td>{p.email ?? "—"}</td>
                  <td className="cell-num">{p.capacidade_horas_semana}h</td>
                  <td>
                    <span className={`status-pill ${p.ativo ? "concluido" : "a-fazer"}`}>{p.ativo ? "Ativo" : "Inativo"}</span>
                  </td>
                  <td className="table-actions">
                    <button onClick={() => abrirEdicao(p)} title="Editar">
                      ✎
                    </button>
                    <button className="danger" onClick={() => excluir(p)} title="Excluir">
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={6} className="cell-muted" style={{ textAlign: "center", padding: 20 }}>
                    Nenhuma pessoa encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalAberto && (
        <Modal titulo={editando ? "Editar Pessoa" : "Nova Pessoa"} onFechar={() => (setEditando(null), setCriando(false))}>
          <CampoForm label="Nome *">
            <input type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus />
          </CampoForm>
          <CampoForm label="Cargo">
            <input type="text" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="ex: Tech Lead" />
          </CampoForm>
          <CampoForm label="Email">
            <input type="text" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </CampoForm>
          <CampoForm label="Capacidade (horas/semana)">
            <input
              type="number"
              value={form.capacidade_horas_semana}
              onChange={(e) => setForm({ ...form, capacidade_horas_semana: Number(e.target.value) })}
            />
          </CampoForm>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
            <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
            Ativo
          </label>
          <button className="btn" disabled={!form.nome.trim() || salvando} onClick={salvar}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </Modal>
      )}
    </div>
  );
}
