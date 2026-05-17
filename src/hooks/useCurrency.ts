import { useEffect, useState } from "react";
import { getStoredCurrency, setStoredCurrency, formatPrice } from "@/lib/currency";

export function useCurrency() {
  const [currency, setCurrency] = useState<string>(getStoredCurrency());

  useEffect(() => {
    const handler = () => setCurrency(getStoredCurrency());
    window.addEventListener("currency-change", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("currency-change", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  return {
    currency,
    setCurrency: (c: string) => { setStoredCurrency(c); setCurrency(c); },
    format: (usd: number) => formatPrice(usd, currency),
  };
}
