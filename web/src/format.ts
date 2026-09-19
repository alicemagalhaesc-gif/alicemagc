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

export function dias(v: number | null): string {
  if (v === null) return "—";
  return `${v} dia${Math.abs(v) === 1 ? "" : "s"}`;
}

export function dataBR(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
}
