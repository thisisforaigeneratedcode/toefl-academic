// Approximate FX rates relative to 1 USD. Used for display/estimate only.
// Update periodically. Keys are ISO 4217 currency codes.
export const FX_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.37,
  AUD: 1.52,
  NZD: 1.66,
  CHF: 0.88,
  JPY: 156,
  CNY: 7.25,
  INR: 83.5,
  PKR: 278,
  BDT: 117,
  LKR: 305,
  NPR: 133,
  IDR: 16200,
  MYR: 4.7,
  SGD: 1.34,
  THB: 36,
  PHP: 58,
  VND: 25400,
  KRW: 1380,
  HKD: 7.82,
  TWD: 32,
  // Africa
  NGN: 1580, // Nigeria
  KES: 129,  // Kenya
  UGX: 3750, // Uganda
  TZS: 2680, // Tanzania
  RWF: 1340, // Rwanda
  ETB: 122,  // Ethiopia
  GHS: 15.4, // Ghana
  ZAR: 18.6, // South Africa
  EGP: 49,   // Egypt
  MAD: 9.95, // Morocco
  XOF: 605,  // West African CFA
  XAF: 605,  // Central African CFA
  ZMW: 26.5, // Zambia
  MWK: 1740, // Malawi
  // Middle East
  AED: 3.67,
  SAR: 3.75,
  QAR: 3.64,
  TRY: 34,
  ILS: 3.7,
  // Americas / others
  MXN: 17.2,
  BRL: 5.05,
  ARS: 980,
  CLP: 950,
  COP: 4100,
  PEN: 3.78,
  // Europe non-EUR
  PLN: 4.0,
  SEK: 10.6,
  NOK: 10.8,
  DKK: 6.85,
  CZK: 23.2,
  HUF: 360,
  RON: 4.6,
  RUB: 92,
  UAH: 41,
};

// Country -> primary currency code (ISO 3166 alpha-2 -> ISO 4217)
export const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD", CA: "CAD", GB: "GBP", IE: "EUR", AU: "AUD", NZ: "NZD",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", PT: "EUR", AT: "EUR", FI: "EUR", GR: "EUR",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", RU: "RUB", UA: "UAH", TR: "TRY",
  JP: "JPY", CN: "CNY", KR: "KRW", HK: "HKD", TW: "TWD", SG: "SGD", MY: "MYR", TH: "THB", PH: "PHP", VN: "VND", ID: "IDR",
  IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR",
  AE: "AED", SA: "SAR", QA: "QAR", IL: "ILS",
  // Africa
  NG: "NGN", KE: "KES", UG: "UGX", TZ: "TZS", RW: "RWF", ET: "ETB", GH: "GHS",
  ZA: "ZAR", EG: "EGP", MA: "MAD", ZM: "ZMW", MW: "MWK",
  CI: "XOF", SN: "XOF", BJ: "XOF", BF: "XOF", ML: "XOF", NE: "XOF", TG: "XOF",
  CM: "XAF", GA: "XAF", TD: "XAF", CG: "XAF",
  // Americas
  MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
};

// Friendly country list (searchable). Code is ISO alpha-2.
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" }, { code: "CA", name: "Canada" }, { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" }, { code: "AU", name: "Australia" }, { code: "NZ", name: "New Zealand" },
  { code: "DE", name: "Germany" }, { code: "FR", name: "France" }, { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" }, { code: "NL", name: "Netherlands" }, { code: "BE", name: "Belgium" },
  { code: "PT", name: "Portugal" }, { code: "AT", name: "Austria" }, { code: "FI", name: "Finland" },
  { code: "GR", name: "Greece" }, { code: "CH", name: "Switzerland" }, { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" }, { code: "DK", name: "Denmark" }, { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czechia" }, { code: "HU", name: "Hungary" }, { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" }, { code: "UA", name: "Ukraine" }, { code: "TR", name: "Türkiye" },
  { code: "JP", name: "Japan" }, { code: "CN", name: "China" }, { code: "KR", name: "South Korea" },
  { code: "HK", name: "Hong Kong" }, { code: "TW", name: "Taiwan" }, { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" }, { code: "TH", name: "Thailand" }, { code: "PH", name: "Philippines" },
  { code: "VN", name: "Vietnam" }, { code: "ID", name: "Indonesia" },
  { code: "IN", name: "India" }, { code: "PK", name: "Pakistan" }, { code: "BD", name: "Bangladesh" },
  { code: "LK", name: "Sri Lanka" }, { code: "NP", name: "Nepal" },
  { code: "AE", name: "United Arab Emirates" }, { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" }, { code: "IL", name: "Israel" },
  { code: "NG", name: "Nigeria" }, { code: "KE", name: "Kenya" }, { code: "UG", name: "Uganda" },
  { code: "TZ", name: "Tanzania" }, { code: "RW", name: "Rwanda" }, { code: "ET", name: "Ethiopia" },
  { code: "GH", name: "Ghana" }, { code: "ZA", name: "South Africa" }, { code: "EG", name: "Egypt" },
  { code: "MA", name: "Morocco" }, { code: "ZM", name: "Zambia" }, { code: "MW", name: "Malawi" },
  { code: "CI", name: "Côte d'Ivoire" }, { code: "SN", name: "Senegal" }, { code: "CM", name: "Cameroon" },
  { code: "MX", name: "Mexico" }, { code: "BR", name: "Brazil" }, { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" }, { code: "CO", name: "Colombia" }, { code: "PE", name: "Peru" },
];

const STORAGE_KEY = "toefl_currency";
const COUNTRY_KEY = "toefl_country";

export function getStoredCountry(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(COUNTRY_KEY);
}
export function setStoredCountry(code: string) {
  localStorage.setItem(COUNTRY_KEY, code);
  const cur = COUNTRY_CURRENCY[code] ?? "USD";
  localStorage.setItem(STORAGE_KEY, cur);
  window.dispatchEvent(new Event("currency-change"));
}
export function getStoredCurrency(): string {
  if (typeof window === "undefined") return "USD";
  return localStorage.getItem(STORAGE_KEY) ?? "USD";
}
export function setStoredCurrency(code: string) {
  localStorage.setItem(STORAGE_KEY, code);
  window.dispatchEvent(new Event("currency-change"));
}

export function convertFromUSD(usd: number, currency: string): number {
  const r = FX_RATES[currency] ?? 1;
  return usd * r;
}

export function formatPrice(usd: number, currency: string): string {
  const value = convertFromUSD(usd, currency);
  // Decide decimals: large-magnitude currencies (>= 1000 per USD) → no decimals
  const noDecimals = ["JPY", "KRW", "VND", "IDR", "UGX", "TZS", "RWF", "NGN", "MWK", "COP", "CLP", "HUF", "PKR", "LKR", "XOF", "XAF", "KES"].includes(currency);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: noDecimals ? 0 : 2,
      minimumFractionDigits: noDecimals ? 0 : 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(noDecimals ? 0 : 2)}`;
  }
}
