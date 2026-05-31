import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEVELS, LevelCode } from "@/lib/levels";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus, Award } from "lucide-react";

export default function AdminManualBooking({ users, onChange }: { users: any[]; onChange: () => void }) {
  const [userId, setUserId] = useState<string>("");
  const [level, setLevel] = useState<LevelCode>("B1");
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [mode, setMode] = useState<"schedule" | "issue">("schedule");
  const [band, setBand] = useState<string>("Pass");
  const [notes, setNotes] = useState<string>("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const filteredUsers = users.filter((u) => {
    const q = filter.toLowerCase();
    return !q || u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  const submit = async () => {
    if (!userId) { toast.error("Pick a client"); return; }
    setBusy(true);
    try {
      // Create the booking — comp it (paid) so the user can actually take the exam
      const { data: booking, error } = await supabase
        .from("bookings")
        .insert({
          user_id: userId,
          level,
          scheduled_at: new Date(scheduledAt).toISOString(),
          status: "confirmed",
          payment_status: "completed",
          amount_kes: 0,
          notes: notes || "Created by admin (no payment required)",
          paid_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      if (mode === "issue") {
        const { error: approveErr } = await supabase.functions.invoke("approve-attempt", {
          body: { booking_id: booking.id, decision: "approve", band, notes },
        });
        if (approveErr) throw approveErr;
        toast.success(`Booking created and ${band} certificate issued`);
      } else {
        supabase.functions.invoke("send-booking-confirmation", { body: { booking_id: booking.id } }).catch(() => {});
        toast.success("Booking created — client can now take the exam from their dashboard");
      }
      setUserId("");
      setNotes("");
      onChange();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-accent" />
        <h3 className="font-semibold">Create booking for a client (no payment)</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Schedule an exam for any user — or skip the exam entirely and issue them a certificate directly.
      </p>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Search client</Label>
          <Input
            placeholder="Name or email..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9"
          />
        </div>
        <div>
          <Label className="text-xs">Client</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Pick a client" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {filteredUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name} — <span className="text-muted-foreground">{u.email}</span>
                </SelectItem>
              ))}
              {filteredUsers.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">No matches</div>}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Level</Label>
          <Select value={level} onValueChange={(v) => setLevel(v as LevelCode)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l.code} value={l.code}>{l.code} — {l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Scheduled at</Label>
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      <div className="border-t border-border pt-3 space-y-3">
        <Label className="text-xs">What should happen?</Label>
        <div className="grid sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("schedule")}
            className={`text-left border rounded-md p-3 text-sm transition-colors ${
              mode === "schedule" ? "border-accent bg-accent/10" : "border-border hover:bg-muted"
            }`}
          >
            <div className="font-medium">Schedule exam</div>
            <div className="text-xs text-muted-foreground">Client takes the test, then you grade & approve.</div>
          </button>
          <button
            type="button"
            onClick={() => setMode("issue")}
            className={`text-left border rounded-md p-3 text-sm transition-colors ${
              mode === "issue" ? "border-accent bg-accent/10" : "border-border hover:bg-muted"
            }`}
          >
            <div className="font-medium flex items-center gap-1"><Award className="w-3.5 h-3.5" /> Issue certificate now</div>
            <div className="text-xs text-muted-foreground">Skip the exam — issue the cert immediately.</div>
          </button>
        </div>

        {mode === "issue" && (
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Grade band</Label>
              <Select value={band} onValueChange={setBand}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pass">Pass</SelectItem>
                  <SelectItem value="Pass with Merit">Pass with Merit</SelectItem>
                  <SelectItem value="Distinction">Distinction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Examiner note (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Issued based on prior assessment" className="h-9" />
            </div>
          </div>
        )}

        <Button variant="gold" onClick={submit} disabled={busy || !userId}>
          {mode === "issue" ? "Create booking & issue certificate" : "Create booking"}
        </Button>
      </div>
    </Card>
  );
}
