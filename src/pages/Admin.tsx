import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { LEVELS, LevelCode } from "@/lib/levels";
import { toast } from "sonner";
import { format } from "date-fns";
import { ShieldCheck, Wallet, RefreshCw, Loader2, Smartphone, Info, MessageCircle, UserPlus } from "lucide-react";
import AdminChat from "@/components/AdminChat";
import AdminManualBooking from "@/components/AdminManualBooking";
import { pretiumDisburseFee } from "@/lib/pretium";

function estimateReceived(amount: number): number {
  return Math.max(0, amount - pretiumDisburseFee(amount));
}


export default function Admin() {
  const { user, loading, isAdmin } = useAuth();

  const [users, setUsers] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [certs, setCerts] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [apicosts, setApicosts] = useState<any[]>([]);

  // Wallet tab state
  const [walletData, setWalletData] = useState<any>(null);
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [txTab, setTxTab] = useState<"deposits" | "withdrawals">("deposits");

  // New question form
  const [nq, setNq] = useState({ level: "B1" as LevelCode, section: "grammar", prompt: "", passage: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "A" });

  useEffect(() => {
    if (!isAdmin) return;
    refresh();

    const channel = supabase
      .channel("admin-bookings")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, (payload) => {
        const oldRow = payload.old as any;
        const newRow = payload.new as any;
        if (payload.eventType === "UPDATE" && oldRow?.payment_status !== newRow?.payment_status) {
          if (newRow.payment_status === "completed") {
            toast.success(`Payment completed: KES ${newRow.amount_kes?.toLocaleString() ?? "?"} (${newRow.level})`);
          } else if (newRow.payment_status === "failed") {
            toast.error(`Payment failed (${newRow.level})`);
          }
        }
        refresh();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAdmin]);

  const addBusinessHours = (date: Date, hours: number): Date => {
    const result = new Date(date);
    let remaining = hours;
    while (remaining > 0) {
      result.setHours(result.getHours() + 1);
      const day = result.getDay();
      if (day !== 0 && day !== 6) remaining--;
    }
    return result;
  };

  const computeBalance = (costs: any[]) => {
    const deposits    = costs.filter((r) => r.type === "deposit");
    const withdrawals = costs.filter((r) => r.type === "withdrawal");

    const mpesaDeposits   = deposits.filter((r) => !String(r.payment_id ?? "").startsWith("TA-"));
    const paystackDeposits = deposits.filter((r) => String(r.payment_id ?? "").startsWith("TA-"));

    const deposited_net   = mpesaDeposits.reduce((s: number, r: any) => s + r.transaction_amount_kes - r.pretium_fee_kes - r.api_earnings_kes, 0);
    const withdrawn_total = withdrawals.reduce((s: number, r: any) => s + r.transaction_amount_kes, 0);
    const available_to_withdraw_kes = Math.max(0, deposited_net - withdrawn_total);

    const now = new Date();
    let paystack_available = 0;
    let paystack_held = 0;
    for (const r of paystackDeposits) {
      const net = r.transaction_amount_kes - r.pretium_fee_kes;
      const releaseTime = addBusinessHours(new Date(r.created_at), 48);
      if (releaseTime <= now) paystack_available += net;
      else paystack_held += net;
    }

    setWalletData({ available_to_withdraw_kes, paystack_available, paystack_held });
    setWithdrawAmount(String(available_to_withdraw_kes));
  };

  const refresh = async () => {
    const [u, b, a, c, q, ac] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("bookings").select("*").order("scheduled_at", { ascending: false }),
      supabase.from("exam_attempts").select("*").order("created_at", { ascending: false }),
      supabase.from("certificates").select("*").order("issued_at", { ascending: false }),
      supabase.from("questions").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("apicosts").select("*").order("created_at", { ascending: false }),
    ]);
    setUsers(u.data || []); setBookings(b.data || []); setAttempts(a.data || []); setCerts(c.data || []); setQuestions(q.data || []);
    const costs = ac.data || [];
    setApicosts(costs);
    computeBalance(costs);
  };

  const openConfirm = () => {
    if (!withdrawPhone) { toast.error("Enter your M-Pesa number"); return; }
    const amt = Number(withdrawAmount);
    if (!amt || amt <= 0) { toast.error("Enter an amount to withdraw"); return; }
    if (walletData && amt > walletData.available_to_withdraw_kes) {
      toast.error(`Maximum you can withdraw is KES ${walletData.available_to_withdraw_kes?.toLocaleString()}`);
      return;
    }
    setConfirmOpen(true);
  };

  const withdraw = async () => {
    const amt = Number(withdrawAmount);
    setWithdrawing(true);
    try {
      const { data, error } = await supabase.functions.invoke("pretium-balance", {
        body: { action: "withdraw", amount: amt, phone: withdrawPhone },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      setConfirmOpen(false);
      setSuccessData({ ...data, phone: withdrawPhone });
      setWithdrawPhone("");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Withdrawal failed");
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) return <Layout><div className="container py-20 text-center">Loading...</div></Layout>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Layout><div className="container py-20 text-center"><h1 className="font-serif text-3xl">Access denied</h1><p className="text-muted-foreground">You do not have admin privileges.</p></div></Layout>;

  const addQuestion = async () => {
    if (!nq.prompt || !nq.option_a || !nq.option_b || !nq.option_c || !nq.option_d) { toast.error("Fill all fields"); return; }
    const { error } = await supabase.from("questions").insert(nq);
    if (error) toast.error(error.message); else { toast.success("Question added"); setNq({ ...nq, prompt: "", passage: "", option_a: "", option_b: "", option_c: "", option_d: "" }); refresh(); }
  };

  const deleteQuestion = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    await supabase.from("questions").delete().eq("id", id);
    refresh();
  };

  const revokeCert = async (id: string, current: boolean) => {
    await supabase.from("certificates").update({ revoked: !current }).eq("id", id);
    refresh();
  };

  return (
    <Layout>
      <div className="container mx-auto py-8">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-7 h-7 text-accent" />
          <h1 className="font-serif text-3xl font-bold text-primary">Admin Panel</h1>
        </div>

        <div className="grid sm:grid-cols-4 gap-4 mb-6">
          {[["Users", users.length], ["Bookings", bookings.length], ["Attempts", attempts.length], ["Certificates", certs.length]].map(([l, n]) => (
            <Card key={l as string} className="p-5"><div className="text-xs uppercase text-muted-foreground">{l}</div><div className="font-serif text-3xl font-bold text-primary">{n}</div></Card>
          ))}
        </div>

        <Tabs defaultValue="users">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="manual"><UserPlus className="w-3 h-3 mr-1" />New booking</TabsTrigger>
            <TabsTrigger value="attempts">Attempts & Writing</TabsTrigger>
            <TabsTrigger value="certificates">Certificates</TabsTrigger>
            <TabsTrigger value="questions">Question Bank</TabsTrigger>
            <TabsTrigger value="chat"><MessageCircle className="w-3 h-3 mr-1" />Chat</TabsTrigger>
            <TabsTrigger value="wallet"><Wallet className="w-3 h-3 mr-1" />Wallet</TabsTrigger>
          </TabsList>

          <TabsContent value="users"><Card className="p-4"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Name</th><th>Email</th><th>Country</th><th>Joined</th></tr></thead><tbody>{users.map(u => <tr key={u.id} className="border-t border-border"><td className="py-2">{u.full_name}</td><td>{u.email}</td><td>{u.country ?? "—"}</td><td>{format(new Date(u.created_at), "PP")}</td></tr>)}</tbody></table></div></Card></TabsContent>

          <TabsContent value="manual"><AdminManualBooking users={users} onChange={refresh} /></TabsContent>

          <TabsContent value="chat"><AdminChat users={users} /></TabsContent>

          <TabsContent value="bookings"><Card className="p-4"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Client</th><th>Email</th><th>Country</th><th>Level</th><th>Scheduled</th><th>Phone</th><th>Amount (KES)</th><th>Payment</th><th>M-Pesa Receipt</th><th>Paid At</th><th>Status</th></tr></thead><tbody>{bookings.map(b => { const u = users.find(x => x.id === b.user_id); return (<tr key={b.id} className="border-t border-border"><td className="py-2">{u?.full_name ?? "—"}</td><td className="text-xs">{u?.email ?? "—"}</td><td>{u?.country ?? "—"}</td><td><Badge variant="secondary">{b.level}</Badge></td><td className="text-xs">{format(new Date(b.scheduled_at), "PPp")}</td><td className="font-mono text-xs">{b.phone ?? "—"}</td><td>{b.amount_kes?.toLocaleString() ?? "—"}</td><td><Badge variant={b.payment_status === "completed" ? "default" : b.payment_status === "failed" ? "destructive" : "outline"}>{b.payment_status}</Badge></td><td className="font-mono text-xs">{b.mpesa_receipt ?? "—"}</td><td className="text-xs">{b.paid_at ? format(new Date(b.paid_at), "PPp") : "—"}</td><td>{b.status}</td></tr>); })}{bookings.length === 0 && <tr><td colSpan={11} className="py-4 text-center text-muted-foreground">No bookings yet.</td></tr>}</tbody></table></div></Card></TabsContent>

          <TabsContent value="attempts">
            <Card className="p-4">
              <div className="space-y-4">
                {attempts.map(a => <AttemptReview key={a.id} attempt={a} users={users} onChange={refresh} />)}
                {(() => {
                  const bookingsWithoutAttempts = bookings.filter(b => !attempts.some(a => a.booking_id === b.id));
                  if (bookingsWithoutAttempts.length === 0) return null;
                  return (
                    <div className="pt-4 border-t border-border">
                      <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3">Bookings — no submission yet</h3>
                      <div className="space-y-3">
                        {bookingsWithoutAttempts.map(b => <BookingIssue key={b.id} booking={b} users={users} onChange={refresh} />)}
                      </div>
                    </div>
                  );
                })()}
                {attempts.length === 0 && <p className="text-sm text-muted-foreground">No attempts yet.</p>}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="certificates"><Card className="p-4"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Number</th><th>Holder</th><th>Level</th><th>Band</th><th>Issued</th><th></th></tr></thead><tbody>{certs.map(c => <tr key={c.id} className="border-t border-border"><td className="py-2 font-mono text-xs">{c.certificate_number}</td><td>{c.candidate_name}</td><td>{c.level}</td><td>{c.band}</td><td>{format(new Date(c.issued_at), "PP")}</td><td><Button size="sm" variant={c.revoked ? "outline" : "destructive"} onClick={() => revokeCert(c.id, c.revoked)}>{c.revoked ? "Restore" : "Revoke"}</Button></td></tr>)}</tbody></table></div></Card></TabsContent>

          <TabsContent value="questions">
            <Card className="p-4 mb-4">
              <h3 className="font-semibold mb-3">Add new question</h3>
              <div className="grid md:grid-cols-3 gap-3">
                <Select value={nq.level} onValueChange={(v) => setNq({ ...nq, level: v as LevelCode })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LEVELS.map(l => <SelectItem key={l.code} value={l.code}>{l.code}</SelectItem>)}</SelectContent></Select>
                <Select value={nq.section} onValueChange={(v) => setNq({ ...nq, section: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="grammar">Grammar</SelectItem><SelectItem value="vocabulary">Vocabulary</SelectItem><SelectItem value="reading">Reading</SelectItem><SelectItem value="listening">Listening</SelectItem></SelectContent></Select>
                <Select value={nq.correct_option} onValueChange={(v) => setNq({ ...nq, correct_option: v })}><SelectTrigger><SelectValue placeholder="Correct" /></SelectTrigger><SelectContent>{["A","B","C","D"].map(o => <SelectItem key={o} value={o}>Correct: {o}</SelectItem>)}</SelectContent></Select>
              </div>
              <Textarea className="mt-3" placeholder="Prompt / question" value={nq.prompt} onChange={(e) => setNq({ ...nq, prompt: e.target.value })} />
              <Textarea className="mt-2" placeholder="Passage (optional, for reading)" value={nq.passage} onChange={(e) => setNq({ ...nq, passage: e.target.value })} />
              <div className="grid md:grid-cols-2 gap-2 mt-2">
                <Input placeholder="A" value={nq.option_a} onChange={(e) => setNq({ ...nq, option_a: e.target.value })} />
                <Input placeholder="B" value={nq.option_b} onChange={(e) => setNq({ ...nq, option_b: e.target.value })} />
                <Input placeholder="C" value={nq.option_c} onChange={(e) => setNq({ ...nq, option_c: e.target.value })} />
                <Input placeholder="D" value={nq.option_d} onChange={(e) => setNq({ ...nq, option_d: e.target.value })} />
              </div>
              <Button variant="gold" className="mt-3" onClick={addQuestion}>Add question</Button>
            </Card>
            <Card className="p-4">
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {questions.map(q => (
                  <div key={q.id} className="flex items-start gap-2 border-b border-border pb-2">
                    <Badge variant="secondary">{q.level}</Badge>
                    <Badge variant="outline">{q.section}</Badge>
                    <div className="flex-1 text-sm">{q.prompt} <span className="text-xs text-muted-foreground">(✓{q.correct_option})</span></div>
                    <Button size="sm" variant="ghost" onClick={() => deleteQuestion(q.id)}>×</Button>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="wallet">
            <div className="space-y-4">
              {/* Balance + withdraw */}
              <Card className="p-6 space-y-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground mb-1">Available balance</div>
                    <div className="font-serif text-4xl font-bold text-green-700">
                      KES {(walletData?.available_to_withdraw_kes ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <button onClick={refresh} className="text-muted-foreground hover:text-primary p-1">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                <div className="border-t border-border pt-4 space-y-3">
                  <div className="flex gap-3 flex-wrap items-end">
                    <div>
                      <Label className="text-xs">Amount to withdraw (KES)</Label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="e.g. 5000"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="h-9 w-36 text-sm"
                        disabled={withdrawing}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">M-Pesa number</Label>
                      <Input
                        placeholder="07XXXXXXXX"
                        value={withdrawPhone}
                        onChange={(e) => setWithdrawPhone(e.target.value)}
                        className="h-9 w-44 text-sm"
                        disabled={withdrawing}
                      />
                    </div>
                    <Button
                      variant="gold"
                      onClick={openConfirm}
                      disabled={withdrawing || !withdrawAmount || Number(withdrawAmount) <= 0 || !withdrawPhone}
                    >
                      <Smartphone className="w-4 h-4 mr-2" />
                      Withdraw to M-Pesa
                    </Button>
                  </div>
                  {Number(withdrawAmount) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      You'll receive approximately{" "}
                      <strong className="text-primary">KES {estimateReceived(Number(withdrawAmount)).toLocaleString()}</strong>{" "}
                      on M-Pesa after fees
                    </p>
                  )}
                </div>
              </Card>

              {/* Paystack card balance */}
              <Card className="p-6">
                <div className="text-xs uppercase text-muted-foreground mb-3">Paystack (Card payments)</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Available now</div>
                    <div className="font-serif text-2xl font-bold text-blue-700">
                      KES {(walletData?.paystack_available ?? 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Released by Paystack</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Held by Paystack</div>
                    <div className="font-serif text-2xl font-bold text-muted-foreground">
                      KES {(walletData?.paystack_held ?? 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Releases within 48 business hours</div>
                  </div>
                </div>
              </Card>

              {/* Transaction history */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">Transaction history</h3>
                  <div className="flex gap-1 bg-muted rounded-md p-0.5">
                    {(["deposits", "withdrawals"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTxTab(t)}
                        className={`text-xs px-3 py-1 rounded capitalize transition-colors ${
                          txTab === t ? "bg-background text-primary shadow-sm font-medium" : "text-muted-foreground hover:text-primary"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {txTab === "deposits" ? (() => {
                  const rows = apicosts.filter((r) => r.type === "deposit");
                  return rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payments received yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase text-muted-foreground">
                          <tr><th className="py-2">Date</th><th>Candidate</th><th>Level</th><th>Amount (KES)</th><th>Method</th><th>Status</th><th></th></tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => {
                            const booking = bookings.find((b) => b.id === r.booking_id);
                            const candidate = users.find((u) => u.id === booking?.user_id);
                            const isCard = typeof r.payment_id === "string" && r.payment_id.startsWith("TA-");
                            return (
                              <tr key={r.id} className="border-t border-border">
                                <td className="py-2 text-xs">{format(new Date(r.created_at), "PP")}</td>
                                <td>
                                  <div className="font-medium">{candidate?.full_name ?? "—"}</div>
                                  <div className="text-xs text-muted-foreground">{candidate?.email}</div>
                                </td>
                                <td><Badge variant="secondary">{booking?.level ?? "—"}</Badge></td>
                                <td className="font-medium">KES {r.transaction_amount_kes?.toLocaleString()}</td>
                                <td>
                                  <Badge variant="outline" className={isCard ? "text-blue-700 border-blue-300" : "text-green-700 border-green-300"}>
                                    {isCard ? "Card" : "M-Pesa"}
                                  </Badge>
                                </td>
                                <td><Badge variant="outline" className="text-green-700 border-green-300">received</Badge></td>
                                <td>
                                  <button onClick={() => setSelectedTx(r)} className="p-1 text-muted-foreground hover:text-primary" title="View breakdown">
                                    <Info size={14} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })() : (() => {
                  const rows = apicosts.filter((r) => r.type === "withdrawal");
                  return rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No withdrawals yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase text-muted-foreground">
                          <tr><th className="py-2">Date</th><th>By</th><th>Amount (KES)</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.id} className="border-t border-border">
                              <td className="py-2 text-xs">{format(new Date(r.created_at), "PP")}</td>
                              <td>{(() => {
                                const who = users.find((u) => u.id === r.user_id);
                                return (
                                  <>
                                    <div className="font-medium">{who?.full_name ?? "Admin"}</div>
                                    <div className="text-xs text-muted-foreground">{who?.email}</div>
                                  </>
                                );
                              })()}</td>
                              <td className="font-medium">KES {r.transaction_amount_kes?.toLocaleString()}</td>
                              <td><Badge variant="secondary">initiated</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </Card>
            </div>

            {/* Per-row payment breakdown dialog */}
            <Dialog open={!!selectedTx} onOpenChange={(open) => { if (!open) setSelectedTx(null); }}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="font-serif">Payment Breakdown</DialogTitle>
                </DialogHeader>
                {selectedTx && (() => {
                  const r = selectedTx;
                  const totalFees = r.pretium_fee_kes + r.api_earnings_kes;
                  const adminRevenue = r.transaction_amount_kes - totalFees;
                  return (
                    <div className="space-y-2 text-sm">
                      <p className="text-xs text-muted-foreground mb-2">{format(new Date(r.created_at), "PP")}</p>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Payment received</span>
                        <span className="font-semibold">KES {r.transaction_amount_kes?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fees</span>
                        <span className="text-destructive">− KES {totalFees?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between border-t border-border pt-2 mt-2 font-semibold">
                        <span>Admin wallet received</span>
                        <span className="text-primary">KES {adminRevenue.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })()}
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>

        {/* Withdrawal confirmation dialog */}
        <Dialog open={confirmOpen} onOpenChange={(o) => !withdrawing && setConfirmOpen(o)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-accent" />
                Confirm withdrawal
              </DialogTitle>
              <DialogDescription>
                Please verify the M-Pesa number before sending. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs uppercase text-muted-foreground">Amount</span>
                  <span className="font-serif text-2xl font-bold text-primary">
                    KES {Number(withdrawAmount || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-border pt-3">
                  <span className="text-xs uppercase text-muted-foreground">Send to</span>
                  <span className="font-mono text-lg font-semibold tracking-wide">{withdrawPhone}</span>
                </div>
                <div className="flex justify-between items-center border-t border-border pt-3">
                  <span className="text-xs uppercase text-muted-foreground">You'll receive</span>
                  <span className="font-semibold text-green-700">
                    ~ KES {estimateReceived(Number(withdrawAmount || 0)).toLocaleString()}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Double-check the phone number — funds sent to a wrong number cannot be recovered.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={withdrawing}>
                Cancel
              </Button>
              <Button variant="gold" onClick={withdraw} disabled={withdrawing}>
                {withdrawing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Confirm & send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Success dialog */}
        <Dialog open={!!successData} onOpenChange={(o) => !o && setSuccessData(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="mx-auto w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-2">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <DialogTitle className="text-center">Withdrawal sent!</DialogTitle>
              <DialogDescription className="text-center">
                The funds are on their way to M-Pesa.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3 my-2">
              <div className="flex justify-between">
                <span className="text-xs uppercase text-muted-foreground">Sent to</span>
                <span className="font-mono font-semibold">{successData?.phone}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-3">
                <span className="text-xs uppercase text-muted-foreground">Amount received</span>
                <span className="font-serif text-xl font-bold text-green-700">
                  KES {successData?.you_receive_kes?.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground border-t border-border pt-3">
                <span>Pretium fee</span>
                <span>KES {successData?.pretium_fee_kes?.toLocaleString()}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="gold" className="w-full" onClick={() => setSuccessData(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

function AttemptReview({ attempt, users, onChange }: { attempt: any; users: any[]; onChange: () => void }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [band, setBand] = useState<string>(attempt.admin_band ?? "Pass");
  const [notes, setNotes] = useState<string>(attempt.admin_notes ?? "");
  const [busy, setBusy] = useState(false);
  const candidate = users.find((u) => u.id === attempt.user_id);

  useEffect(() => {
    if (!attempt.reading_audio_url) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage.from("exam-recordings").createSignedUrl(attempt.reading_audio_url, 3600);
      if (!cancelled && data?.signedUrl) setAudioUrl(data.signedUrl);
    })();
    return () => { cancelled = true; };
  }, [attempt.reading_audio_url]);

  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("approve-attempt", {
        body: { attempt_id: attempt.id, decision, band, notes },
      });
      if (error) throw error;
      toast.success(decision === "approve" ? `Approved · ${band}` : "Rejected");
      onChange();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  const alreadyApproved = attempt.approval_status === "approved";

  return (
    <div className="border border-border rounded-md p-4">
      <div className="flex flex-wrap items-center gap-2 justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{attempt.level}</Badge>
          <span className="text-sm font-semibold">{candidate?.full_name ?? "Unknown"}</span>
          <span className="text-xs text-muted-foreground">{candidate?.email}</span>
        </div>
        <Badge variant={alreadyApproved ? "secondary" : attempt.approval_status === "rejected" ? "destructive" : "default"}>
          {attempt.approval_status ?? attempt.status}
        </Badge>
      </div>

      {attempt.listening_prompt_text && (
        <div className="mb-3">
          <div className="text-xs uppercase text-muted-foreground mb-1">Listening prompt (expected)</div>
          <div className="bg-secondary/30 p-2 rounded text-sm italic">"{attempt.listening_prompt_text}"</div>
          <div className="text-xs uppercase text-muted-foreground mt-2 mb-1">Candidate typed</div>
          <div className="bg-card border border-border p-2 rounded text-sm whitespace-pre-wrap">{attempt.listening_response || <em className="text-muted-foreground">No response</em>}</div>
        </div>
      )}

      {attempt.reading_passage && (
        <div className="mb-3">
          <div className="text-xs uppercase text-muted-foreground mb-1">Reading passage</div>
          <div className="bg-secondary/30 p-2 rounded text-sm">{attempt.reading_passage}</div>
          <div className="text-xs uppercase text-muted-foreground mt-2 mb-1">Candidate's recording</div>
          {audioUrl ? <audio controls src={audioUrl} className="w-full" /> : <div className="text-xs text-muted-foreground">{attempt.reading_audio_url ? "Loading audio..." : "No recording"}</div>}
        </div>
      )}

      {!alreadyApproved && (
        <div className="border-t border-border pt-3 mt-3 grid md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Grade band</Label>
            <Select value={band} onValueChange={setBand}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Pass">Pass</SelectItem>
                <SelectItem value="Pass with Merit">Pass with Merit</SelectItem>
                <SelectItem value="Distinction">Distinction</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Examiner note (optional, shown to candidate)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Excellent pronunciation and accuracy." />
          </div>
          <div className="md:col-span-3 flex gap-2">
            <Button variant="gold" onClick={() => decide("approve")} disabled={busy}>
              {attempt.approval_status === "rejected" ? "Override → Approve" : "Approve & issue certificate"}
            </Button>
            {attempt.approval_status !== "rejected" && (
              <Button variant="destructive" onClick={() => decide("reject")} disabled={busy}>Reject</Button>
            )}
          </div>
        </div>
      )}
      {alreadyApproved && attempt.admin_notes && (
        <div className="text-xs text-muted-foreground mt-2">Note: {attempt.admin_notes}</div>
      )}
    </div>
  );
}

function BookingIssue({ booking, users, onChange }: { booking: any; users: any[]; onChange: () => void }) {
  const candidate = users.find((u) => u.id === booking.user_id);
  const [band, setBand] = useState<string>("Pass");
  const [notes, setNotes] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const issue = async () => {
    if (!confirm(`Issue a ${band} certificate to ${candidate?.full_name ?? "this candidate"} without a submission?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("approve-attempt", {
        body: { booking_id: booking.id, decision: "approve", band, notes },
      });
      if (error) throw error;
      toast.success(`Certificate issued · ${band}`);
      onChange();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="border border-dashed border-border rounded-md p-4 bg-muted/20">
      <div className="flex flex-wrap items-center gap-2 justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{booking.level}</Badge>
          <span className="text-sm font-semibold">{candidate?.full_name ?? "Unknown"}</span>
          <span className="text-xs text-muted-foreground">{candidate?.email}</span>
        </div>
        <Badge variant="outline">No submission</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Booked for {format(new Date(booking.scheduled_at), "PPp")} · Paid KES {booking.amount_kes?.toLocaleString() ?? "—"}
      </p>
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Grade band</Label>
          <Select value={band} onValueChange={setBand}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Pass">Pass</SelectItem>
              <SelectItem value="Pass with Merit">Pass with Merit</SelectItem>
              <SelectItem value="Distinction">Distinction</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Examiner note (optional)</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Demonstrated proficiency in prior assessment." />
        </div>
        <div className="md:col-span-3">
          <Button variant="gold" onClick={issue} disabled={busy}>Issue certificate without submission</Button>
        </div>
      </div>
    </div>
  );
}
