import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, MessageCircle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

type Msg = {
  id: string;
  user_id: string;
  sender_id: string;
  sender_role: "user" | "admin";
  body: string;
  read_by_admin: boolean;
  read_by_user: boolean;
  created_at: string;
};

export default function AdminChat({ users }: { users: any[] }) {
  const { user } = useAuth();
  const [allMessages, setAllMessages] = useState<Msg[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const { data } = await supabase
      .from("support_messages")
      .select("*")
      .order("created_at", { ascending: true });
    setAllMessages((data as Msg[]) || []);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-support")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Build conversation list: one entry per user_id with a message
  const conversations = useMemo(() => {
    const map = new Map<string, { last: Msg; unread: number }>();
    for (const m of allMessages) {
      const prev = map.get(m.user_id);
      const unread = prev?.unread ?? 0;
      const inc = m.sender_role === "user" && !m.read_by_admin ? 1 : 0;
      if (!prev || new Date(m.created_at) > new Date(prev.last.created_at)) {
        map.set(m.user_id, { last: m, unread: unread + inc });
      } else {
        map.set(m.user_id, { last: prev.last, unread: unread + inc });
      }
    }
    return Array.from(map.entries())
      .map(([uid, v]) => ({ user_id: uid, ...v }))
      .sort((a, b) => +new Date(b.last.created_at) - +new Date(a.last.created_at));
  }, [allMessages]);

  const thread = useMemo(
    () => allMessages.filter((m) => m.user_id === activeUserId),
    [allMessages, activeUserId]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread.length, activeUserId]);

  // Mark admin-read when opening a thread
  useEffect(() => {
    if (!activeUserId) return;
    supabase
      .from("support_messages")
      .update({ read_by_admin: true })
      .eq("user_id", activeUserId)
      .eq("read_by_admin", false)
      .then(() => load());
  }, [activeUserId]);

  const send = async () => {
    if (!text.trim() || !activeUserId || !user) return;
    const body = text.trim();
    setText("");
    await supabase.from("support_messages").insert({
      user_id: activeUserId,
      sender_id: user.id,
      sender_role: "admin",
      body,
      read_by_admin: true,
    });
  };

  const startNew = (uid: string) => {
    setActiveUserId(uid);
  };

  const candidates = users.filter((u) => !conversations.some((c) => c.user_id === u.id));

  return (
    <div className="grid md:grid-cols-3 gap-4 h-[600px]">
      <Card className="p-0 overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-border bg-muted/40 text-xs uppercase font-semibold text-muted-foreground flex items-center gap-2">
          <MessageCircle className="w-3.5 h-3.5" /> Conversations
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground p-3">No conversations yet.</p>
          )}
          {conversations.map((c) => {
            const u = users.find((x) => x.id === c.user_id);
            return (
              <button
                key={c.user_id}
                onClick={() => setActiveUserId(c.user_id)}
                className={`w-full text-left px-3 py-2 border-b border-border hover:bg-muted transition-colors ${
                  activeUserId === c.user_id ? "bg-muted" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium truncate">{u?.full_name ?? "Unknown user"}</div>
                  {c.unread > 0 && <Badge className="text-[10px]">{c.unread}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">{c.last.body}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(c.last.created_at), { addSuffix: true })}
                </div>
              </button>
            );
          })}
        </div>
        {candidates.length > 0 && (
          <div className="border-t border-border p-2">
            <details>
              <summary className="text-xs text-muted-foreground cursor-pointer">Start new chat…</summary>
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                {candidates.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => startNew(u.id)}
                    className="w-full text-left text-xs px-2 py-1 rounded hover:bg-muted"
                  >
                    {u.full_name} <span className="text-muted-foreground">· {u.email}</span>
                  </button>
                ))}
              </div>
            </details>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden flex flex-col md:col-span-2">
        {!activeUserId ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Select a conversation to begin
          </div>
        ) : (
          <>
            <div className="px-4 py-2 border-b border-border bg-muted/30">
              {(() => {
                const u = users.find((x) => x.id === activeUserId);
                return (
                  <>
                    <div className="font-semibold text-sm">{u?.full_name ?? "Unknown"}</div>
                    <div className="text-xs text-muted-foreground">{u?.email}</div>
                  </>
                );
              })()}
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20">
              {thread.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No messages yet — start the conversation.</p>
              )}
              {thread.map((m) => (
                <div key={m.id} className={`flex ${m.sender_role === "admin" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      m.sender_role === "admin"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-card border border-border rounded-bl-sm"
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div className={`text-[10px] mt-1 ${m.sender_role === "admin" ? "opacity-70" : "text-muted-foreground"}`}>
                      {format(new Date(m.created_at), "PPp")}
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
                placeholder="Type a reply..."
                className="flex-1 h-10 text-sm"
              />
              <Button type="submit" size="icon" variant="gold" disabled={!text.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
