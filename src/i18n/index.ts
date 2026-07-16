import { Lang, TranslationKey, translations } from "./translations";

const LANG_KEY = "rr_lang";
type Listener = (lang: Lang) => void;

let currentLang: Lang = "es";
const listeners = new Set<Listener>();

export function getLang(): Lang {
  return currentLang;
}

export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const table = translations[currentLang] || translations.es;
  let text: string = table[key] || translations.es[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

export function statusLabel(status: string): string {
  const map: Record<string, TranslationKey> = {
    "Reserva confirmada": "status.confirmed",
    "En lavado": "status.washing",
    "Listo para entregar": "status.ready",
    Cancelado: "status.cancelled",
  };
  const key = map[status];
  return key ? t(key) : status;
}

export function vehicleTypeLabel(value: string): string {
  const map: Record<string, TranslationKey> = {
    Carro: "type.car",
    Jeepeta: "type.suv",
    Camioneta: "type.truck",
    "Vehículo grande": "type.large",
  };
  const key = map[value];
  return key ? t(key) : value;
}

export function paymentMethodLabel(value: string): string {
  const map: Record<string, TranslationKey> = {
    Efectivo: "pay.cash",
    Tarjeta: "pay.card",
    Transferencia: "pay.transfer",
    "Reserva sin pago": "pay.none",
  };
  const key = map[value];
  return key ? t(key) : value;
}

export function washerOptionLabel(name: string, specialist = false): string {
  if (name === "Aleatorio +" || name === "Cualquier lavador disponible") {
    return t("booking.washerAny");
  }
  return specialist ? `${name}${t("booking.specialist")}` : name;
}

export function binLabel(id: string): string {
  const map: Record<string, TranslationKey> = {
    reservations: "bins.reservations",
    services: "bins.services",
    vehicles: "bins.vehicles",
    clients: "bins.clients",
    washers: "bins.washers",
    settings: "bins.settings",
    notes: "bins.notes",
  };
  const key = map[id];
  return key ? t(key) : id;
}

export function binDescription(id: string): string {
  const map: Record<string, TranslationKey> = {
    reservations: "bins.reservationsDesc",
    services: "bins.servicesDesc",
    vehicles: "bins.vehiclesDesc",
    clients: "bins.clientsDesc",
    washers: "bins.washersDesc",
    settings: "bins.settingsDesc",
    notes: "bins.notesDesc",
  };
  const key = map[id];
  return key ? t(key) : "";
}

export function localeTag(): string {
  return currentLang === "en" ? "en-US" : "es-DO";
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = lang;
  applyTranslations(document);
  updateLangToggle();
  listeners.forEach((fn) => fn(lang));
}

export function onLangChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initI18n(): Lang {
  const saved = localStorage.getItem(LANG_KEY);
  currentLang = saved === "en" || saved === "es" ? saved : "es";
  document.documentElement.lang = currentLang;
  applyTranslations(document);
  updateLangToggle();
  return currentLang;
}

export function applyTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n as TranslationKey | undefined;
    if (!key) return;
    el.textContent = t(key);
  });

  root.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => {
    const key = el.dataset.i18nHtml as TranslationKey | undefined;
    if (!key) return;
    el.innerHTML = t(key);
  });

  root.querySelectorAll<HTMLElement>("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder as TranslationKey | undefined;
    if (!key) return;
    el.setAttribute("placeholder", t(key));
  });

  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle as TranslationKey | undefined;
    if (!key) return;
    el.setAttribute("title", t(key));
  });

  root.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((el) => {
    const key = el.dataset.i18nAria as TranslationKey | undefined;
    if (!key) return;
    el.setAttribute("aria-label", t(key));
  });
}

function updateLangToggle(): void {
  document.querySelectorAll<HTMLElement>("[data-lang-toggle]").forEach((btn) => {
    btn.textContent = t("lang.switch");
    btn.setAttribute("aria-label", t("lang.label"));
    btn.title = t("lang.label");
  });
}

export function toggleLang(): void {
  setLang(currentLang === "es" ? "en" : "es");
}

export function mountLangToggle(): void {
  document.querySelectorAll<HTMLElement>("[data-lang-toggle]").forEach((btn) => {
    if (btn.dataset.langBound === "1") return;
    btn.dataset.langBound = "1";
    btn.addEventListener("click", () => toggleLang());
  });
  updateLangToggle();
}
