import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Globe2, Check } from "lucide-react";
import { COUNTRIES, COUNTRY_CURRENCY, FX_RATES, getStoredCountry, setStoredCountry, setStoredCurrency } from "@/lib/currency";
import { useCurrency } from "@/hooks/useCurrency";

export default function CurrencyPicker({ compact = false }: { compact?: boolean }) {
  const { currency } = useCurrency();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const country = getStoredCountry();

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    c.code.toLowerCase().includes(q.toLowerCase()) ||
    (COUNTRY_CURRENCY[c.code] ?? "").toLowerCase().includes(q.toLowerCase())
  );

  const otherCurrencies = Object.keys(FX_RATES)
    .filter(c => c.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 6);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-2">
          <Globe2 className="w-4 h-4" />
          <span className="text-xs font-semibold">{currency}</span>
          {!compact && country && <span className="text-xs text-muted-foreground">· {country}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="p-2 border-b border-border">
          <Input
            placeholder="Search country or currency…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Countries</div>
              {filtered.slice(0, 50).map(c => {
                const cur = COUNTRY_CURRENCY[c.code] ?? "USD";
                const active = country === c.code;
                return (
                  <button
                    key={c.code}
                    onClick={() => { setStoredCountry(c.code); setOpen(false); }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-muted text-left"
                  >
                    <span>{c.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {cur}{active && <Check className="w-3 h-3 text-accent" />}
                    </span>
                  </button>
                );
              })}
            </>
          )}
          {otherCurrencies.length > 0 && q && (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground border-t border-border mt-1">Currencies</div>
              {otherCurrencies.map(c => (
                <button
                  key={c}
                  onClick={() => { setStoredCurrency(c); setOpen(false); }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-muted text-left"
                >
                  <span>{c}</span>
                  {currency === c && <Check className="w-3 h-3 text-accent" />}
                </button>
              ))}
            </>
          )}
          {filtered.length === 0 && otherCurrencies.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">No matches</div>
          )}
        </div>
        <div className="p-2 border-t border-border text-[10px] text-muted-foreground text-center">
          Prices are estimates · charged in USD
        </div>
      </PopoverContent>
    </Popover>
  );
}
