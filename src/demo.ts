import assert from "node:assert/strict";
import { prisma, garantirTriggersDeImutabilidade } from "./db";
import { criarProjeto, atualizarProjeto, revisarBaseline } from "./domain/projetoService";
import { criarTarefa, atualizarStatusTarefa } from "./domain/tarefaService";

let passou = 0;
let falhou = 0;

async function criterio(numero: number, descricao: string, fn: () => Promise<void>) {
  try {
    await fn();
    passou++;
    console.log(`✅ [${numero}] ${descricao}`);
  } catch (err) {
    falhou++;
    console.log(`❌ [${numero}] ${descricao}`);
    console.log(`   -> ${(err as Error).message}`);
  }
}

function d(iso: string): Date {
  return new Date(iso + "T00:00:00.000Z");
}

async function limparBanco() {
  await prisma.baselineAuditLog.deleteMany();
  await prisma.tarefaEvento.deleteMany();
  await prisma.tarefa.deleteMany();
  await prisma.projeto.deleteMany();
  await prisma.pessoa.deleteMany();
}

async function main() {
  await garantirTriggersDeImutabilidade();
  await limparBanco();

  // Projeto usado nos critérios 1, 2, 3, 4, 5
  let projeto = await criarProjeto({
    nome: "Migração de plataforma",
    status: "Planejamento",
    data_inicio: d("2026-01-01"),
    data_fim_planejada: d("2026-12-31"),
  });

  await criterio(
    1,
    'Planejamento -> Em Andamento copia data_fim_planejada para as duas baselines',
    async () => {
      projeto = await atualizarProjeto(projeto.id, { status: "Em Andamento" });
      assert.equal(projeto.data_fim_baseline?.toISOString().slice(0, 10), "2026-12-31");
      assert.equal(projeto.data_fim_baseline_original?.toISOString().slice(0, 10), "2026-12-31");
    }
  );

  await criterio(
    2,
    "Replanejamento (mudar data_fim_planejada) não altera nenhuma baseline",
    async () => {
      projeto = await atualizarProjeto(projeto.id, { data_fim_planejada: d("2027-03-31") });
      assert.equal(projeto.data_fim_planejada?.toISOString().slice(0, 10), "2027-03-31");
      assert.equal(projeto.data_fim_baseline?.toISOString().slice(0, 10), "2026-12-31");
      assert.equal(projeto.data_fim_baseline_original?.toISOString().slice(0, 10), "2026-12-31");
    }
  );

  await criterio(
    3,
    "Não existe campo de baseline em nenhum formulário de edição (ProjetoEditInput)",
    async () => {
      // Verificação estrutural: nenhuma chamada a atualizarProjeto aceita
      // essas chaves — o teste tenta "colar" os campos por fora do tipo
      // (via `as any`) para provar que são ignorados mesmo assim.
      const antes = await prisma.projeto.findUniqueOrThrow({ where: { id: projeto.id } });
      // data_fim_baseline não existe em ProjetoEditInput; simula um caller
      // "malicioso" que tenta colar o campo por fora do tipo estático.
      const inputForaDoTipo: Record<string, unknown> = {
        nome: antes.nome,
        data_fim_baseline: d("1999-01-01"),
      };
      const resultado = await atualizarProjeto(projeto.id, inputForaDoTipo as any);
      assert.equal(
        resultado.data_fim_baseline?.toISOString().slice(0, 10),
        antes.data_fim_baseline?.toISOString().slice(0, 10),
        "campo de baseline enviado por fora do formulário foi ignorado"
      );
    }
  );

  await criterio(
    4,
    "Escrita direta em data_fim_baseline_original é rejeitada pela camada de dados",
    async () => {
      // O SQLite rejeita a escrita via RAISE(ABORT) no trigger, mas o
      // mapeador de erros do Prisma rotula qualquer SQLITE_CONSTRAINT
      // vindo de um trigger como "Foreign key constraint violated" — a
      // mensagem original do trigger não chega até o client. O que
      // importa para este critério é que a escrita é rejeitada.
      await assert.rejects(() =>
        prisma.projeto.update({
          where: { id: projeto.id },
          data: { data_fim_baseline_original: d("1999-01-01") },
        })
      );
    }
  );

  await criterio(
    5,
    'Ação "Revisar baseline" altera data_fim_baseline, incrementa contador e preserva a original',
    async () => {
      const antes = await prisma.projeto.findUniqueOrThrow({ where: { id: projeto.id } });
      projeto = await revisarBaseline(projeto.id, {
        novaDataFimBaseline: d("2027-06-30"),
        motivo: "Atraso de fornecedor crítico",
      });
      assert.equal(projeto.data_fim_baseline?.toISOString().slice(0, 10), "2027-06-30");
      assert.equal(projeto.numero_revisoes_baseline, 1);
      assert.equal(
        projeto.data_fim_baseline_original?.toISOString().slice(0, 10),
        antes.data_fim_baseline_original?.toISOString().slice(0, 10)
      );
      const auditoria = await prisma.baselineAuditLog.findMany({ where: { projetoId: projeto.id } });
      assert.equal(auditoria.length, 1);
      assert.equal(auditoria[0].motivo, "Atraso de fornecedor crítico");
    }
  );

  await criterio(
    5.1,
    'Ação "Revisar baseline" sem motivo é rejeitada',
    async () => {
      await assert.rejects(
        () => revisarBaseline(projeto.id, { novaDataFimBaseline: d("2027-07-31"), motivo: "" }),
        /motivo/
      );
    }
  );

  // Tarefa usada nos critérios 6, 7, 8
  const tarefa0 = await criarTarefa({
    nome: "Configurar ambiente de homologação",
    projetoId: projeto.id,
    status: "A Fazer",
  });

  let tarefa = await atualizarStatusTarefa(
    tarefa0.id,
    { novoStatus: "Em Andamento" },
    new Date("2026-10-01T12:00:00.000Z")
  );
  tarefa = await atualizarStatusTarefa(
    tarefa0.id,
    { novoStatus: "Bloqueado" },
    new Date("2026-10-03T12:00:00.000Z")
  );
  tarefa = await atualizarStatusTarefa(
    tarefa0.id,
    { novoStatus: "Em Andamento" },
    new Date("2026-10-07T12:00:00.000Z")
  );

  await criterio(
    6,
    "data_inicio não é sobrescrita em Em Andamento -> Bloqueado -> Em Andamento",
    async () => {
      assert.equal(tarefa.data_inicio?.toISOString().slice(0, 10), "2026-10-01");
    }
  );

  await criterio(7, "Tarefa gerou 3 eventos de transição + 1 de criação = 4", async () => {
    const eventos = await prisma.tarefaEvento.findMany({
      where: { tarefaId: tarefa0.id },
      orderBy: { timestamp: "asc" },
    });
    assert.equal(eventos.length, 4);
    assert.deepEqual(
      eventos.map((e) => [e.de_status, e.para_status]),
      [
        [null, "A Fazer"],
        ["A Fazer", "Em Andamento"],
        ["Em Andamento", "Bloqueado"],
        ["Bloqueado", "Em Andamento"],
      ]
    );
  });

  await criterio(
    8,
    "Ao sair de Bloqueado, data_bloqueio fica vazia mas o evento de bloqueio permanece",
    async () => {
      assert.equal(tarefa.data_bloqueio, null);
      const eventoBloqueio = await prisma.tarefaEvento.findFirst({
        where: { tarefaId: tarefa0.id, para_status: "Bloqueado" },
      });
      assert.ok(eventoBloqueio, "evento de entrada em Bloqueado deve continuar em TarefaEvento");
    }
  );

  await criterio(
    9,
    "Mudar status de tarefa atualiza data_ultima_atividade do projeto e NÃO data_ultimo_status_report",
    async () => {
      const projetoAntes = await prisma.projeto.findUniqueOrThrow({ where: { id: projeto.id } });
      const reportAntes = projetoAntes.data_ultimo_status_report?.getTime();

      await atualizarStatusTarefa(
        tarefa0.id,
        { novoStatus: "Concluído" },
        new Date("2026-10-10T09:00:00.000Z")
      );

      const projetoDepois = await prisma.projeto.findUniqueOrThrow({ where: { id: projeto.id } });
      assert.ok(projetoDepois.data_ultima_atividade, "data_ultima_atividade deveria estar preenchida");
      assert.equal(
        projetoDepois.data_ultimo_status_report?.getTime(),
        reportAntes,
        "data_ultimo_status_report não deveria mudar com escrita em tarefa"
      );
    }
  );

  await criterio(10, "Alterar o progresso do projeto atualiza data_ultimo_status_report", async () => {
    const antes = await prisma.projeto.findUniqueOrThrow({ where: { id: projeto.id } });
    // Força a próxima escrita a passar do debounce de atividade para focar no que o critério mede.
    await new Promise((r) => setTimeout(r, 5));
    const depois = await atualizarProjeto(projeto.id, { progresso: 42 });
    assert.equal(depois.progresso, 42);
    assert.notEqual(
      depois.data_ultimo_status_report?.getTime(),
      antes.data_ultimo_status_report?.getTime()
    );
  });

  // Projeto usado no critério 11 (pausa)
  await criterio(11, "Projeto pausado por 10 dias e retomado acumula 10 dias e limpa data_pausa", async () => {
    let p = await criarProjeto({
      nome: "Projeto de teste de pausa",
      status: "Em Andamento",
      data_inicio: d("2026-01-01"),
      data_fim_planejada: d("2026-06-30"),
    });

    p = await atualizarProjeto(p.id, { status: "Pausado" }, new Date("2026-02-01T10:00:00.000Z"));
    assert.equal(p.data_pausa?.toISOString().slice(0, 10), "2026-02-01");

    p = await atualizarProjeto(p.id, { status: "Em Andamento" }, new Date("2026-02-11T10:00:00.000Z"));
    assert.equal(p.dias_pausado_acumulado, 10);
    assert.equal(p.data_pausa, null);
  });

  console.log(`\n${passou} passaram, ${falhou} falharam`);
  await prisma.$disconnect();
  if (falhou > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
