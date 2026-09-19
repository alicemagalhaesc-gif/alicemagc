import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

export function LoginPage() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await login(email, senha);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={aoEnviar}>
        <div className="login-brand">
          <span className="sidebar-brand-mark">PM</span>
          <div>
            <div className="login-brand-title">{t("sidebar.brandTitle")}</div>
            <div className="login-brand-sub">{t("sidebar.brandSub")}</div>
          </div>
        </div>

        <h1 className="login-titulo">{t("login.titulo")}</h1>

        <label className="login-campo">
          {t("login.email")}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label className="login-campo">
          {t("login.senha")}
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {erro && <div className="login-erro">{erro}</div>}

        <button type="submit" className="btn" disabled={enviando} style={{ width: "100%" }}>
          {enviando ? t("login.entrando") : t("login.entrar")}
        </button>
      </form>
    </div>
  );
}
