import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ShieldCheck, ShieldX, Search, Headphones, BookOpen, Mic, PenLine, BadgeCheck } from "lucide-react";
import { LEVELS } from "@/lib/levels";

function Ring({ value, label }: { value: number; label: string }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  return (
    <div className="flex flex-col items-center">
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={r} stroke="hsl(var(--muted))" strokeWidth="6" fill="none" opacity="0.4" />
        <circle cx="38" cy="38" r={r} stroke="hsl(var(--gold))" strokeWidth="6" fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 38 38)" />
        <text x="38" y="43" textAnchor="middle" className="fill-primary font-serif font-bold" fontSize="16">{value}%</text>
      </svg>
      <div className="text-[11px] font-semibold text-primary mt-1 uppercase tracking-wider">{label}</div>
    </div>
  );
}

export default function Verify() {
  const { number } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(number ?? "");
  const [cert, setCert] = useState<any>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (number) lookup(number);
  }, [number]);

  async function lookup(q: string) {
    setLoading(true); setSearched(true); setCert(null);
    const { data } = await supabase.from("certificates").select("*").eq("certificate_number", q.trim().toUpperCase()).maybeSingle();
    setCert(data);
    setLoading(false);
  }

  const isValid = cert && !cert.revoked && new Date(cert.valid_until) >= new Date();
  const isExpired = cert && !cert.revoked && new Date(cert.valid_until) < new Date();

  return (
    <Layout>
      <div className="container mx-auto py-12 max-w-3xl">
        <div className="text-center mb-8">
          <ShieldCheck className="w-12 h-12 text-accent mx-auto mb-3" />
          <h1 className="font-serif text-4xl font-bold text-primary mb-2">Verify a Certificate</h1>
          <p className="text-muted-foreground">Enter a TOEFL Academic certificate number to confirm it is authentic.</p>
        </div>

        <Card className="p-6">
          <form onSubmit={(e) => { e.preventDefault(); navigate(`/verify/${query.trim().toUpperCase()}`); }} className="flex gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="TA-2026-XXXXXXXX" className="font-mono uppercase" required />
            <Button type="submit" variant="gold" disabled={loading}><Search className="w-4 h-4 mr-1" /> Verify</Button>
          </form>

          {searched && !loading && (
            <div className="mt-6">
              {cert ? (
                <div className={`border-2 rounded-lg overflow-hidden ${cert.revoked ? "border-destructive" : isExpired ? "border-yellow-500" : "border-success"}`}>
                  {/* Status banner */}
                  <div className={`flex items-center gap-3 px-5 py-4 ${cert.revoked ? "bg-destructive/10" : isExpired ? "bg-yellow-500/10" : "bg-success/10"}`}>
                    {cert.revoked ? (
                      <ShieldX className="w-10 h-10 text-destructive shrink-0" />
                    ) : isExpired ? (
                      <ShieldX className="w-10 h-10 text-yellow-600 shrink-0" />
                    ) : (
                      <BadgeCheck className="w-10 h-10 text-success shrink-0" />
                    )}
                    <div>
                      <div className="font-serif text-2xl font-bold text-primary">
                        {cert.revoked ? "Certificate Revoked" : isExpired ? "Certificate Expired" : "✓ Authentic & Valid"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {cert.revoked
                          ? "This certificate has been revoked by TOEFL Academic."
                          : isExpired
                          ? "This certificate is genuine but has passed its validity date."
                          : "Officially issued and verified by TOEFL Academic."}
                      </div>
                    </div>
                  </div>

                  <div className="p-5 bg-card">
                    <dl className="grid grid-cols-2 gap-3 text-sm mb-5">
                      <div><dt className="text-muted-foreground text-xs uppercase">Holder</dt><dd className="font-semibold">{cert.candidate_name}</dd></div>
                      <div><dt className="text-muted-foreground text-xs uppercase">Level</dt><dd className="font-semibold">{cert.level} — {LEVELS.find((l) => l.code === cert.level)?.name}</dd></div>
                      <div><dt className="text-muted-foreground text-xs uppercase">Grade</dt><dd><Badge variant="outline" className="border-gold text-gold">{cert.band}</Badge></dd></div>
                      <div><dt className="text-muted-foreground text-xs uppercase">Overall Score</dt><dd className="font-semibold">{cert.overall_pct ?? cert.score ?? "—"}%</dd></div>
                      <div><dt className="text-muted-foreground text-xs uppercase">Issued</dt><dd className="font-semibold">{format(new Date(cert.issued_at), "PP")}</dd></div>
                      <div><dt className="text-muted-foreground text-xs uppercase">Valid until</dt><dd className="font-semibold">{format(new Date(cert.valid_until), "PP")}</dd></div>
                      <div className="col-span-2"><dt className="text-muted-foreground text-xs uppercase">Certificate Number</dt><dd className="font-mono">{cert.certificate_number}</dd></div>
                    </dl>

                    {(cert.listening_pct != null || cert.reading_pct != null) && (
                      <>
                        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-semibold">Skill Breakdown</div>
                        <div className="grid grid-cols-4 gap-2 justify-items-center bg-secondary/30 rounded-lg py-4">
                          <Ring value={cert.listening_pct ?? 0} label="Listening" />
                          <Ring value={cert.reading_pct ?? 0} label="Reading" />
                          <Ring value={cert.speaking_pct ?? 0} label="Speaking" />
                          <Ring value={cert.writing_pct ?? 0} label="Writing" />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border-2 border-destructive bg-destructive/5 rounded-lg p-5">
                  <ShieldX className="w-8 h-8 text-destructive mb-2" />
                  <div className="font-serif text-xl font-bold text-primary">Not Found</div>
                  <div className="text-sm text-muted-foreground">No certificate exists with that number. Please check and try again.</div>
                </div>
              )}
            </div>
          )}
        </Card>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Looking to certify your own English? <Link to="/auth?mode=signup" className="text-accent underline">Book a test</Link>.
        </p>
      </div>
    </Layout>
  );
}
