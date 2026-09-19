import { useState } from "react";

type Entidade = "projeto" | "tarefa" | "pessoa";

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

const LABEL_ENTIDADE: Record<Entidade, string> = { projeto: "Projetos", tarefa: "Tarefas", pessoa: "Pessoas" };

export function ImportPage() {
  const [entidade, setEntidade] = useState<Entidade>("projeto");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewImportacao | null>(null);
  const [mapeamento, setMapeamento] = useState<Record<string, string | null>>({});
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  async function analisarArquivo() {
    if (!arquivo) return;
    setCarregando(true);
    setErro(null);
    setResultado(null);
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      form.append("entidade", entidade);
      const resp = await fetch("/api/import/preview", { method: "POST", body: form });
      if (!resp.ok) throw new Error((await resp.json()).erro ?? "Falha ao ler o arquivo");
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
      if (!resp.ok) throw new Error((await resp.json()).erro ?? "Falha ao importar");
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

  const camposObrigatoriosMapeados =
    preview?.camposDisponiveis.filter((c) => c.obrigatorio).every((c) => Object.values(mapeamento).includes(c.chave)) ?? false;

  return (
    <div>
      <h2 className="page-title">Importar Dados</h2>
      <p className="page-sub">Suba uma planilha (.csv ou .xlsx) para cadastrar projetos, tarefas ou pessoas em lote.</p>

      <div className="chart-card">
        <div className="field-row">
          <label>
            Tipo de dado:&nbsp;
            <select
              value={entidade}
              onChange={(e) => {
                setEntidade(e.target.value as Entidade);
                setPreview(null);
                setResultado(null);
              }}
            >
              <option value="projeto">Projetos</option>
              <option value="tarefa">Tarefas</option>
              <option value="pessoa">Pessoas</option>
            </select>
          </label>
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
          <button className="btn" disabled={!arquivo || carregando} onClick={analisarArquivo}>
            {carregando ? "Lendo…" : "Analisar arquivo"}
          </button>
        </div>

        {erro && <div className="summary-box warn">{erro}</div>}

        {preview && (
          <>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {preview.totalLinhas} linha(s) encontrada(s) para <strong>{LABEL_ENTIDADE[entidade]}</strong>. Confira o mapeamento de
              colunas abaixo (ajuste onde a detecção automática errar):
            </p>

            <table className="mapping-table">
              <thead>
                <tr>
                  <th>Coluna da planilha</th>
                  <th>Mapeia para</th>
                  {preview.linhasPreview.slice(0, 3).map((_, i) => (
                    <th key={i}>Exemplo {i + 1}</th>
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
                        <option value="">(ignorar)</option>
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

            {!camposObrigatoriosMapeados && (
              <div className="summary-box warn">
                Mapeie todos os campos obrigatórios (marcados com *) antes de confirmar.
              </div>
            )}

            <button className="btn" disabled={!camposObrigatoriosMapeados || carregando} onClick={confirmarImportacao}>
              {carregando ? "Importando…" : `Confirmar importação (${preview.totalLinhas} linhas)`}
            </button>
          </>
        )}

        {resultado && (
          <div className={`summary-box ${resultado.erros.length === 0 ? "ok" : "warn"}`}>
            <strong>
              {resultado.sucesso} de {resultado.total} linha(s) importada(s) com sucesso.
            </strong>
            {resultado.erros.length > 0 && (
              <ul>
                {resultado.erros.map((e, i) => (
                  <li key={i}>
                    Linha {e.linha}: {e.motivo}
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
