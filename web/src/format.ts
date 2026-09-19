export function pct(v: number | null, casas = 0): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(casas)}%`;
}

export function num(v: number | null, casas = 2): string {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function moeda(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const PALAVRA_DIA: Record<"pt" | "en" | "es", (v: number) => string> = {
  pt: (v) => `dia${Math.abs(v) === 1 ? "" : "s"}`,
  en: (v) => `day${Math.abs(v) === 1 ? "" : "s"}`,
  es: (v) => `día${Math.abs(v) === 1 ? "" : "s"}`,
};

export function dias(v: number | null, idioma: "pt" | "en" | "es" = "pt"): string {
  if (v === null) return "—";
  return `${v} ${PALAVRA_DIA[idioma](v)}`;
}

export function dataBR(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
}
