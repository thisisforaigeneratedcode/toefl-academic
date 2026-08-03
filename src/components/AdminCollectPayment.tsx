import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { format } from "date-fns";

export default function AdminCollectPayment() {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ phone: string; amount_kes: number; reference: string } | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("direct_payments")
      .select("id, phone, amount_kes, note, status, receipt_number, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setHistory(data ?? []);
  };

  useEffect(() => {
    loadHistory();
    const interval = setInterval(loadHistory, 20000);
    return () => clearInterval(interval);
  }, []);

  const send = async () => {
    if (!phone.trim()) { toast.error("Enter the client's phone number"); return; }
    const amount_kes = Math.round(Number(amount));
    if (!amount_kes || amount_kes <= 0) { toast.error("Enter a valid amount in KES"); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-collect", {
        body: { phone, amount_kes, note },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      setSent({ phone: data.phone, amount_kes: data.amount_kes, reference: data.reference });
      toast.success("Payment prompt sent to the client's phone");
      loadHistory();
    } catch (e: any) {
      toast.error(e.message ?? "Could not send the payment prompt");
    } finally {
      setSending(false);
    }
  };

  const received = history
    .filter((p) => p.status === "completed")
    .reduce((s, p) => s + (p.amount_kes ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card className="p-6 max-w-lg">
        <h2 className="font-serif text-xl font-bold">Prompt a payment</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Push an M-Pesa prompt straight to any phone number — no client account or booking needed.
        </p>

        <div className="mt-5 space-y-3">
          <div>
            <Label className="text-sm">Client phone number</Label>
            <Input
              placeholder="07XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1"
              disabled={sending}
            />
          </div>
          <div>
            <Label className="text-sm">Amount (KES)</Label>
            <Input
              type="number"
              min={1}
              placeholder="5000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
              disabled={sending}
            />
          </div>
          <div>
            <Label className="text-sm">Reference note (optional)</Label>
            <Input
              placeholder="e.g. Walk-in exam fee"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1"
              disabled={sending}
            />
          </div>
          <Button variant="gold" className="w-full" onClick={send} disabled={sending}>
            <Send className="w-4 h-4 mr-2" />
            {sending ? "Sending prompt…" : "Send payment prompt"}
          </Button>
        </div>

        {sent && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            Prompt sent to <strong>{sent.phone}</strong> for <strong>KES {sent.amount_kes.toLocaleString()}</strong>.
            <div className="mt-1 text-xs">Ref: {sent.reference} — ask the client to enter their M-Pesa PIN.</div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h3 className="font-semibold text-sm">Prompt payment history</h3>
          <p className="text-sm text-muted-foreground">
            Received: <strong className="text-primary">KES {received.toLocaleString()}</strong>
          </p>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No prompt payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Date</th>
                  <th>Phone</th>
                  <th>Amount</th>
                  <th>Note</th>
                  <th>Receipt</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2 text-xs whitespace-nowrap">{format(new Date(p.created_at), "PPp")}</td>
                    <td className="font-mono text-xs">{p.phone}</td>
                    <td>KES {(p.amount_kes ?? 0).toLocaleString()}</td>
                    <td className="text-xs">{p.note || "—"}</td>
                    <td className="font-mono text-xs">{p.receipt_number || "—"}</td>
                    <td>
                      <Badge variant={p.status === "completed" ? "default" : p.status === "failed" ? "destructive" : "outline"}>
                        {p.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
