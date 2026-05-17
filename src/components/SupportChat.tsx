import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LifeBuoy, X, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

type Msg = {
  id: string;
  user_id: string;
  sender_id: string;
  sender_role: "user" | "admin";
  body: string;
  created_at: string;
};

export default function SupportChat() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("support_messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    setMessages((data as Msg[]) || []);
    const un = (data || []).filter((m: any) => m.sender_role === "admin" && !m.read_by_user).length;
    setUnread(un);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const channel = supabase
      .channel(`support-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const m = payload.new as Msg;
          setMessages((prev) => [...prev, m]);
          if (m.sender_role === "admin" && !open) setUnread((u) => u + 1);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open && user && unread > 0) {
      supabase
        .from("support_messages")
        .update({ read_by_user: true })
        .eq("user_id", user.id)
        .eq("read_by_user", false)
        .then(() => setUnread(0));
    }
  }, [open, user?.id, unread]);

  const send = async () => {
    if (!text.trim() || !user) return;
    const body = text.trim();
    setText("");
    const { error } = await supabase.from("support_messages").insert({
      user_id: user.id,
      sender_id: user.id,
      sender_role: "user",
      body,
    });
    if (error) {
      setText(body);
    }
  };

  // Always show support button for everyone

  /* Side-tab trigger — not a floating circle */
  const Trigger = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <button
      onClick={onClick}
      aria-label={label}
      className="fixed bottom-24 right-0 z-50 flex items-center gap-2 bg-[#1E1D4C] text-[#EEE9DC] pl-3 pr-2 py-2.5 shadow-elegant hover:bg-[#2d2b6b] transition-colors"
      style={{ borderRadius: "4px 0 0 4px", writingMode: "horizontal-tb" }}
    >
      <LifeBuoy className="w-4 h-4 shrink-0" />
      <span className="text-[11px] font-semibold tracking-wide uppercase">Help</span>
      {unread > 0 && (
        <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded px-1 min-w-[18px] text-center leading-tight py-0.5">
          {unread}
        </span>
      )}
    </button>
  );

  if (!user) {
    return <Trigger onClick={() => navigate("/auth")} label="Sign in for support" />;
  }

  return (
    <>
      {!open && <Trigger onClick={() => setOpen(true)} label="Open support" />}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[92vw] max-w-sm h-[70vh] max-h-[560px] bg-background border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden">
          <div className="bg-[#1E1D4C] text-[#EEE9DC] px-4 py-3 flex items-center justify-between">
            <div>
              <div className="font-serif font-bold text-base">TOEFL Academic Support</div>
              <div className="text-xs opacity-80">We typically reply within a few hours</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="hover:opacity-80">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/30">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">
                Send us a message — our team will reply here.
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender_role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    m.sender_role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-card border border-border rounded-bl-sm"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className={`text-[10px] mt-1 ${m.sender_role === "user" ? "opacity-70" : "text-muted-foreground"}`}>
                    {format(new Date(m.created_at), "p")}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="p-2 border-t border-border flex gap-2 bg-background"
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 h-10 text-sm"
            />
            <Button type="submit" size="icon" variant="gold" disabled={!text.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
