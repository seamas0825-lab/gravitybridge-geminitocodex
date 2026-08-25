import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { gravityBridgeEn, gravityBridgeZh, gravityBridgeZhTw } from "./gravitybridge";

export type GravityLocale = "en" | "zh" | "zh-TW";
export type GravityKey = keyof typeof gravityBridgeEn;
type Vars = Record<string, string | number>;
type Translate = (key: GravityKey, vars?: Vars) => string;

export const GRAVITY_LOCALES: { code: GravityLocale; htmlLang: string; label: string }[] = [
  { code: "en", htmlLang: "en", label: "English" },
  { code: "zh", htmlLang: "zh-CN", label: "简体中文" },
  { code: "zh-TW", htmlLang: "zh-TW", label: "繁體中文" },
];

const dictionaries: Record<GravityLocale, Record<GravityKey, string>> = {
  en: gravityBridgeEn,
  zh: gravityBridgeZh,
  "zh-TW": gravityBridgeZhTw,
};

const Context = createContext<{ locale: GravityLocale; setLocale: (locale: GravityLocale) => void; t: Translate } | null>(null);

function detectLocale(): GravityLocale {
  try {
    const saved = localStorage.getItem("gravitybridge-lang");
    if (saved === "en" || saved === "zh" || saved === "zh-TW") return saved;
  } catch { /* storage may be unavailable */ }
  const language = typeof navigator === "undefined" ? "en" : navigator.language.toLowerCase();
  if (language.includes("tw") || language.includes("hk") || language.includes("hant")) return "zh-TW";
  return language.startsWith("zh") ? "zh" : "en";
}

function interpolate(value: string, vars?: Vars): string {
  if (!vars) return value;
  let output = value;
  for (const [key, replacement] of Object.entries(vars)) {
    output = output.split(`{${key}}`).join(String(replacement));
  }
  return output;
}

export function GravityLanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<GravityLocale>(detectLocale);
  const setLocale = useCallback((next: GravityLocale) => setLocaleState(next), []);
  useEffect(() => {
    document.documentElement.lang = GRAVITY_LOCALES.find(item => item.code === locale)?.htmlLang ?? "en";
    try { localStorage.setItem("gravitybridge-lang", locale); } catch { /* storage may be unavailable */ }
  }, [locale]);
  const t = useCallback<Translate>(
    (key, vars) => interpolate(dictionaries[locale][key] ?? gravityBridgeEn[key] ?? key, vars),
    [locale],
  );
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useGravityI18n() {
  const value = useContext(Context);
  if (!value) throw new Error("useGravityI18n must be used inside GravityLanguageProvider");
  return value;
}

export function useGravityT(): Translate {
  return useGravityI18n().t;
}
