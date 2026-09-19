import { prisma } from "../db";
import { hojeBahia, diffDiasCorridos } from "./datetime";
import {
  STATUS_EXECUCAO,
  CAMPOS_GATILHO_STATUS_REPORT,
  DEBOUNCE_ATIVIDADE_MS,
  StatusProjeto,
  TipoProjeto,
  PrioridadeProjeto,
} from "./constants";

/**
 * ATENÇÃO: estes são os únicos campos que um formulário de edição de
 * projeto pode enviar. data_fim_baseline, data_fim_baseline_original,
 * numero_revisoes_baseline e motivo_revisao_baseline propositalmente NÃO
 * aparecem aqui — eles só são alterados pelos gatilhos internos desta
 * classe de serviço ou pela ação explícita `revisarBaseline`.
 */
export interface ProjetoEditInput {
  nome?: string;
  status?: StatusProjeto;
  tipo?: TipoProjeto;
  prioridade?: PrioridadeProjeto;
  progresso?: number;
  orcamento?: number | null;
  gasto?: number | null;
  data_inicio?: Date;
  data_fim_planejada?: Date;
  esforco_estimado_horas?: number | null;
  sponsorId?: number | null;
  dados_estimados?: boolean;
}

const CAMPOS_EDITAVEIS = [
  "nome",
  "status",
  "tipo",
  "prioridade",
  "progresso",
  "orcamento",
  "gasto",
  "data_inicio",
  "data_fim_planejada",
  "esforco_estimado_horas",
  "sponsorId",
  "dados_estimados",
] as const;

export interface ProjetoCriarInput extends ProjetoEditInput {
  nome: string;
  status: StatusProjeto;
  data_inicio: Date;
  data_fim_planejada: Date;
}

/** Filtra qualquer chave fora do allowlist — defesa em profundidade além do tipo estático. */
function filtrarCamposEditaveis<T extends object>(input: T): Partial<T> {
  const origem = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const chave of CAMPOS_EDITAVEIS) {
    if (chave in origem) {
      out[chave] = origem[chave];
    }
  }
  return out as Partial<T>;
}

function deveGravarAtividade(ultima: Date | null, agora: Date): boolean {
  if (!ultima) return true;
  return agora.getTime() - ultima.getTime() >= DEBOUNCE_ATIVIDADE_MS;
}

export async function criarProjeto(input: ProjetoCriarInput, agora: Date = new Date()) {
  const patch = filtrarCamposEditaveis(input) as ProjetoCriarInput;

  const data: Record<string, unknown> = { ...patch };

  // Projeto criado diretamente em status de execução recebe baseline na criação.
  if (STATUS_EXECUCAO.includes(patch.status)) {
    data.data_fim_baseline = patch.data_fim_planejada;
    data.data_fim_baseline_original = patch.data_fim_planejada;
  }

  data.data_ultimo_status_report = agora;
  data.data_ultima_atividade = agora;

  return prisma.projeto.create({ data: data as any });
}

export async function atualizarProjeto(
  id: number,
  input: ProjetoEditInput,
  agora: Date = new Date()
) {
  const atual = await prisma.projeto.findUniqueOrThrow({ where: { id } });
  const patch = filtrarCamposEditaveis(input);

  const data: Record<string, unknown> = { ...patch };

  const statusMudou = patch.status !== undefined && patch.status !== atual.status;
  const hoje = hojeBahia(agora);

  if (statusMudou) {
    const novoStatus = patch.status as StatusProjeto;

    // 6.1 Baseline: sair de Planejamento para status de execução.
    if (
      atual.status === "Planejamento" &&
      STATUS_EXECUCAO.includes(novoStatus) &&
      atual.data_fim_baseline === null
    ) {
      const dataFimPlanejada = (patch.data_fim_planejada as Date | undefined) ?? atual.data_fim_planejada;
      if (!dataFimPlanejada) {
        // Projeto legado sem data_fim_planejada (entrega 2): não fabricamos
        // baseline. Precisa passar pela tela "Regularizar projetos" antes
        // de poder entrar em execução por este caminho normal.
        throw new Error(
          "Projeto não pode entrar em execução sem data_fim_planejada preenchida. Regularize o projeto antes de mudar o status."
        );
      }
      data.data_fim_baseline = dataFimPlanejada;
      data.data_fim_baseline_original = dataFimPlanejada;
    }

    // 6.4 Pausa: entrando em Pausado.
    if (novoStatus === "Pausado" && atual.status !== "Pausado") {
      data.data_pausa = hoje;
    }

    // 6.4 Pausa: saindo de Pausado.
    if (atual.status === "Pausado" && novoStatus !== "Pausado" && atual.data_pausa) {
      const dias = diffDiasCorridos(hoje, atual.data_pausa);
      data.dias_pausado_acumulado = atual.dias_pausado_acumulado + dias;
      data.data_pausa = null;
    }

    // 6.3 Conclusão: entrando em Concluído.
    if (novoStatus === "Concluído" && atual.status !== "Concluído" && atual.data_fim_real === null) {
      data.data_fim_real = hoje;
    }

    // 6.3 Conclusão: reabertura (saindo de Concluído).
    if (atual.status === "Concluído" && novoStatus !== "Concluído") {
      data.data_fim_real = null;
    }
  }

  // 2. data_ultimo_status_report: só dispara para estes campos do projeto.
  const disparaStatusReport = CAMPOS_GATILHO_STATUS_REPORT.some((campo) => campo in patch);
  if (disparaStatusReport) {
    data.data_ultimo_status_report = agora;
  }

  // 2. data_ultima_atividade: qualquer escrita no projeto, com debounce de 1h.
  if (deveGravarAtividade(atual.data_ultima_atividade, agora)) {
    data.data_ultima_atividade = agora;
  }

  return prisma.projeto.update({ where: { id }, data: data as any });
}

export interface RevisarBaselineInput {
  novaDataFimBaseline: Date;
  motivo: string;
  usuarioId?: number;
}

/**
 * 6.2 Ação explícita "Revisar baseline" — só disponível para projetos em
 * execução, exige motivo, nunca toca em data_fim_baseline_original, e
 * registra auditoria (quem, quando, de/para, motivo).
 * Propositalmente NÃO reaproveita atualizarProjeto/ProjetoEditInput.
 */
export async function revisarBaseline(projetoId: number, input: RevisarBaselineInput) {
  if (!input.motivo || !input.motivo.trim()) {
    throw new Error("motivo_revisao_baseline é obrigatório para revisar a baseline");
  }

  const atual = await prisma.projeto.findUniqueOrThrow({ where: { id: projetoId } });

  if (!STATUS_EXECUCAO.includes(atual.status as StatusProjeto)) {
    throw new Error(
      `Revisão de baseline só é permitida para projetos em execução (${STATUS_EXECUCAO.join(", ")}), status atual: ${atual.status}`
    );
  }

  const [projetoAtualizado] = await prisma.$transaction([
    prisma.projeto.update({
      where: { id: projetoId },
      data: {
        data_fim_baseline: input.novaDataFimBaseline,
        numero_revisoes_baseline: { increment: 1 },
        motivo_revisao_baseline: input.motivo,
      },
    }),
    prisma.baselineAuditLog.create({
      data: {
        projetoId,
        usuarioId: input.usuarioId,
        de_data_fim_baseline: atual.data_fim_baseline,
        para_data_fim_baseline: input.novaDataFimBaseline,
        motivo: input.motivo,
      },
    }),
  ]);

  return projetoAtualizado;
}
