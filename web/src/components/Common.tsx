import type { ReactNode } from "react";
import type { StatusRagOuPausado } from "../types";
import { useLanguage } from "../i18n/LanguageContext";

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="tooltip-wrap" tabIndex={0}>
      {children}
      <span className="tooltip-bubble">{text}</span>
    </span>
  );
}

export function StatusDot({ status }: { status: StatusRagOuPausado }) {
  return <span className={`status-dot ${status}`} aria-label={`status ${status}`} title={status} />;
}

/**
 * Valor ausente é SEMPRE "—" com o motivo em tooltip — nunca 0.
 * (Regra visual geral da entrega 4.)
 */
export function ValorOuTraco({ valor, texto, motivoNulo }: { valor: number | null; texto: string; motivoNulo: string | null }) {
  const { t } = useLanguage();
  if (valor === null) {
    return (
      <Tooltip text={motivoNulo ?? t("geral.semDado")}>
        <span className="card-value is-muted">—</span>
      </Tooltip>
    );
  }
  return <span className="card-value">{texto}</span>;
}

export function Card({
  titulo,
  status,
  onClick,
  children,
}: {
  titulo: string;
  status?: StatusRagOuPausado;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`card${onClick ? " is-clickable" : ""}`} onClick={onClick} role={onClick ? "button" : undefined}>
      <div className="card-title">
        <span>{titulo}</span>
        {status && <StatusDot status={status} />}
      </div>
      {children}
    </div>
  );
}
