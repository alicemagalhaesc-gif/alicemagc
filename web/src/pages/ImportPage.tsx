import { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import type { ChaveTraducao } from "../i18n/translations";

type Entidade = "projeto" | "tarefa" | "pessoa" | "msproject";

interface CampoImportavel {
  chave: string;
  label: string;
  obrigatorio: boolean;
}

interface PreviewImportacao {
  importId: string;
  colunas: string[];
  sugestaoMapeamento: Record<string, string | null>;
  linhasPreview: Record<string, string>[];
  totalLinhas: number;
  camposDisponiveis: CampoImportavel[];
}

interface ResultadoImportacao {
  total: number;
  sucesso: number;
  erros: { linha: number; motivo: string }[];
}

const LABEL_ENTIDADE: Record<Entidade, ChaveTraducao> = {
  projeto: "importar.projetos",
  tarefa: "importar.tarefas",
  pessoa: "importar.pessoas",
  msproject: "importar.msproject",
};

interface PreviewMsProject {
  importId: string;
  nomeProjeto: string;
  projetoExistente: boolean;
  totalLinhas: number;
  totalMarcos: number;
  recursosDetectados: string[];
  linhasPreview: { edt: string; nome: string; inicio: string; termino: string; marco: boolean }[];
  avisos: string[];
}

interface ResultadoMsProject {
  projeto: { id: number; nome: string; criado: boolean };
  tarefasCriadas: number;
  tarefasAtualizadas: number;
  pessoasCriadas: number;
  avisos: string[];
  erros: { edt: string; motivo: string }[];
}

export function ImportPage() {
  const { t } = useLanguage();
  const [entidade, setEntidade] = useState<Entidade>("projeto");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewImportacao | null>(null);
  const [mapeamento, setMapeamento] = useState<Record<string, string | null>>({});
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  const [previewMsp, setPreviewMsp] = useState<PreviewMsProject | null>(null);
  const [resultadoMsp, setResultadoMsp] = useState<ResultadoMsProject | null>(null);

  function trocarEntidade(nova: Entidade) {
    setEntidade(nova);
    setArquivo(null);
    setPreview(null);
    setResultado(null);
    setPreviewMsp(null);
    setResultadoMsp(null);
    setErro(null);
  }

  async function analisarArquivo() {
    if (!arquivo) return;
    setCarregando(true);
    setErro(null);
    setResultado(null);
    setResultadoMsp(null);
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      if (entidade === "msproject") {
        const resp = await fetch("/api/import/msproject/preview", { method: "POST", body: form });
        if (!resp.ok) throw new Error((await resp.json()).erro ?? t("importar.falhaLer"));
        setPreviewMsp(await resp.json());
        return;
      }
      form.append("entidade", entidade);
      const resp = await fetch("/api/import/preview", { method: "POST", body: form });
      if (!resp.ok) throw new Error((await resp.json()).erro ?? t("importar.falhaLer"));
      const dados: PreviewImportacao = await resp.json();
      setPreview(dados);
      setMapeamento(dados.sugestaoMapeamento);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  async function confirmarImportacao() {
    if (!preview) return;
    setCarregando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId: preview.importId, mapeamento }),
      });
      if (!resp.ok) throw new Error((await resp.json()).erro ?? t("importar.falhaImportar"));
      const dados: ResultadoImportacao = await resp.json();
      setResultado(dados);
      setPreview(null);
      setArquivo(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  async function confirmarImportacaoMsp() {
    if (!previewMsp) return;
    setCarregando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/import/msproject/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId: previewMsp.importId }),
      });
      if (!resp.ok) throw new Error((await resp.json()).erro ?? t("importar.falhaImportar"));
      setResultadoMsp(await resp.json());
      setPreviewMsp(null);
      setArquivo(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  const camposObrigatoriosMapeados =
    preview?.camposDisponiveis.filter((c) => c.obrigatorio).every((c) => Object.values(mapeamento).includes(c.chave)) ?? false;

  return (
    <div>
      <h2 className="page-title">{t("importar.titulo")}</h2>
      <p className="page-sub">{t("importar.subtitulo")}</p>

      <div className="chart-card">
        <div className="field-row">
          <label>
            {t("importar.tipoDado")}:&nbsp;
            <select value={entidade} onChange={(e) => trocarEntidade(e.target.value as Entidade)}>
              <option value="projeto">{t("importar.projetos")}</option>
              <option value="tarefa">{t("importar.tarefas")}</option>
              <option value="pessoa">{t("importar.pessoas")}</option>
              <option value="msproject">{t("importar.msproject")}</option>
            </select>
          </label>
          <input type="file" accept=".csv,.xlsx" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          <button className="btn" disabled={!arquivo || carregando} onClick={analisarArquivo}>
            {carregando ? t("importar.lendo") : t("importar.analisar")}
          </button>
        </div>

        {entidade === "msproject" && !previewMsp && !resultadoMsp && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("importar.mspAjuda")}</p>
        )}

        {erro && <div className="summary-box warn">{erro}</div>}

        {previewMsp && (
          <>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              <strong>{previewMsp.nomeProjeto}</strong>{" "}
              {previewMsp.projetoExistente ? t("importar.mspProjetoExistente") : t("importar.mspProjetoNovo")} ·{" "}
              {previewMsp.totalLinhas} {t("importar.mspLinhasEap")} · {previewMsp.totalMarcos} {t("importar.mspMarcos")} ·{" "}
              {previewMsp.recursosDetectados.length} {t("importar.mspRecursos")}
            </p>

            {previewMsp.avisos.map((a, i) => (
              <div key={i} className="summary-box warn">
                {a}
              </div>
            ))}

            <table className="mapping-table">
              <thead>
                <tr>
                  <th>EDT</th>
                  <th>{t("tabela.projeto")}</th>
                  <th>{t("importar.mspInicio")}</th>
                  <th>{t("importar.mspTermino")}</th>
                  <th>{t("importar.mspMarco")}</th>
                </tr>
              </thead>
              <tbody>
                {previewMsp.linhasPreview.map((l) => (
                  <tr key={l.edt}>
                    <td>{l.edt}</td>
                    <td>{l.nome}</td>
                    <td>{l.inicio}</td>
                    <td>{l.termino}</td>
                    <td>{l.marco ? "✓" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previewMsp.totalLinhas > previewMsp.linhasPreview.length && (
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {t("importar.mspMaisLinhas", { n: previewMsp.totalLinhas - previewMsp.linhasPreview.length })}
              </p>
            )}

            <button className="btn" disabled={carregando} onClick={confirmarImportacaoMsp}>
              {carregando ? t("importar.importando") : `${t("importar.confirmar")} (${previewMsp.totalLinhas} ${t("importar.linhas")})`}
            </button>
          </>
        )}

        {resultadoMsp && (
          <div className={`summary-box ${resultadoMsp.erros.length === 0 ? "ok" : "warn"}`}>
            <strong>
              {resultadoMsp.projeto.nome}: {resultadoMsp.tarefasCriadas} {t("importar.mspCriadas")}, {resultadoMsp.tarefasAtualizadas}{" "}
              {t("importar.mspAtualizadas")}, {resultadoMsp.pessoasCriadas} {t("importar.mspPessoasNovas")}
            </strong>
            {resultadoMsp.avisos.map((a, i) => (
              <p key={i}>{a}</p>
            ))}
            {resultadoMsp.erros.length > 0 && (
              <ul>
                {resultadoMsp.erros.map((e, i) => (
                  <li key={i}>
                    EDT {e.edt}: {e.motivo}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {preview && (
          <>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {preview.totalLinhas} {t("importar.linhasEncontradas")} <strong>{t(LABEL_ENTIDADE[entidade])}</strong>. {t("importar.confiraMapeamento")}
            </p>

            <table className="mapping-table">
              <thead>
                <tr>
                  <th>{t("importar.colunaPlanilha")}</th>
                  <th>{t("importar.mapeiaPara")}</th>
                  {preview.linhasPreview.slice(0, 3).map((_, i) => (
                    <th key={i}>
                      {t("importar.exemplo")} {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.colunas.map((coluna) => (
                  <tr key={coluna}>
                    <td>{coluna}</td>
                    <td>
                      <select
                        value={mapeamento[coluna] ?? ""}
                        onChange={(e) => setMapeamento({ ...mapeamento, [coluna]: e.target.value || null })}
                      >
                        <option value="">{t("importar.ignorar")}</option>
                        {preview.camposDisponiveis.map((c) => (
                          <option key={c.chave} value={c.chave}>
                            {c.label}
                            {c.obrigatorio ? " *" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    {preview.linhasPreview.slice(0, 3).map((linha, i) => (
                      <td key={i}>{linha[coluna]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {!camposObrigatoriosMapeados && <div className="summary-box warn">{t("importar.avisoObrigatorios")}</div>}

            <button className="btn" disabled={!camposObrigatoriosMapeados || carregando} onClick={confirmarImportacao}>
              {carregando ? t("importar.importando") : `${t("importar.confirmar")} (${preview.totalLinhas} ${t("importar.linhas")})`}
            </button>
          </>
        )}

        {resultado && (
          <div className={`summary-box ${resultado.erros.length === 0 ? "ok" : "warn"}`}>
            <strong>
              {resultado.sucesso} {t("importar.resultado", { total: resultado.total })}
            </strong>
            {resultado.erros.length > 0 && (
              <ul>
                {resultado.erros.map((e, i) => (
                  <li key={i}>
                    {t("importar.linha")} {e.linha}: {e.motivo}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
