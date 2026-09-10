import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Loader2, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { pretiumDisburseFee } from "@/lib/pretium";
import { FEATURES } from "@/lib/features";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const AUTO_SETTLE_THRESHOLD = 5000;

type DeleteTarget =
  | { kind: "booking"; id: string; label: string }
  | { kind: "prompt"; id: string; label: string }
  | null;

export default function ApiEarnings() {
  const { user, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [apicosts, setApicosts] = useState<any[]>([]);
  const [settling, setSettling] = useState(false);
  const [autoSettle, setAutoSettle] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");

  // All bookings + Collect-payment prompts — full visibility, delete
  // restricted (server-side, not just here) to failed/cancelled clutter.
  const [records, setRecords] = useState<{ bookings: any[]; direct_payments: any[] }>({ bookings: [], direct_payments: [] });
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const callOwnerTransactions = async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke("owner-transactions", {
      body,
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
    if (error || data?.error) throw new Error(data?.error ?? error?.message);
    return data;
  };

  const loadRecords = async () => {
    setRecordsLoading(true);
    try {
      const data = await callOwnerTransactions({ action: "list" });
      setRecords({ bookings: data.bookings ?? [], direct_payments: data.direct_payments ?? [] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load bookings");
    }
    setRecordsLoading(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { kind, id } = deleteTarget;
    setDeletingId(id);
    try {
      if (kind === "booking") {
        await callOwnerTransactions({ action: "delete_booking", booking_id: id });
        setRecords((r) => ({ ...r, bookings: r.bookings.filter((b) => b.id !== id) }));
        toast.success("Booking deleted");
      } else {
        await callOwnerTransactions({ action: "delete_direct_payment", id });
        setRecords((r) => ({ ...r, direct_payments: r.direct_payments.filter((d) => d.id !== id) }));
        toast.success("Prompt deleted");
      }
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed");
    }
    setDeletingId(null);
  };

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
      loadRecords();
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

  // Owner's cut per row (owner_earnings_kes, falling back to the legacy api_earnings_kes)
  const ownerCut = (r: any) => r.owner_earnings_kes ?? r.api_earnings_kes ?? 0;

  const mpesaEarned   = mpesaDeposits.reduce((s, r) => s + ownerCut(r), 0);
  const cardEarned    = cardDeposits.reduce((s, r) => s + ownerCut(r), 0);

  // Already-settled owner cut: withdrawn deposit rows + any settlement rows
  const mpesaSettled  = mpesaDeposits.filter(r => r.owner_withdrawn).reduce((s, r) => s + ownerCut(r), 0)
    + settlementRows.reduce((s, r) => s + (r.owner_earnings_kes ?? 0), 0);
  const cardSettled   = cardDeposits.filter(r => r.owner_withdrawn).reduce((s, r) => s + ownerCut(r), 0);
  const totalSettled  = depositRows.filter(r => r.owner_withdrawn).reduce((s, r) => s + ownerCut(r), 0)
    + settlementRows.reduce((s, r) => s + (r.owner_earnings_kes ?? 0), 0);

  // Real unsettled owner earnings (both were previously over-counted:
  // mpesa was hardcoded to 0, card summed withdrawn rows too)
  const mpesaPending  = Math.max(0, mpesaEarned - mpesaSettled);
  const cardPending   = Math.max(0, cardEarned - cardSettled);
  const pending       = mpesaPending;
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

  const ledgerRows = apicosts;
  const bookingsCount = records.bookings.length;
  const promptsCount = records.direct_payments.length;

  return (
    <Layout>
      <div className="container mx-auto py-12 max-w-3xl">
        <h1 className="font-serif text-3xl font-bold text-primary mb-6">Costs</h1>

        <Tabs defaultValue="earnings">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
            <TabsTrigger value="ledger">Ledger{ledgerRows.length ? ` (${ledgerRows.length})` : ""}</TabsTrigger>
            <TabsTrigger value="bookings">Bookings{bookingsCount ? ` (${bookingsCount})` : ""}</TabsTrigger>
            <TabsTrigger value="prompts">Prompts{promptsCount ? ` (${promptsCount})` : ""}</TabsTrigger>
          </TabsList>

          {/* ── Earnings ── */}
          <TabsContent value="earnings" className="mt-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total pending earnings</p>
                <p className="text-4xl font-bold text-primary">KES {pending.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  KES {mpesaEarned.toLocaleString()} M-Pesa earned · KES {totalSettled.toLocaleString()} settled
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

            {/* Card earnings — only while Paystack is actually in use. When
                it's disabled, historical card rows still live in the Ledger
                tab for the record, but this actionable "deduct from your
                next transfer" prompt is just noise. */}
            {FEATURES.paystack && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm font-semibold text-blue-800">Card payments (Paystack)</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">KES {cardPending.toLocaleString()}</p>
                <p className="text-xs text-blue-600 mt-1">
                  {cardPending > 0
                    ? "Deduct this from your next Paystack bank transfer — this is your 8% cut from card payments."
                    : "Your 8% cut from card payments will appear here."}
                </p>
              </div>
            )}

            {/* M-Pesa earnings — settleable via Pretium */}
            <div className="rounded-xl border border-border bg-secondary/20 p-5 space-y-3">
              <div>
                <p className="text-sm font-semibold">M-Pesa earnings (Pretium)</p>
                <p className="text-2xl font-bold text-primary mt-1">KES {mpesaPending.toLocaleString()}</p>
              </div>
              {mpesaPending > 0 ? (
                <>
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
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Nothing to settle yet.</p>
              )}
            </div>
          </TabsContent>

          {/* ── Ledger ── */}
          <TabsContent value="ledger" className="mt-6">
            {ledgerRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {ledgerRows.map((r) => {
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
          </TabsContent>

          {/* ── Bookings ── */}
          <TabsContent value="bookings" className="mt-6">
            <p className="text-xs text-muted-foreground mb-4">
              Every booking. Delete is only offered for failed or cancelled ones — the server re-checks that, so a paid booking can never be removed here.
            </p>
            {recordsLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : records.bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {records.bookings.map((b) => {
                  const deletable = b.payment_status === "failed" || b.status === "cancelled";
                  return (
                    <div key={b.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-primary flex items-center gap-2 flex-wrap">
                          {b.level}
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                            b.payment_status === "completed" ? "text-green-700 border-green-300"
                              : b.payment_status === "failed" ? "text-red-700 border-red-300"
                              : "text-muted-foreground border-border"
                          }`}>
                            {b.payment_status}
                          </span>
                          {b.status === "cancelled" && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border text-red-700 border-red-300">cancelled</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          KES {(b.amount_kes ?? 0).toLocaleString()} · {format(new Date(b.created_at), "d MMM yyyy")}
                        </p>
                      </div>
                      {deletable && (
                        <button
                          onClick={() => setDeleteTarget({ kind: "booking", id: b.id, label: `the ${b.level} booking (${b.payment_status}) from ${format(new Date(b.created_at), "d MMM yyyy")}` })}
                          disabled={deletingId === b.id}
                          className="shrink-0 flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50 px-2 py-1 rounded hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Prompts ── */}
          <TabsContent value="prompts" className="mt-6">
            <p className="text-xs text-muted-foreground mb-4">
              Collect-payment prompts. Only failed prompts can be deleted.
            </p>
            {recordsLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : records.direct_payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No prompt payments yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {records.direct_payments.map((p) => (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-primary flex items-center gap-2 flex-wrap">
                        {p.phone}
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          p.status === "completed" ? "text-green-700 border-green-300"
                            : p.status === "failed" ? "text-red-700 border-red-300"
                            : "text-muted-foreground border-border"
                        }`}>
                          {p.status}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        KES {(p.amount_kes ?? 0).toLocaleString()} · {p.note || "—"} · {format(new Date(p.created_at), "d MMM yyyy")}
                      </p>
                    </div>
                    {p.status === "failed" && (
                      <button
                        onClick={() => setDeleteTarget({ kind: "prompt", id: p.id, label: `the failed prompt to ${p.phone} for KES ${(p.amount_kes ?? 0).toLocaleString()}` })}
                        disabled={deletingId === p.id}
                        className="shrink-0 flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50 px-2 py-1 rounded hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {deleteTarget?.label}. It won't touch the earnings ledger or any wallet balance. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deletingId !== null}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deletingId !== null ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
