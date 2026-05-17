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
  const [settling, setSettling] = useState<"owner" | "partner" | null>(null);
  const [autoSettle, setAutoSettle] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);
  const [withdrawAmounts, setWithdrawAmounts] = useState({ owner: "", partner: "" });

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

  const ownerEarned   = depositRows.reduce((s, r) => s + (r.owner_earnings_kes ?? 0), 0);
  const partnerEarned = depositRows.reduce((s, r) => s + (r.partner_earnings_kes ?? 0), 0);

  const ownerSettledViaRows   = depositRows.filter(r => r.owner_withdrawn).reduce((s, r) => s + (r.owner_earnings_kes ?? 0), 0);
  const ownerSettledViaRecs   = settlementRows.reduce((s, r) => s + (r.owner_earnings_kes ?? 0), 0);
  const partnerSettledViaRows = depositRows.filter(r => r.partner_withdrawn).reduce((s, r) => s + (r.partner_earnings_kes ?? 0), 0);
  const partnerSettledViaRecs = settlementRows.reduce((s, r) => s + (r.partner_earnings_kes ?? 0), 0);

  const ownerSettled   = ownerSettledViaRows + ownerSettledViaRecs;
  const partnerSettled = partnerSettledViaRows + partnerSettledViaRecs;
  const ownerPending   = Math.max(0, ownerEarned - ownerSettled);
  const partnerPending = Math.max(0, partnerEarned - partnerSettled);

  const totalEarned = depositRows.reduce((s, r) => s + (r.api_earnings_kes ?? 0), 0);

  const handleSettle = async (target: "owner" | "partner") => {
    const pending = target === "owner" ? ownerPending : partnerPending;
    if (pending <= 0) return;
    const amount = Number(withdrawAmounts[target]) || pending;
    setSettling(target);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("withdraw-api-costs", {
        body: { target, amount },
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      toast.success(`KES ${data.you_receive_kes?.toLocaleString()} is on the way to M-Pesa`);
      loadData();
    } catch (e: any) {
      toast.error(e.message ?? "Settlement failed");
    }
    setSettling(null);
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
            <p className="text-sm text-muted-foreground mb-1">Pending</p>
            <p className="text-4xl font-bold text-primary">KES {(ownerPending + partnerPending).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Unsettled API earnings · {totalEarned.toLocaleString()} earned all-time</p>
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

        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          {(["owner", "partner"] as const).map((target) => {
            const pending  = target === "owner" ? ownerPending  : partnerPending;
            const settled  = target === "owner" ? ownerSettled  : partnerSettled;
            const isReady  = pending >= AUTO_SETTLE_THRESHOLD;

            return (
              <div key={target} className="rounded-xl border border-border bg-secondary/20 p-5 space-y-3">
                <div>
                  <p className="text-sm font-semibold">{target === "owner" ? "Brian (60%)" : "Evans (40%)"}</p>
                  <p className="text-2xl font-bold text-primary mt-1">KES {(settled + pending).toLocaleString()}</p>
                  <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                    <span>Settled <strong className="text-primary">KES {settled.toLocaleString()}</strong></span>
                    <span>{isReady ? "Ready" : "Accumulating"} <strong className="text-primary">KES {pending.toLocaleString()}</strong></span>
                  </div>
                  {pending > 0 && !isReady && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      KES {(AUTO_SETTLE_THRESHOLD - pending).toLocaleString()} until auto-settle
                    </p>
                  )}
                </div>

                {pending > 0 && (
                  <>
                    <div className="border-t border-border pt-2">
                      <label className="text-xs text-muted-foreground">Amount to withdraw (KES)</label>
                      <input
                        type="number"
                        min={1}
                        max={pending}
                        value={withdrawAmounts[target]}
                        onChange={e => setWithdrawAmounts(a => ({ ...a, [target]: e.target.value }))}
                        placeholder={pending.toLocaleString()}
                        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div className="text-xs space-y-0.5 text-muted-foreground">
                      {(() => {
                        const amt = Math.min(Number(withdrawAmounts[target]) || pending, pending);
                        const f   = pretiumDisburseFee(amt);
                        const r   = Math.max(0, amt - f);
                        return (
                          <>
                            <div className="flex justify-between"><span>Pretium fee</span><span>− KES {f.toLocaleString()}</span></div>
                            <div className="flex justify-between font-semibold text-primary border-t border-border pt-1 mt-1">
                              <span>Will receive</span><span>KES {r.toLocaleString()}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <button
                      onClick={() => handleSettle(target)}
                      disabled={settling !== null || pending <= 0}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 w-full justify-center"
                    >
                      {settling === target
                        ? <><Loader2 size={13} className="animate-spin" /> Settling…</>
                        : <><Smartphone size={13} /> Settle to M-Pesa</>
                      }
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-4">Transactions</p>
          {apicosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {apicosts.map((r) => {
                const isDeposit = r.type === "deposit";
                const net = r.transaction_amount_kes - r.pretium_fee_kes;
                return (
                  <div key={r.id} className="py-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-primary">
                        {isDeposit ? "Exam payment" : "Admin withdrawal"}
                      </p>
                      {isDeposit && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          KES {r.transaction_amount_kes?.toLocaleString()} in
                          {" "}· Pretium 2% −KES {r.pretium_fee_kes?.toLocaleString()}
                          {" "}· net KES {net.toLocaleString()}
                          {" "}· API cost (8%) KES {r.api_earnings_kes?.toLocaleString()}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(r.created_at), "d MMM yyyy")}
                      </p>
                    </div>
                    {isDeposit && (
                      <div className="text-right shrink-0 space-y-0.5">
                        <p className="text-xs text-muted-foreground">
                          Mine: <span className="font-semibold text-primary">+KES {r.owner_earnings_kes?.toLocaleString()}</span>
                          <span className={`ml-1 ${r.owner_withdrawn ? "text-green-600" : "text-muted-foreground"}`}>
                            {r.owner_withdrawn ? "✓" : "·"}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Partner: <span className="font-semibold text-primary">+KES {r.partner_earnings_kes?.toLocaleString()}</span>
                          <span className={`ml-1 ${r.partner_withdrawn ? "text-green-600" : "text-muted-foreground"}`}>
                            {r.partner_withdrawn ? "✓" : "·"}
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
