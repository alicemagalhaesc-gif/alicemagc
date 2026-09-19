const TIMEZONE = "America/Bahia"; // UTC-3

/**
 * Data corrente (sem hora) no fuso de referência do app, normalizada para
 * meia-noite UTC — é assim que os campos `date` são armazenados/comparados.
 * Aceita um `agora` opcional só para permitir simulação em testes/demos;
 * nunca deve ser usado para fabricar datas de negócio.
 */
export function hojeBahia(agora: Date = new Date()): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(agora);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Diferença em dias corridos entre duas datas (a - b). */
export function diffDiasCorridos(a: Date, b: Date): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((a.getTime() - b.getTime()) / MS_POR_DIA);
}
