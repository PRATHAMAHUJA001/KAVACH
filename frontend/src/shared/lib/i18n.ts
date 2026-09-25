import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { useMemo } from "react";
import en from "./locales/en.json";
import hi from "./locales/hi.json";
import * as f from "./format";

const STORAGE_KEY = "kavach.lang";

function initialLang(): f.Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "hi") return v;
  } catch {
    /* storage unavailable */
  }
  return "en";
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: initialLang(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
});
document.documentElement.lang = i18n.language;

export default i18n;

/** Formatters bound to the current UI language. */
export function useFormat() {
  const { i18n: inst } = useTranslation();
  const lang: f.Lang = inst.language === "hi" ? "hi" : "en";
  return useMemo(
    () => ({
      lang,
      money: (n: number) => f.formatMoneyCompact(n, lang),
      moneyExact: f.formatMoneyExact,
      number: f.formatNumber,
      percent: f.formatPercent,
      date: (d: string | number | Date) => f.formatDate(d, lang),
      dayMonth: (d: string | number | Date) => f.formatDayMonth(d, lang),
      dateTime: (d: string | number | Date) => f.formatDateTime(d, lang),
      time: f.formatTime,
      deadline: (d: string | number | Date, now?: Date) => f.deadlineInfo(d, now, lang),
      span: (ms: number) => f.formatSpan(ms, lang),
    }),
    [lang],
  );
}
