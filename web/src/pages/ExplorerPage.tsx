import { useEffect, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import type { ChaveTraducao } from "../i18n/translations";

type Entidade = "projeto" | "tarefa" | "pessoa";
type Operador = "=" | "!=" | ">" | ">=" | "<" | "<=" | "contem" | "vazio" | "nao_vazio";
type FuncaoAgregacao = "contagem" | "soma" | "media" | "min" | "max";

interface DefinicaoCampo {
  chave: string;
  label: string;
  tipo: "string" | "number" | "date" | "boolean" | "enum";
  opcoes?: string[];
}

interface Filtro {
  campo: string;
  operador: Operador;
  valor?: string;
}

interface Agregacao {
  campo: string;
  funcao: FuncaoAgregacao;
}

interface Resultado {
  colunas: string[];
  linhas: Record<string, unknown>[];
  total: number;
  truncado: boolean;
}

const OPERADORES: { valor: Operador; chave: ChaveTraducao }[] = [
  { valor: "=", chave: "explorar.opIgual" },
  { valor: "!=", chave: "explorar.opDiferente" },
  { valor: ">", chave: "explorar.opMaior" },
  { valor: ">=", chave: "explorar.opMaiorIgual" },
  { valor: "<", chave: "explorar.opMenor" },
  { valor: "<=", chave: "explorar.opMenorIgual" },
  { valor: "contem", chave: "explorar.opContem" },
  { valor: "vazio", chave: "explorar.opVazio" },
  { valor: "nao_vazio", chave: "explorar.opNaoVazio" },
];

const FUNCOES: { valor: FuncaoAgregacao; chave: ChaveTraducao }[] = [
  { valor: "soma", chave: "explorar.funcaoSoma" },
  { valor: "media", chave: "explorar.funcaoMedia" },
  { valor: "min", chave: "explorar.funcaoMin" },
  { valor: "max", chave: "explorar.funcaoMax" },
];

const LABEL_ENTIDADE: Record<Entidade, ChaveTraducao> = {
  projeto: "importar.projetos",
  tarefa: "importar.tarefas",
  pessoa: "importar.pessoas",
};

function paraCsv(colunas: string[], linhas: Record<string, unknown>[]): string {
  const escapar = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cabecalho = colunas.map(escapar).join(",");
  const corpo = linhas.map((l) => colunas.map((c) => escapar(l[c])).join(",")).join("\n");
  return `${cabecalho}\n${corpo}`;
}

export function ExplorerPage() {
  const { t } = useLanguage();
  const [entidades, setEntidades] = useState<Record<Entidade, { label: string; campos: DefinicaoCampo[] }> | null>(null);
  const [entidade, setEntidade] = useState<Entidade>("projeto");
  const [camposSelecionados, setCamposSelecionados] = useState<string[]>([]);
  const [filtros, setFiltros] = useState<Filtro[]>([]);
  const [agruparPor, setAgruparPor] = useState<string>("");
  const [agregacoes, setAgregacoes] = useState<Agregacao[]>([]);
  const [ordenarPor, setOrdenarPor] = useState<string>("");
  const [ordenarDirecao, setOrdenarDirecao] = useState<"asc" | "desc">("asc");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/explorer/entidades")
      .then((r) => r.json())
      .then((dados) => {
        setEntidades(dados);
        setCamposSelecionados(dados[entidade].campos.slice(0, 5).map((c: DefinicaoCampo) => c.chave));
      });
  }, []);

  function trocarEntidade(nova: Entidade) {
    setEntidade(nova);
    setFiltros([]);
    setAgruparPor("");
    setAgregacoes([]);
    setOrdenarPor("");
    setResultado(null);
    if (entidades) setCamposSelecionados(entidades[nova].campos.slice(0, 5).map((c) => c.chave));
  }

  const camposEntidade = entidades?.[entidade]?.campos ?? [];

  function adicionarFiltro() {
    if (camposEntidade.length === 0) return;
    setFiltros([...filtros, { campo: camposEntidade[0].chave, operador: "=", valor: "" }]);
  }
  function atualizarFiltro(i: number, patch: Partial<Filtro>) {
    setFiltros(filtros.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function removerFiltro(i: number) {
    setFiltros(filtros.filter((_, idx) => idx !== i));
  }

  function adicionarAgregacao() {
    if (camposEntidade.length === 0) return;
    setAgregacoes([...agregacoes, { campo: camposEntidade[0].chave, funcao: "soma" }]);
  }

  async function executar() {
    setCarregando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/explorer/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entidade,
          campos: camposSelecionados,
          filtros: filtros.filter((f) => f.operador === "vazio" || f.operador === "nao_vazio" || (f.valor ?? "") !== ""),
          agruparPor: agruparPor || undefined,
          agregacoes: agruparPor ? agregacoes : undefined,
          ordenarPor: !agruparPor && ordenarPor ? ordenarPor : undefined,
          ordenarDirecao,
        }),
      });
      if (!resp.ok) throw new Error((await resp.json()).erro ?? t("explorar.falhaConsulta"));
      setResultado(await resp.json());
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  function exportarCsv() {
    if (!resultado) return;
    const csv = paraCsv(resultado.colunas, resultado.linhas);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entidade}_consulta.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!entidades) return <div className="loading">{t("geral.carregando")}</div>;

  return (
    <div>
      <h2 className="page-title">{t("explorar.titulo")}</h2>
      <p className="page-sub">{t("explorar.subtitulo")}</p>

      <div className="chart-card">
        <div className="field-row">
          <label>
            {t("explorar.fonte")}:&nbsp;
            <select value={entidade} onChange={(e) => trocarEntidade(e.target.value as Entidade)}>
              {Object.keys(entidades).map((chave) => (
                <option key={chave} value={chave}>
                  {t(LABEL_ENTIDADE[chave as Entidade])}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>{t("explorar.colunasExibir")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {camposEntidade.map((c) => (
              <label key={c.chave} className="chip" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={camposSelecionados.includes(c.chave)}
                  onChange={(e) =>
                    setCamposSelecionados(
                      e.target.checked ? [...camposSelecionados, c.chave] : camposSelecionados.filter((x) => x !== c.chave)
                    )
                  }
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>{t("explorar.filtros")}</div>
          {filtros.map((f, i) => {
            const campo = camposEntidade.find((c) => c.chave === f.campo);
            const precisaValor = f.operador !== "vazio" && f.operador !== "nao_vazio";
            return (
              <div className="filter-row" key={i}>
                <select value={f.campo} onChange={(e) => atualizarFiltro(i, { campo: e.target.value })}>
                  {camposEntidade.map((c) => (
                    <option key={c.chave} value={c.chave}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <select value={f.operador} onChange={(e) => atualizarFiltro(i, { operador: e.target.value as Operador })}>
                  {OPERADORES.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {t(o.chave)}
                    </option>
                  ))}
                </select>
                {precisaValor ? (
                  campo?.tipo === "enum" ? (
                    <select value={f.valor ?? ""} onChange={(e) => atualizarFiltro(i, { valor: e.target.value })}>
                      <option value="">{t("explorar.escolha")}</option>
                      {campo.opcoes?.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  ) : campo?.tipo === "boolean" ? (
                    <select value={f.valor ?? ""} onChange={(e) => atualizarFiltro(i, { valor: e.target.value })}>
                      <option value="">{t("explorar.escolha")}</option>
                      <option value="true">{t("explorar.sim")}</option>
                      <option value="false">{t("explorar.nao")}</option>
                    </select>
                  ) : (
                    <input
                      type={campo?.tipo === "number" ? "number" : campo?.tipo === "date" ? "text" : "text"}
                      placeholder={campo?.tipo === "date" ? t("explorar.formatoData") : t("explorar.valor")}
                      value={f.valor ?? ""}
                      onChange={(e) => atualizarFiltro(i, { valor: e.target.value })}
                    />
                  )
                ) : (
                  <span />
                )}
                <button className="btn secondary" onClick={() => removerFiltro(i)}>
                  {t("explorar.remover")}
                </button>
              </div>
            );
          })}
          <button className="btn secondary" onClick={adicionarFiltro}>
            {t("explorar.adicionarFiltro")}
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>{t("explorar.agruparPor")}</div>
          <div className="field-row">
            <select value={agruparPor} onChange={(e) => setAgruparPor(e.target.value)}>
              <option value="">{t("explorar.semAgrupamento")}</option>
              {camposEntidade.map((c) => (
                <option key={c.chave} value={c.chave}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {agruparPor && (
            <>
              {agregacoes.map((a, i) => (
                <div className="filter-row" key={i} style={{ gridTemplateColumns: "1fr 1fr auto" }}>
                  <select
                    value={a.funcao}
                    onChange={(e) => setAgregacoes(agregacoes.map((x, idx) => (idx === i ? { ...x, funcao: e.target.value as FuncaoAgregacao } : x)))}
                  >
                    {FUNCOES.map((f) => (
                      <option key={f.valor} value={f.valor}>
                        {t(f.chave)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={a.campo}
                    onChange={(e) => setAgregacoes(agregacoes.map((x, idx) => (idx === i ? { ...x, campo: e.target.value } : x)))}
                  >
                    {camposEntidade
                      .filter((c) => c.tipo === "number")
                      .map((c) => (
                        <option key={c.chave} value={c.chave}>
                          {c.label}
                        </option>
                      ))}
                  </select>
                  <button className="btn secondary" onClick={() => setAgregacoes(agregacoes.filter((_, idx) => idx !== i))}>
                    {t("explorar.remover")}
                  </button>
                </div>
              ))}
              <button className="btn secondary" onClick={adicionarAgregacao}>
                {t("explorar.adicionarAgregacao")}
              </button>
            </>
          )}
        </div>

        {!agruparPor && (
          <div className="field-row" style={{ marginTop: 16 }}>
            <label>
              {t("explorar.ordenarPor")}:&nbsp;
              <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value)}>
                <option value="">{t("explorar.padrao")}</option>
                {camposEntidade.map((c) => (
                  <option key={c.chave} value={c.chave}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <select value={ordenarDirecao} onChange={(e) => setOrdenarDirecao(e.target.value as "asc" | "desc")}>
              <option value="asc">{t("explorar.crescente")}</option>
              <option value="desc">{t("explorar.decrescente")}</option>
            </select>
          </div>
        )}

        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button className="btn" onClick={executar} disabled={carregando}>
            {carregando ? t("explorar.consultando") : t("explorar.executar")}
          </button>
          {resultado && (
            <button className="btn secondary" onClick={exportarCsv}>
              {t("explorar.exportarCsv")}
            </button>
          )}
        </div>

        {erro && <div className="summary-box warn">{erro}</div>}
      </div>

      {resultado && (
        <div className="chart-card" style={{ marginTop: 14, overflowX: "auto" }}>
          <h3>
            {t("explorar.resultado")} ({resultado.total}
            {resultado.truncado ? t("explorar.limitado") : ""})
          </h3>
          <table className="projects-table">
            <thead>
              <tr>
                {resultado.colunas.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resultado.linhas.map((linha, i) => (
                <tr key={i}>
                  {resultado.colunas.map((c) => (
                    <td key={c} className={typeof linha[c] === "number" ? "cell-num" : undefined}>
                      {linha[c] === null || linha[c] === undefined ? "—" : String(linha[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
