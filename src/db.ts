import "dotenv/config";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Garante a existência do trigger de imutabilidade de
 * data_fim_baseline_original diretamente na camada de dados (Postgres).
 * Idempotente: seguro chamar a cada boot da aplicação.
 *
 * Isso bloqueia QUALQUER escrita que altere o valor já gravado — via
 * Prisma, API, importação em lote ou SQL cru — não apenas o que a UI
 * expõe em formulários. Postgres exige uma função + um trigger que a
 * chama (sintaxe diferente do SQLite, que aceitava a condição inline).
 */
export async function garantirTriggersDeImutabilidade(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION trg_fn_projeto_baseline_original_imutavel()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.data_fim_baseline_original IS NOT NULL
        AND (
          NEW.data_fim_baseline_original IS NULL
          OR NEW.data_fim_baseline_original <> OLD.data_fim_baseline_original
        )
      THEN
        RAISE EXCEPTION 'data_fim_baseline_original é imutável após a primeira escrita';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await prisma.$executeRawUnsafe(`
    DROP TRIGGER IF EXISTS trg_projeto_baseline_original_imutavel ON "Projeto";
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER trg_projeto_baseline_original_imutavel
    BEFORE UPDATE ON "Projeto"
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_projeto_baseline_original_imutavel();
  `);
}
