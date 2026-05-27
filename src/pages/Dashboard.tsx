import { useEffect, useState, useRef } from "react";
import { Navigate, Link, useSearchParams, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { LEVELS, LevelCode, KES_RATE } from "@/lib/levels";
import { FEATURES } from "@/lib/features";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";
import { format } from "date-fns";
import { Calendar, BookOpen, Award, PlayCircle, Smartphone, Loader2, XCircle, Clock, CreditCard } from "lucide-react";

type PayPhase = "input" | "sending" | "awaiting" | "failed";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { format: fmtPrice, currency } = useCurrency();
  const [bookings, setBookings] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [certs, setCerts] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [level, setLevel] = useState<LevelCode>((params.get("book") as LevelCode) || "B1");
  const [scheduledAt, setScheduledAt] = useState(new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Payment modal state
  const [payingBooking, setPayingBooking] = useState<any>(null);
  const [payPhone, setPayPhone] = useState("");
  const [payPhase, setPayPhase] = useState<PayPhase>("input");
  const [payError, setPayError] = useState("");
  const [payMethod, setPayMethod] = useState<"mpesa" | "card">(FEATURES.pretium ? "mpesa" : "card");
  const [cardBusy, setCardBusy] = useState(false);
  const [awaitSeconds, setAwaitSeconds] = useState(0);
  const awaitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = async (uid: string) => {
    const [{ data: b }, { data: a }, { data: c }, { data: p }] = await Promise.all([
      supabase.from("bookings").select("*").eq("user_id", uid).order("scheduled_at", { ascending: false }),
      supabase.from("exam_attempts").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.from("certificates").select("*").eq("user_id", uid).order("issued_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
    ]);
    setBookings(b || []);
    setAttempts(a || []);
    setCerts(c || []);
    setProfile(p);
    const localCountry = localStorage.getItem("toefl_country");
    if (p?.country) {
      const { setStoredCountry } = await import("@/lib/currency");
      if (localCountry !== p.country) setStoredCountry(p.country);
    } else if (localCountry) {
      await supabase.from("profiles").update({ country: localCountry }).eq("id", uid);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchData(user.id);

    // Handle return from Paystack redirect
    // Paystack appends ?trxref=xxx&reference=xxx to callback_url
    const paystackReturn = params.get("paystack");
    const returnBookingId = params.get("booking_id");
    const paystackRef = params.get("reference") || params.get("trxref");
    if (paystackReturn === "success" && returnBookingId) {
      navigate("/dashboard", { replace: true });
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const verifyRef = async (ref: string) => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch(
            `https://${projectId}.supabase.co/functions/v1/paystack?action=verify`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token ?? ""}` },
              body: JSON.stringify({ reference: ref }),
            }
          );
          const result = await res.json();
          if (result.status === "success") {
            toast.success("Payment confirmed — your exam is ready!");
            fetchData(user.id);
          } else {
            toast.info("Payment is being processed. Your exam will unlock shortly.");
          }
        } catch {
          toast.info("Payment received. Your exam will unlock shortly.");
        }
      };
      if (paystackRef) {
        verifyRef(paystackRef);
      } else {
        // fallback: read stored reference from booking
        supabase.from("bookings").select("mpesa_receipt, payment_status").eq("id", returnBookingId).maybeSingle()
          .then(({ data }) => {
            if (data?.payment_status === "completed") {
              toast.success("Payment confirmed — your exam is ready!");
            } else if (data?.mpesa_receipt) {
              verifyRef(data.mpesa_receipt);
            } else {
              toast.info("Payment is being processed. Your exam will unlock shortly.");
            }
          });
      }
    }

    realtimeRef.current = supabase
      .channel(`bookings-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const oldRow = payload.old as any;
          const newRow = payload.new as any;
          if (oldRow?.payment_status !== newRow?.payment_status) {
            if (newRow.payment_status === "completed") {
              toast.success("Payment received — your exam is ready to start.");
            } else if (newRow.payment_status === "failed") {
              toast.error("Payment failed. Please try again.");
            } else if (newRow.payment_status === "pending") {
              toast.info("M-Pesa prompt sent — approve it on your phone.");
            }
          }
          fetchData(user.id);
        }
      )
      .subscribe();

    return () => { realtimeRef.current?.unsubscribe(); };
  }, [user]);

  useEffect(() => {
    if (payPhase === "awaiting") {
      setAwaitSeconds(0);
      awaitTimerRef.current = setInterval(() => setAwaitSeconds((s) => s + 1), 1000);
    } else {
      if (awaitTimerRef.current) { clearInterval(awaitTimerRef.current); awaitTimerRef.current = null; }
    }
    return () => { if (awaitTimerRef.current) clearInterval(awaitTimerRef.current); };
  }, [payPhase]);

  useEffect(() => {
    if (!payingBooking) return;
    const updated = bookings.find((b) => b.id === payingBooking.id);
    if (updated?.payment_status === "completed") {
      setPayingBooking(null);
    } else if (updated?.payment_status === "failed" && payPhase === "awaiting") {
      setPayPhase("failed");
      setPayError("The M-Pesa prompt timed out — you didn't enter your PIN in time, or the request was cancelled. Tap 'Try again' to send a new prompt, or switch to card payment.");
    }
  }, [bookings, payingBooking, payPhase]);

  const openPayModal = (booking: any) => {
    setPayingBooking(booking);
    setPayPhone(booking.phone ?? profile?.phone ?? "");
    setPayPhase(booking.payment_status === "pending" ? "awaiting" : "input");
    setPayError("");
    setPayMethod(FEATURES.pretium ? "mpesa" : "card");
    setAwaitSeconds(0);
  };

  const payWithCard = async () => {
    if (!payingBooking || !user) return;
    setCardBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/paystack?action=initialize`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ booking_id: payingBooking.id, email: user.email }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Payment initialization failed");
      window.location.href = data.authorization_url;
    } catch (e: any) {
      toast.error(e.message ?? "Card payment failed. Please try again.");
      setCardBusy(false);
    }
  };

  const submitPayment = async () => {
    if (!payPhone) { setPayError("Enter your M-Pesa phone number"); return; }
    setPayError("");
    setPayPhase("sending");
    try {
      const { data, error } = await supabase.functions.invoke("initiate-payment", {
        body: { booking_id: payingBooking.id, phone: payPhone },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      setPayPhase("awaiting");
    } catch (e: any) {
      setPayError(e.message ?? "Payment initiation failed. Please try again.");
      setPayPhase("failed");
    }
  };

  if (loading) return <Layout><div className="container mx-auto py-20 text-center">Loading...</div></Layout>;
  if (!user) return <Navigate to="/auth" replace />;

  const book = async () => {
    setBusy(true);
    try {
      const lvl = LEVELS.find(l => l.code === level);
      const { data, error } = await supabase.from("bookings").insert({
        user_id: user.id,
        level,
        scheduled_at: new Date(scheduledAt).toISOString(),
        status: "pending",
        amount_kes: Math.round((lvl?.price ?? 0) * KES_RATE),
      }).select().single();
      if (error) throw error;
      setBookings([data, ...bookings]);
      toast.success(`Booked: ${level} on ${format(new Date(data.scheduled_at), "PPp")} — pay via M-Pesa to confirm.`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const startExam = async (booking: any) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("start-exam", {
        body: { booking_id: booking.id, level: booking.level },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      navigate(`/exam/${data.attempt_id}`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const needsPayment = (b: any) =>
    ["unpaid", "pending", "failed"].includes(b.payment_status ?? "unpaid");

  return (
    <Layout>
      <div className="container mx-auto py-10 space-y-8">
        <div>
          <h1 className="font-serif text-4xl font-bold text-primary">Welcome back, {profile?.full_name?.split(" ")[0] ?? "Candidate"}</h1>
          <p className="text-muted-foreground">Manage your bookings, exams, and certificates.</p>
        </div>

        {/* Stats */}
        <div className="grid sm:grid-cols-3 gap-4">
          {[[Calendar, "Upcoming bookings", bookings.filter((b) => b.status === "confirmed").length],
            [BookOpen, "Exams taken", attempts.filter((a) => a.status === "submitted" || a.status === "graded").length],
            [Award, "Certificates", certs.length]].map(([Icon, l, n]: any, i) => (
            <Card key={i} className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-md bg-gold/15 text-gold flex items-center justify-center"><Icon className="w-6 h-6" /></div>
              <div>
                <div className="font-serif text-3xl font-bold text-primary">{n}</div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{l}</div>
              </div>
            </Card>
          ))}
        </div>

        {/* Book a test */}
        <Card className="p-6">
          <h2 className="font-serif text-2xl font-bold text-primary mb-1">Book a new test</h2>
          <p className="text-sm text-muted-foreground mb-4">Pick your level and a time. Pay via M-Pesa after booking to confirm. Prices shown in <strong>{currency}</strong>.</p>
          <div className="grid md:grid-cols-3 gap-4 items-end">
            <div>
              <Label>Level</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as LevelCode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => <SelectItem key={l.code} value={l.code}>{l.code} — {l.name} · {fmtPrice(l.price)}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Selected: <strong className="text-accent">{fmtPrice(LEVELS.find(l => l.code === level)?.price ?? 0)}</strong></p>
            </div>
            <div>
              <Label>Scheduled time</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
            <Button variant="gold" onClick={book} disabled={busy}>Confirm booking</Button>
          </div>
        </Card>

        {/* Bookings */}
        <Card className="p-6">
          <h2 className="font-serif text-2xl font-bold text-primary mb-4">Your bookings</h2>
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {bookings.map((b) => {
                const bookingAttempts = attempts.filter((a) => a.booking_id === b.id);
                const taken = bookingAttempts[0]; // newest first from query
                const cert = taken ? certs.find((c) => c.attempt_id === taken.id) : null;
                const unpaid = needsPayment(b) && bookingAttempts.length === 0;
                const attemptCount = bookingAttempts.length;
                const canRetry = taken?.approval_status === "rejected" && !cert && attemptCount < 3;

                return (
                  <div key={b.id} className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-serif font-bold">{b.level}</Badge>
                          <span className="font-medium">{format(new Date(b.scheduled_at), "PPpp")}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Status: {b.status}
                          {b.payment_status && b.payment_status !== "completed" && (
                            <span className="ml-2 text-amber-600 font-medium">· Payment: {b.payment_status}</span>
                          )}
                          {b.payment_status === "completed" && attemptCount > 0 && (
                            <span className="ml-2">· Attempts used: <strong>{attemptCount}/3</strong></span>
                          )}
                        </div>
                      </div>

                      {cert ? (
                        <Button asChild variant="gold" size="sm">
                          <Link to={`/certificate/${cert.certificate_number}`}><Award className="w-4 h-4 mr-1" /> Download certificate</Link>
                        </Button>
                      ) : canRetry ? (
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="destructive">Did not pass</Badge>
                          <Button variant="gold" size="sm" onClick={() => startExam(b)} disabled={busy}>
                            <PlayCircle className="w-4 h-4 mr-1" /> Retry exam ({attemptCount}/3)
                          </Button>
                        </div>
                      ) : taken ? (
                        taken.approval_status === "rejected" ? (
                          <Badge variant="destructive">Did not pass · no attempts left</Badge>
                        ) : taken.status === "submitted" ? (
                          <Badge>Awaiting examiner review</Badge>
                        ) : (
                          <Button asChild variant="gold" size="sm">
                            <Link to={`/exam/${taken.id}`}><PlayCircle className="w-4 h-4 mr-1" /> Resume exam</Link>
                          </Button>
                        )
                      ) : unpaid ? (
                        FEATURES.pretium && b.payment_status === "pending" ? (
                          <Button size="sm" variant="outline" onClick={() => openPayModal(b)}>
                            <Clock className="w-3 h-3 mr-1 animate-pulse text-amber-500" /> Awaiting M-Pesa…
                          </Button>
                        ) : (
                          <Button size="sm" variant="gold" onClick={() => openPayModal(b)}>
                            {FEATURES.pretium
                              ? <><Smartphone className="w-3 h-3 mr-1" />{b.payment_status === "failed" ? "Retry payment" : "Pay via M-Pesa"}</>
                              : <><CreditCard className="w-3 h-3 mr-1" />Pay with card</>
                            }
                          </Button>
                        )
                      ) : (
                        <Button variant="gold" size="sm" onClick={() => startExam(b)} disabled={busy}>
                          <PlayCircle className="w-4 h-4 mr-1" /> Start exam
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Certificates */}
        {certs.length > 0 && (
          <Card className="p-6">
            <h2 className="font-serif text-2xl font-bold text-primary mb-4">Your certificates</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {certs.map((c) => (
                <Link key={c.id} to={`/certificate/${c.certificate_number}`} className="block border border-border rounded-lg p-5 hover:shadow-elegant transition-smooth bg-gradient-subtle">
                  <div className="flex items-start justify-between mb-2">
                    <Badge className="bg-gold text-gold-foreground hover:bg-gold">{c.level} — {c.band}</Badge>
                    <span className="text-xs text-muted-foreground">{format(new Date(c.issued_at), "PP")}</span>
                  </div>
                  <div className="font-mono text-sm text-primary">{c.certificate_number}</div>
                  <div className="text-xs text-muted-foreground mt-1">Issued {format(new Date(c.issued_at), "PP")} · Valid until {format(new Date(c.valid_until), "PP")}</div>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Payment modal */}
      <Dialog open={!!payingBooking} onOpenChange={(open) => { if (!open && payPhase !== "sending") setPayingBooking(null); }}>
        <DialogContent className="max-w-sm">
          {payPhase === "sending" && (
            <div className="flex flex-col items-center gap-4 py-10">
              <Loader2 className="w-12 h-12 animate-spin text-gold" />
              <div className="text-center">
                <p className="font-semibold text-primary text-lg">Sending payment request…</p>
                <p className="text-sm text-muted-foreground mt-1">Just a moment</p>
              </div>
            </div>
          )}

          {FEATURES.pretium && payPhase === "awaiting" && (
            <div className="flex flex-col items-center gap-5 py-8">
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                <Smartphone className="w-8 h-8 text-green-600" />
              </div>
              <div className="text-center space-y-2">
                <p className="font-semibold text-primary text-lg">Check your phone</p>
                <p className="text-sm text-muted-foreground">
                  A pop-up appeared on <strong>{payPhone}</strong>.<br />
                  Enter your M-Pesa PIN to complete the payment.
                </p>
                <p className="text-xs text-muted-foreground pt-1 flex items-center justify-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Your exam will unlock automatically once payment goes through.
                </p>
              </div>
              {awaitSeconds >= 30 && (
                <div className="w-full rounded-lg bg-amber-50 border border-amber-200 p-3 text-center space-y-2">
                  <p className="text-sm text-amber-800 font-medium">Didn't get the prompt?</p>
                  <p className="text-xs text-amber-700">
                    The M-Pesa prompt expires after 60 seconds. If it disappeared or never arrived, you can send a new one.
                  </p>
                  <div className="flex gap-2 justify-center pt-1">
                    <Button size="sm" variant="outline" onClick={() => { setPayPhase("input"); setAwaitSeconds(0); }}>
                      Send again
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setPayMethod("card"); setPayPhase("input"); setAwaitSeconds(0); }}>
                      Pay with card instead
                    </Button>
                  </div>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => setPayingBooking(null)}>Close</Button>
            </div>
          )}

          {(payPhase === "input" || payPhase === "failed") && payingBooking && (() => {
            const lvl = LEVELS.find((l) => l.code === payingBooking.level);
            const amount_kes = payingBooking.amount_kes ?? Math.round((lvl?.price ?? 0) * KES_RATE);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-serif text-xl">Complete payment</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-1">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{lvl?.name} ({payingBooking.level})</span>
                      <span className="font-bold text-primary">KES {amount_kes.toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{format(new Date(payingBooking.scheduled_at), "PPp")}</div>
                  </div>

                  {/* Payment method selector — only shown when Pretium is enabled */}
                  {FEATURES.pretium && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPayMethod("mpesa")}
                        className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-colors ${payMethod === "mpesa" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                      >
                        <Smartphone className="w-4 h-4" /> M-Pesa
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayMethod("card")}
                        className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-colors ${payMethod === "card" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                      >
                        <CreditCard className="w-4 h-4" /> Card
                      </button>
                    </div>
                  )}

                  {payPhase === "failed" && (
                    <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 p-3">
                      <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <p className="text-sm text-red-700">{payError}</p>
                    </div>
                  )}

                  {FEATURES.pretium && payMethod === "mpesa" ? (
                    <>
                      <div>
                        <Label className="text-sm">Your M-Pesa number</Label>
                        <Input
                          placeholder="07XXXXXXXX"
                          value={payPhone}
                          onChange={(e) => setPayPhone(e.target.value)}
                          className="mt-1"
                          autoFocus
                        />
                      </div>
                      <Button variant="gold" className="w-full" onClick={submitPayment}>
                        <Smartphone className="w-4 h-4 mr-2" />
                        {payPhase === "failed" ? "Try again" : `Pay KES ${amount_kes.toLocaleString()} via M-Pesa`}
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">You'll be redirected to Paystack to complete your card payment securely.</p>
                      <Button variant="gold" className="w-full" onClick={payWithCard} disabled={cardBusy}>
                        {cardBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                        {cardBusy ? "Redirecting…" : `Pay KES ${amount_kes.toLocaleString()} with Card`}
                      </Button>
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
