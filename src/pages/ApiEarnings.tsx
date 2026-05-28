import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { pretiumDisburseFee } from "@/lib/pretium";

const AUTO_SETTLE_THRESHOLD = 5000;

export default function ApiEarnings() {
  const { user, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [apicosts, setApicosts] = useState<any[]>([]);
  const [settling, setSettling] = useState(false);
  const [autoSettle, setAutoSettle] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const loadData = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "api_owner_user_id")
      .maybeSingle();
    setAuthorized(!!data && data.value === user.id);
    if (data?.value === user.id) {
      const [{ data: rows }, { data: flag }] = await Promise.all([
        supabase.from("apicosts").select("*").order("created_at", { ascending: false }),
        supabase.from("site_settings").select("value").eq("key", "auto_settle_enabled").maybeSingle(),
      ]);
      setApicosts(rows || []);
      setAutoSettle(flag?.value === "true");
    }
  };

  const toggleAutoSettle = async () => {
    setTogglingAuto(true);
    const newVal = autoSettle ? "false" : "true";
    await supabase.from("site_settings").update({ value: newVal }).eq("key", "auto_settle_enabled");
    setAutoSettle(!autoSettle);
    setTogglingAuto(false);
  };

  useEffect(() => { loadData(); }, [user]);

  const depositRows    = apicosts.filter(r => r.type === "deposit");
  const settlementRows = apicosts.filter(r => r.type === "settlement");

  const mpesaDeposits   = depositRows.filter(r => !String(r.payment_id ?? "").startsWith("TA-"));
  const cardDeposits    = depositRows.filter(r => String(r.payment_id ?? "").startsWith("TA-"));

  const mpesaEarned   = mpesaDeposits.reduce((s, r) => s + (r.api_earnings_kes ?? 0), 0);
  const cardEarned    = cardDeposits.reduce((s, r) => s + (r.api_earnings_kes ?? 0), 0);
  const totalEarned   = mpesaEarned + cardEarned;

  const totalSettled  = depositRows.filter(r => r.owner_withdrawn).reduce((s, r) => s + (r.owner_earnings_kes ?? 0), 0)
    + settlementRows.reduce((s, r) => s + (r.owner_earnings_kes ?? 0), 0);

  const mpesaPending  = 0; // managed manually via admin wallet
  const cardPending   = cardEarned; // never auto-settled — always manual
  const pending       = Math.max(0, totalEarned - totalSettled);
  const isReady       = mpesaPending >= AUTO_SETTLE_THRESHOLD;

  const handleSettle = async () => {
    if (pending <= 0) return;
    const amount = Number(withdrawAmount) || pending;
    setSettling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("withdraw-api-costs", {
        body: { target: "owner", amount },
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      toast.success(`KES ${data.you_receive_kes?.toLocaleString()} is on the way to M-Pesa`);
      loadData();
    } catch (e: any) {
      toast.error(e.message ?? "Settlement failed");
    }
    setSettling(false);
  };

  if (loading || authorized === null) {
    return <Layout><div className="container py-20 text-center">Loading...</div></Layout>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!authorized) return <Navigate to="/" replace />;

  return (
    <Layout>
      <div className="container mx-auto py-12 max-w-2xl">

        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Total pending earnings</p>
            <p className="text-4xl font-bold text-primary">KES {pending.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">
              KES {totalEarned.toLocaleString()} earned all-time · KES {totalSettled.toLocaleString()} settled
            </p>
          </div>
          <button
            onClick={toggleAutoSettle}
            disabled={togglingAuto}
            className={`mt-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              autoSettle ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Auto-settle: {autoSettle ? "ON" : "OFF"}
          </button>
        </div>

        {/* Card earnings — manual deduction reminder */}
        {cardPending > 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 mb-4">
            <p className="text-sm font-semibold text-blue-800">Card payments (Paystack)</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">KES {cardPending.toLocaleString()}</p>
            <p className="text-xs text-blue-600 mt-1">
              Deduct this from your next Paystack bank transfer — this is your 8% cut from card payments.
            </p>
          </div>
        )}

        {/* M-Pesa earnings — settleable via Pretium */}
        {mpesaPending > 0 && (
          <div className="rounded-xl border border-border bg-secondary/20 p-5 space-y-3 mb-10">
            <div>
              <p className="text-sm font-semibold">M-Pesa earnings (Pretium)</p>
              <p className="text-2xl font-bold text-primary mt-1">KES {mpesaPending.toLocaleString()}</p>
            </div>
            {!isReady && (
              <p className="text-xs text-muted-foreground">
                KES {(AUTO_SETTLE_THRESHOLD - mpesaPending).toLocaleString()} until auto-settle threshold
              </p>
            )}
            <div className="border-t border-border pt-3 space-y-2">
              <label className="text-xs text-muted-foreground">Amount to withdraw (KES)</label>
              <input
                type="number"
                min={1}
                max={mpesaPending}
                value={withdrawAmount}
                onChange={e => setWithdrawAmount(e.target.value)}
                placeholder={mpesaPending.toLocaleString()}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
              {(() => {
                const amt = Math.min(Number(withdrawAmount) || mpesaPending, mpesaPending);
                const f   = pretiumDisburseFee(amt);
                const r   = Math.max(0, amt - f);
                return (
                  <div className="text-xs space-y-0.5 text-muted-foreground">
                    <div className="flex justify-between"><span>Pretium fee</span><span>− KES {f.toLocaleString()}</span></div>
                    <div className="flex justify-between font-semibold text-primary border-t border-border pt-1 mt-1">
                      <span>Will receive</span><span>KES {r.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })()}
              <button
                onClick={handleSettle}
                disabled={settling || mpesaPending <= 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 w-full justify-center"
              >
                {settling
                  ? <><Loader2 size={13} className="animate-spin" /> Settling…</>
                  : <><Smartphone size={13} /> Settle to M-Pesa</>
                }
              </button>
            </div>
          </div>
        )}

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-4">Transactions</p>
          {apicosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {apicosts.map((r) => {
                const isDeposit = r.type === "deposit";
                const isCard = typeof r.payment_id === "string" && r.payment_id.startsWith("TA-");
                const feeLabel = isCard ? "Card fee (1.5%)" : "M-Pesa fee (2%)";
                const net = r.transaction_amount_kes - r.pretium_fee_kes;
                return (
                  <div key={r.id} className="py-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-primary flex items-center gap-2">
                        {isDeposit ? "Exam payment" : "Withdrawal"}
                        {isDeposit && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                            isCard ? "text-blue-700 border-blue-300" : "text-green-700 border-green-300"
                          }`}>
                            {isCard ? "Card" : "M-Pesa"}
                          </span>
                        )}
                      </p>
                      {isDeposit && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          KES {r.transaction_amount_kes?.toLocaleString()} in
                          {" "}· {feeLabel} −KES {r.pretium_fee_kes?.toLocaleString()}
                          {" "}· net KES {net.toLocaleString()}
                          {" "}· cut (8%) KES {r.api_earnings_kes?.toLocaleString()}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(r.created_at), "d MMM yyyy")}
                      </p>
                    </div>
                    {isDeposit && (
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          Earnings: <span className="font-semibold text-primary">+KES {r.owner_earnings_kes?.toLocaleString()}</span>
                          <span className={`ml-1 ${r.owner_withdrawn ? "text-green-600" : "text-muted-foreground"}`}>
                            {r.owner_withdrawn ? "✓ settled" : "· pending"}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
