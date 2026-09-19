import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { TRADUCOES, type Idioma, type ChaveTraducao } from "./translations";

const CHAVE_LOCALSTORAGE = "idioma";

function idiomaInicial(): Idioma {
  try {
    const salvo = localStorage.getItem(CHAVE_LOCALSTORAGE);
    if (salvo === "pt" || salvo === "en" || salvo === "es") return salvo;
  } catch {
    // localStorage indisponível (modo privado etc.) — usa o padrão.
  }
  return "pt";
}

interface LanguageContextValue {
  idioma: Idioma;
  setIdioma: (i: Idioma) => void;
  t: (chave: ChaveTraducao, variaveis?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [idioma, setIdiomaState] = useState<Idioma>(idiomaInicial);

  const setIdioma = useCallback((i: Idioma) => {
    setIdiomaState(i);
    try {
      localStorage.setItem(CHAVE_LOCALSTORAGE, i);
    } catch {
      // ignora — preferência só não persiste entre sessões
    }
  }, []);

  const t = useCallback(
    (chave: ChaveTraducao, variaveis?: Record<string, string | number>) => {
      const entrada = TRADUCOES[chave];
      let texto: string = entrada ? entrada[idioma] : chave;
      if (variaveis) {
        for (const [k, v] of Object.entries(variaveis)) {
          texto = texto.replace(`{${k}}`, String(v));
        }
      }
      return texto;
    },
    [idioma]
  );

  return <LanguageContext.Provider value={{ idioma, setIdioma, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage precisa estar dentro de <LanguageProvider>");
  return ctx;
}
