import { prisma } from "../db";
import { listarProjetosParaRegularizar, contarRegularizacao } from "../domain/regularizacaoService";

/**
 * "Tela" Regularizar projetos (entrega 2, seção 2), renderizada em texto.
 * Ainda não existe frontend no app — esta função é o que um componente de
 * UI chamaria; a lógica de listagem/contagem já está pronta em
 * src/domain/regularizacaoService.ts para ser consumida por uma tela real
 * quando o dashboard for construído (entregas futuras).
 */
export async function renderizarTelaRegularizarProjetos(): Promise<void> {
  const [projetos, contador] = await Promise.all([
    listarProjetosParaRegularizar(),
    contarRegularizacao(),
  ]);

  console.log(`\n${contador.regularizados} de ${contador.total} projetos regularizados\n`);

  if (projetos.length === 0) {
    console.log("Nenhum projeto pendente de regularização.");
    return;
  }

  console.table(
    projetos.map((p) => ({
      id: p.id,
      nome: p.nome,
      status: p.status,
      data_inicio: p.data_inicio ? p.data_inicio.toISOString().slice(0, 10) : "—",
      data_fim_planejada: p.data_fim_planejada ? p.data_fim_planejada.toISOString().slice(0, 10) : "—",
      dados_estimados: p.dados_estimados,
    }))
  );
}

if (require.main === module) {
  renderizarTelaRegularizarProjetos().finally(() => prisma.$disconnect());
}
