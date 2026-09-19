import { useEffect, useState } from "react";
import { Modal, CampoForm } from "../components/Modal";
import { useLanguage } from "../i18n/LanguageContext";

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
  const { t } = useLanguage();
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
      if (!resp.ok) throw new Error((await resp.json()).erro ?? t("form.falhaSalvar"));
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
    if (!confirm(t("pessoas.confirmarExcluir", { nome: p.nome }))) return;
    try {
      const resp = await fetch(`/api/pessoas/${p.id}`, { method: "DELETE" });
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
        <h1>{t("pessoas.titulo")}</h1>
        <button className="btn" onClick={abrirNova}>
          {t("pessoas.nova")}
        </button>
      </div>
      <p className="page-sub">{t("pessoas.subtitulo")}</p>

      <div className="field-row">
        <input type="text" placeholder={t("pessoas.buscar")} value={busca} onChange={(e) => setBusca(e.target.value)} style={{ minWidth: 260 }} />
      </div>

      {erro && <div className="summary-box warn">{erro}</div>}
      {!pessoas && <div className="loading">{t("geral.carregando")}</div>}

      {pessoas && (
        <div className="chart-card" style={{ overflowX: "auto" }}>
          <table className="projects-table">
            <thead>
              <tr>
                <th>{t("pessoas.nome")}</th>
                <th>{t("pessoas.cargo")}</th>
                <th>{t("pessoas.email")}</th>
                <th>{t("pessoas.capacidade")}</th>
                <th>{t("pessoas.status")}</th>
                <th>{t("pessoas.acoes")}</th>
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
                    <span className={`status-pill ${p.ativo ? "concluido" : "a-fazer"}`}>{p.ativo ? t("pessoas.ativo") : t("pessoas.inativo")}</span>
                  </td>
                  <td className="table-actions">
                    <button onClick={() => abrirEdicao(p)} title={t("form.editarTooltip")}>
                      ✎
                    </button>
                    <button className="danger" onClick={() => excluir(p)} title={t("form.excluirTooltip")}>
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={6} className="cell-muted" style={{ textAlign: "center", padding: 20 }}>
                    {t("pessoas.nenhuma")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalAberto && (
        <Modal titulo={editando ? t("pessoas.editar") : t("pessoas.novaTitulo")} onFechar={() => (setEditando(null), setCriando(false))}>
          <CampoForm label={t("form.nomeObrigatorio")}>
            <input type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus />
          </CampoForm>
          <CampoForm label={t("pessoas.cargo")}>
            <input type="text" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder={t("pessoas.cargoPlaceholder")} />
          </CampoForm>
          <CampoForm label={t("pessoas.email")}>
            <input type="text" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </CampoForm>
          <CampoForm label={t("pessoas.capacidadeLabel")}>
            <input
              type="number"
              value={form.capacidade_horas_semana}
              onChange={(e) => setForm({ ...form, capacidade_horas_semana: Number(e.target.value) })}
            />
          </CampoForm>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
            <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
            {t("pessoas.ativo")}
          </label>
          <button className="btn" disabled={!form.nome.trim() || salvando} onClick={salvar}>
            {salvando ? t("form.salvando") : t("form.salvar")}
          </button>
        </Modal>
      )}
    </div>
  );
}
