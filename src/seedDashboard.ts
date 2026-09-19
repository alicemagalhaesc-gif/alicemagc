/**
 * Popula o banco com um portfólio de demonstração para o dashboard da
 * entrega 4. Não é um script de produção — é só massa de dados variada o
 * bastante pra exercitar todos os estados visuais (verde/amarelo/vermelho/
 * cinza/pausado, OTD com amostra suficiente, bloqueios, alocação etc.).
 */
import { prisma } from "./db";
import { hojeBahia } from "./domain/datetime";
import { rodarJobDiarioKpiSnapshot } from "./domain/kpiSnapshotJob";

function subDias(data: Date, n: number): Date {
  return new Date(data.getTime() - n * 86400000);
}
function somaDias(data: Date, n: number): Date {
  return new Date(data.getTime() + n * 86400000);
}

async function limparBanco() {
  await prisma.kpiSnapshot.deleteMany();
  await prisma.baselineAuditLog.deleteMany();
  await prisma.tarefaEvento.deleteMany();
  await prisma.tarefa.deleteMany();
  await prisma.projeto.deleteMany();
  await prisma.pessoa.deleteMany();
  await prisma.appConfig.deleteMany();
}

async function main() {
  const hoje = hojeBahia(new Date());
  await limparBanco();

  // Marco de coleta há 60 dias, pra que os gráficos de fluxo mostrem dado real.
  await prisma.appConfig.create({ data: { chave: "DATA_INICIO_COLETA", valor: subDias(hoje, 60).toISOString() } });

  const [ana, bruno, carla, diego] = await Promise.all([
    prisma.pessoa.create({ data: { nome: "Ana Ferreira", capacidade_horas_semana: 40, ativo: true } }),
    prisma.pessoa.create({ data: { nome: "Bruno Costa", capacidade_horas_semana: 30, ativo: true } }),
    prisma.pessoa.create({ data: { nome: "Carla Nunes", capacidade_horas_semana: 40, ativo: true } }),
    prisma.pessoa.create({ data: { nome: "Diego Alves", capacidade_horas_semana: 20, ativo: true } }),
  ]);

  async function projeto(dados: {
    nome: string;
    status: string;
    tipo?: string;
    progresso?: number;
    orcamento?: number | null;
    gasto?: number | null;
    data_inicio?: Date | null;
    data_fim_planejada?: Date | null;
    data_fim_baseline?: Date | null;
    data_fim_baseline_original?: Date | null;
    data_fim_real?: Date | null;
    numero_revisoes_baseline?: number;
    dados_estimados?: boolean;
    data_ultimo_status_report?: Date | null;
    sponsorId?: number;
  }) {
    return prisma.projeto.create({
      data: {
        nome: dados.nome,
        status: dados.status,
        tipo: dados.tipo ?? "Change",
        progresso: dados.progresso ?? 0,
        orcamento: dados.orcamento ?? null,
        gasto: dados.gasto ?? null,
        data_inicio: dados.data_inicio ?? null,
        data_fim_planejada: dados.data_fim_planejada ?? null,
        data_fim_baseline: dados.data_fim_baseline ?? null,
        data_fim_baseline_original: dados.data_fim_baseline_original ?? null,
        data_fim_real: dados.data_fim_real ?? null,
        numero_revisoes_baseline: dados.numero_revisoes_baseline ?? 0,
        dados_estimados: dados.dados_estimados ?? false,
        data_ultimo_status_report: dados.data_ultimo_status_report ?? hoje,
        sponsorId: dados.sponsorId,
      },
    });
  }

  // --- Em Andamento: verde ---
  const p1 = await projeto({
    nome: "Portal do Cliente",
    status: "Em Andamento",
    progresso: 55,
    orcamento: 300000,
    gasto: 150000,
    data_inicio: subDias(hoje, 100),
    data_fim_planejada: somaDias(hoje, 80),
    data_fim_baseline: somaDias(hoje, 80),
    data_fim_baseline_original: somaDias(hoje, 80),
    sponsorId: ana.id,
  });

  // --- Em Andamento: amarelo (1 sinal — ritmo abaixo da faixa verde, mas longe do severo) ---
  const p2 = await projeto({
    nome: "Migração ERP",
    status: "Em Andamento",
    progresso: 72,
    orcamento: 500000,
    gasto: 380000,
    data_inicio: subDias(hoje, 90),
    data_fim_planejada: somaDias(hoje, 10),
    data_fim_baseline: somaDias(hoje, 10),
    data_fim_baseline_original: subDias(hoje, 5),
    numero_revisoes_baseline: 1,
    sponsorId: bruno.id,
  });

  // --- Em Andamento: vermelho (2 sinais — ritmo baixo + cpi baixo) ---
  const p3 = await projeto({
    nome: "Integração de Pagamentos",
    status: "Em Andamento",
    progresso: 20,
    orcamento: 420000,
    gasto: 350000,
    data_inicio: subDias(hoje, 80),
    data_fim_planejada: somaDias(hoje, 20),
    data_fim_baseline: somaDias(hoje, 20),
    data_fim_baseline_original: somaDias(hoje, 20),
    data_ultimo_status_report: subDias(hoje, 12),
    sponsorId: carla.id,
  });

  // --- Em Andamento: vermelho imediato (sinal severo V1) ---
  const p4 = await projeto({
    nome: "App Mobile",
    status: "Em Andamento",
    progresso: 15,
    orcamento: 200000,
    gasto: 90000,
    data_inicio: subDias(hoje, 60),
    data_fim_planejada: somaDias(hoje, 40),
    data_fim_baseline: somaDias(hoje, 40),
    data_fim_baseline_original: somaDias(hoje, 40),
    sponsorId: diego.id,
  });

  // --- Em Andamento legado (dados_estimados=true, sem baseline) ---
  const p5 = await projeto({
    nome: "Sistema Legado XPTO",
    status: "Em Andamento",
    tipo: "Run",
    progresso: 60,
    orcamento: 150000,
    gasto: 80000,
    dados_estimados: true,
    data_ultimo_status_report: null,
  });

  // --- Pausado ---
  const p6 = await projeto({
    nome: "Auditoria Interna",
    status: "Pausado",
    progresso: 30,
    orcamento: 90000,
    gasto: 40000,
    data_inicio: subDias(hoje, 70),
    data_fim_planejada: subDias(hoje, 5), // já venceria — mas pausado não conta como atrasado
    data_fim_baseline: subDias(hoje, 5),
    data_fim_baseline_original: subDias(hoje, 5),
    data_ultimo_status_report: subDias(hoje, 30),
  });
  await prisma.projeto.update({ where: { id: p6.id }, data: { data_pausa: subDias(hoje, 30) } });

  // --- Planejamento ---
  await projeto({
    nome: "Onboarding Digital",
    status: "Planejamento",
    progresso: 5,
    orcamento: 120000,
    gasto: 5000,
    data_inicio: somaDias(hoje, 10),
    data_fim_planejada: somaDias(hoje, 150),
  });

  // --- Concluídos (6, pra OTD ter amostra >= 5) ---
  const concluidos = [
    { nome: "Reforma do Data Center", baseline: subDias(hoje, 40), real: subDias(hoje, 45) }, // no prazo
    { nome: "Rollout de VPN", baseline: subDias(hoje, 60), real: subDias(hoje, 62) }, // no prazo
    { nome: "Novo Site Institucional", baseline: subDias(hoje, 100), real: subDias(hoje, 100) }, // no prazo (igual)
    { nome: "Automação de Faturas", baseline: subDias(hoje, 120), real: subDias(hoje, 100) }, // atrasado
    { nome: "Consolidação de Data Lake", baseline: subDias(hoje, 200), real: subDias(hoje, 180) }, // atrasado
    { nome: "Upgrade de Rede", baseline: subDias(hoje, 250), real: subDias(hoje, 255) }, // no prazo
  ];
  for (const c of concluidos) {
    await projeto({
      nome: c.nome,
      status: "Concluído",
      progresso: 100,
      orcamento: 100000,
      gasto: 98000,
      data_inicio: subDias(c.real, 90),
      data_fim_planejada: c.baseline,
      data_fim_baseline: c.baseline,
      data_fim_baseline_original: c.baseline,
      data_fim_real: c.real,
    });
  }

  // --- Cancelado (excluído de tudo) ---
  await projeto({ nome: "Projeto Descontinuado", status: "Cancelado", progresso: 10, orcamento: 50000, gasto: 12000 });

  // --- Tarefas para os projetos ativos ---
  async function tarefa(projetoId: number, nome: string, status: string, opts: {
    estimativa_horas?: number;
    responsavelId?: number;
    data_fim_planejada?: Date;
    data_inicio?: Date;
    data_conclusao?: Date;
    data_bloqueio?: Date;
    data_criacao?: Date;
  } = {}) {
    return prisma.tarefa.create({
      data: {
        projetoId,
        nome,
        status,
        estimativa_horas: opts.estimativa_horas,
        responsavelId: opts.responsavelId,
        data_fim_planejada: opts.data_fim_planejada,
        data_inicio: opts.data_inicio,
        data_conclusao: opts.data_conclusao,
        data_bloqueio: opts.data_bloqueio,
        data_criacao: opts.data_criacao ?? subDias(hoje, 30),
      },
    });
  }

  // Ana: 40h de capacidade, alocação alta (perto de 100%)
  await tarefa(p1.id, "Desenhar fluxo de checkout", "Em Andamento", {
    estimativa_horas: 60,
    responsavelId: ana.id,
    data_fim_planejada: somaDias(hoje, 14),
    data_inicio: subDias(hoje, 10),
  });
  await tarefa(p1.id, "Revisar contrato de API", "A Fazer", { estimativa_horas: 20, responsavelId: ana.id, data_fim_planejada: somaDias(hoje, 7) });
  await tarefa(p1.id, "Testes de carga", "Concluído", {
    estimativa_horas: 30,
    responsavelId: bruno.id,
    data_inicio: subDias(hoje, 20),
    data_conclusao: subDias(hoje, 5),
  });

  // Bruno: sobrecarregado (mais de 3 tarefas em curso), sem bloqueio — p2 fica com 1 sinal só (amarelo)
  for (let i = 1; i <= 4; i++) {
    await tarefa(p2.id, `Migrar módulo ${i}`, "Em Andamento", {
      estimativa_horas: 25,
      responsavelId: bruno.id,
      data_fim_planejada: somaDias(hoje, 20),
      data_inicio: subDias(hoje, 15),
    });
  }

  // Carla: tarefas de p3, algumas concluídas com estimativa pra progresso_objetivo divergir,
  // + 1 bloqueada há 10 dias (> 7 -> S3 e alimenta idade_media_bloqueio)
  await tarefa(p3.id, "Levantamento de requisitos", "Concluído", { estimativa_horas: 40, responsavelId: carla.id, data_inicio: subDias(hoje, 70), data_conclusao: subDias(hoje, 60) });
  await tarefa(p3.id, "Integração com gateway", "Em Andamento", { estimativa_horas: 80, responsavelId: carla.id, data_fim_planejada: somaDias(hoje, 25), data_inicio: subDias(hoje, 30) });
  await tarefa(p3.id, "Homologação PCI", "A Fazer", { estimativa_horas: 40, responsavelId: carla.id, data_fim_planejada: somaDias(hoje, 40) });
  await tarefa(p3.id, "Certificação de segurança", "Bloqueado", { estimativa_horas: 20, responsavelId: carla.id, data_fim_planejada: somaDias(hoje, 30), data_inicio: subDias(hoje, 20), data_bloqueio: subDias(hoje, 10) });

  await tarefa(p4.id, "Setup do projeto mobile", "Concluído", { estimativa_horas: 20, responsavelId: diego.id, data_inicio: subDias(hoje, 55), data_conclusao: subDias(hoje, 50) });
  await tarefa(p4.id, "Tela de login", "Em Andamento", { estimativa_horas: 30, responsavelId: diego.id, data_fim_planejada: somaDias(hoje, 15), data_inicio: subDias(hoje, 20) });

  await tarefa(p5.id, "Suporte legado", "Em Andamento", { estimativa_horas: 15, responsavelId: diego.id, data_fim_planejada: somaDias(hoje, 5), data_inicio: subDias(hoje, 5) });

  // Tarefas concluídas recentemente (últimos 28 dias) em vários projetos, pra alimentar throughput/cycle/lead time.
  for (let i = 0; i < 15; i++) {
    const inicio = subDias(hoje, 20 - i);
    const conclusao = subDias(hoje, Math.max(0, 18 - i));
    await tarefa([p1.id, p2.id, p3.id, p4.id][i % 4], `Tarefa de fluxo ${i}`, "Concluído", {
      estimativa_horas: 8,
      responsavelId: [ana.id, bruno.id, carla.id, diego.id][i % 4],
      data_inicio: inicio,
      data_conclusao: conclusao,
      data_criacao: subDias(inicio, 3),
    });
  }

  // --- TarefaEvento: 3 ciclos de bloqueio/desbloqueio resolvidos nos últimos 28 dias ---
  const tarefaParaEventos = await tarefa(p3.id, "Ajuste de reconciliação", "Em Andamento", { estimativa_horas: 20, responsavelId: carla.id, data_fim_planejada: somaDias(hoje, 10), data_inicio: subDias(hoje, 25) });
  const ciclos = [
    { entrada: subDias(hoje, 20), saida: subDias(hoje, 17) },
    { entrada: subDias(hoje, 14), saida: subDias(hoje, 9) },
    { entrada: subDias(hoje, 6), saida: subDias(hoje, 4) },
  ];
  for (const c of ciclos) {
    await prisma.tarefaEvento.create({ data: { tarefaId: tarefaParaEventos.id, projetoId: p3.id, de_status: "Em Andamento", para_status: "Bloqueado", timestamp: c.entrada } });
    await prisma.tarefaEvento.create({ data: { tarefaId: tarefaParaEventos.id, projetoId: p3.id, de_status: "Bloqueado", para_status: "Em Andamento", timestamp: c.saida } });
  }
  // Registra o evento de entrada em bloqueio da tarefa que já nasceu "Bloqueado" acima.
  const tarefaBloqueadaAberta = (await prisma.tarefa.findFirst({ where: { projetoId: p3.id, status: "Bloqueado" } }))!;
  await prisma.tarefaEvento.create({ data: { tarefaId: tarefaBloqueadaAberta.id, projetoId: p3.id, de_status: "Em Andamento", para_status: "Bloqueado", timestamp: subDias(hoje, 10) } });

  console.log("Seed concluído. Rodando o job de snapshot para gerar saude_exibida inicial...");
  const resultado = await rodarJobDiarioKpiSnapshot();
  console.log(`Snapshot: ${resultado.quantidade} registro(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
