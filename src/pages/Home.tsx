import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { LEVELS } from "@/lib/levels";
import { CheckCircle2, BadgeCheck, Building2 } from "lucide-react";
import stamp from "@/assets/stamp.svg";
import { useCurrency } from "@/hooks/useCurrency";

export default function Home() {
  const { format } = useCurrency();

  return (
    <Layout>
      {/* ── PROSPECTUS MASTHEAD ───────────────────────────────── */}
      <section className="bg-background border-b border-border">
        {/* Info strip — like a document header */}
        <div className="bg-parchment border-b border-border">
          <div className="container mx-auto py-2.5 flex items-center gap-4 flex-wrap">
            {["CEFR Aligned · A1–C2", "Examiner Reviewed", "Est. 2025", "Public Certificate Verification"].map((t, i) => (
              <span key={t} className="flex items-center gap-4">
                {i > 0 && <span className="w-px h-3 bg-border inline-block" />}
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{t}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="container mx-auto py-20">
          <div className="grid lg:grid-cols-[1fr_280px] gap-16 items-start">
            {/* Heading — full-width, editorial */}
            <div>
              <h1 className="font-serif text-6xl lg:text-[4.25rem] font-bold text-foreground leading-[1.02] mb-8">
                Your English proficiency,<br />
                <span className="italic text-primary">officially certified.</span>
              </h1>
              <p className="text-muted-foreground text-lg leading-relaxed max-w-xl mb-10">
                TOEFL Academic issues CEFR-aligned English proficiency certificates reviewed by qualified
                examiners. 100% online. Publicly verifiable. Recognised globally.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="bg-primary text-primary-foreground font-semibold hover:bg-primary/90 px-8">
                  <Link to="/auth?mode=signup">Register — it's free</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/sample-test">Try a sample examination</Link>
                </Button>
              </div>
            </div>

            {/* Stats — document-style data block, not marketing */}
            <div className="border border-border bg-card shadow-card hidden lg:block" style={{ borderRadius: 4 }}>
              <div className="px-5 py-3 bg-parchment border-b border-border">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">At a glance</span>
              </div>
              {[
                ["Candidates certified", "48,000+"],
                ["Countries represented", "120+"],
                ["Candidate rating", "4.9 / 5"],
                ["Certificate turnaround", "≤ 24 hours"],
                ["CEFR levels offered", "6 (A1 – C2)"],
              ].map(([label, value], i, arr) => (
                <div key={label} className={`flex justify-between items-center px-5 py-3.5 ${i < arr.length - 1 ? "border-b border-border" : ""}`}>
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="font-serif font-bold text-sm text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── EXAMINATION TABLE ─────────────────────────────────── */}
      <section className="container mx-auto py-20">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-px bg-border" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Examinations offered</span>
          </div>
          <h2 className="font-serif text-3xl font-bold text-foreground">Select your examination level</h2>
        </div>

        <div className="border border-border overflow-hidden" style={{ borderRadius: 4 }}>
          {/* Column headers — desktop only */}
          <div className="hidden md:grid md:grid-cols-[90px_1fr_130px_110px_130px] bg-parchment border-b border-border px-6 py-3">
            {["Level", "Examination", "Duration", "Fee", ""].map((h) => (
              <div key={h} className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{h}</div>
            ))}
          </div>

          {LEVELS.map((lvl, i) => (
            <div
              key={lvl.code}
              className={`group flex flex-col md:grid md:grid-cols-[90px_1fr_130px_110px_130px] gap-3 md:gap-0 items-start md:items-center px-6 py-5 hover:bg-parchment/60 transition-smooth ${i < LEVELS.length - 1 ? "border-b border-border" : ""}`}
            >
              <div className="font-serif text-3xl font-bold text-primary">{lvl.code}</div>
              <div className="md:pr-6">
                <div className="font-semibold text-foreground text-sm">{lvl.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{lvl.description}</div>
              </div>
              <div className="text-sm text-muted-foreground hidden md:block">{lvl.duration}</div>
              <div className="font-serif font-bold text-foreground hidden md:block">{format(lvl.price)}</div>
              <div className="flex items-center justify-between w-full md:w-auto gap-4">
                <div className="md:hidden text-sm">
                  <span className="text-muted-foreground mr-2">{lvl.duration}</span>
                  <span className="font-serif font-bold text-foreground">{format(lvl.price)}</span>
                </div>
                <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0">
                  <Link to={`/auth?mode=signup&level=${lvl.code}`}>Book →</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CERTIFICATE SPECIMEN ──────────────────────────────── */}
      <section className="bg-parchment border-y border-border py-20">
        <div className="container mx-auto">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-8 h-px bg-border" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">What you receive</span>
          </div>

          <div className="grid lg:grid-cols-[1fr_2fr] gap-16 items-start">
            {/* Copy */}
            <div>
              <h2 className="font-serif text-3xl font-bold text-foreground mb-4">
                Your official certificate of proficiency
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-8">
                Every certificate carries a unique reference number, a qualified examiner's signature,
                and a QR code allowing any employer, university, or institution to verify authenticity
                in seconds — no account required.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Examiner name and signature",
                  "CEFR level and awarded band",
                  "Per-skill percentage breakdown",
                  "Unique certificate reference number",
                  "QR code linking to public verification",
                  "Valid for 2 years from date of issue",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span className="text-foreground">{t}</span>
                  </li>
                ))}
              </ul>
              <div className="inline-flex items-center gap-2.5 border border-border bg-card px-4 py-3 shadow-card" style={{ borderRadius: 4 }}>
                <BadgeCheck className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-foreground">Publicly verifiable</div>
                  <div className="text-[10px] text-muted-foreground">Search by certificate ID at toeflacademic.com/verify</div>
                </div>
              </div>
            </div>

            {/* Large certificate specimen */}
            <div className="relative">
              <div
                className="aspect-[297/210] bg-[#fcfaf4] relative overflow-hidden"
                style={{ borderRadius: 2, boxShadow: "0 32px 80px -12px rgba(28,20,16,0.18), 0 4px 16px rgba(28,20,16,0.07)" }}
              >
                <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "repeating-linear-gradient(45deg, #C8973A 0 1px, transparent 1px 8px)" }} />
                <div className="absolute inset-[5%] border-[2px] border-[#C8973A]" />
                <div className="absolute inset-[6.5%] border border-[#C8973A]/40" />
                {["top-[5%] left-[5%]", "top-[5%] right-[5%]", "bottom-[5%] left-[5%]", "bottom-[5%] right-[5%]"].map((p) => (
                  <div key={p} className={`absolute ${p} w-3 h-3 rounded-full border-2 border-[#C8973A] flex items-center justify-center`}>
                    <div className="w-1 h-1 rounded-full bg-[#C8973A]" />
                  </div>
                ))}
                <div className="absolute top-[5%] left-[5%] right-[5%] h-[11%] bg-[#1E1D4C] flex items-center justify-center">
                  <div className="text-center">
                    <div className="font-serif font-bold text-white tracking-widest" style={{ fontSize: "clamp(8px, 1.4vw, 14px)" }}>TOEFL ACADEMIC</div>
                    <div className="italic text-white/65" style={{ fontSize: "clamp(6px, 0.8vw, 9px)" }}>Globally Recognised · CEFR Aligned · Est. 2025</div>
                  </div>
                </div>
                <div className="absolute inset-0 pt-[17%] flex flex-col items-center justify-start text-center px-[10%]">
                  <div className="font-serif font-bold text-[#1C1410]" style={{ fontSize: "clamp(10px, 2vw, 20px)", marginTop: "2%" }}>Certificate of Achievement</div>
                  <div className="w-16 bg-[#C8973A] my-1" style={{ height: 1 }} />
                  <div className="text-[#888]" style={{ fontSize: "clamp(6px, 0.8vw, 9px)" }}>This is to formally certify that</div>
                  <div className="font-serif font-bold text-[#1C1410] border-b border-[#C8973A]/60 px-3 pb-0.5 mt-1" style={{ fontSize: "clamp(9px, 1.8vw, 18px)" }}>Your Full Name Here</div>
                  <div className="text-[#888] mt-1" style={{ fontSize: "clamp(6px, 0.75vw, 8px)" }}>has demonstrated proficiency in the English language at level</div>
                  <div className="font-serif font-bold text-[#C8973A] mt-0.5" style={{ fontSize: "clamp(8px, 1.4vw, 14px)" }}>B2 — Upper-Intermediate</div>
                  <div className="font-serif italic text-[#1C1410] mt-0.5" style={{ fontSize: "clamp(6px, 0.8vw, 9px)" }}>Awarded the grade of "Pass with Merit" · Overall 82%</div>
                </div>
                <img src={stamp} alt="" className="absolute bottom-[8%] right-[8%] rotate-12 opacity-85" style={{ width: "16%", height: "auto" }} />
              </div>
              <p className="text-xs text-muted-foreground mt-4 text-center">Specimen certificate — issued upon successful examination</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── PROCESS — editorial numbered list ────────────────── */}
      <section className="container mx-auto py-20">
        <div className="grid lg:grid-cols-[300px_1fr] gap-16">
          <div className="lg:sticky lg:top-24 self-start">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-px bg-border" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Process</span>
            </div>
            <h2 className="font-serif text-3xl font-bold text-foreground mb-4">
              From registration<br />to certificate
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              No test centre. No scheduling anxiety.<br />Completed in under 10 minutes from your browser.
            </p>
          </div>

          <div>
            {[
              ["01", "Create your account", "Free registration in under one minute. No payment required to sign up or explore the platform."],
              ["02", "Book your examination", "Select a CEFR level that matches your current ability and confirm your booking. Payment is collected at this stage."],
              ["03", "Complete the examination", "A listening dictation followed by a spoken reading passage, recorded via your browser. Approximately five minutes total."],
              ["04", "Receive your certificate", "A qualified examiner reviews your responses and issues the official certificate, typically within 24 hours of submission."],
            ].map(([n, title, desc], i) => (
              <div key={n} className={`grid grid-cols-[72px_1fr] gap-6 py-10 ${i < 3 ? "border-b border-border" : ""}`}>
                <div className="font-serif text-5xl font-bold text-primary/15 leading-none pt-1">{n}</div>
                <div>
                  <div className="font-serif text-xl font-bold text-foreground mb-2">{title}</div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOR ORGANISATIONS ─────────────────────────────────── */}
      <section className="bg-parchment border-y border-border py-16">
        <div className="container mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-px bg-border" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Organisations</span>
            </div>
            <h2 className="font-serif text-3xl font-bold text-foreground mb-4">
              Verify candidates.<br />Arrange group testing.
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              Any employer, university, or immigration authority can verify a TOEFL Academic certificate
              instantly using the certificate number or QR code — no account needed. We also offer
              volume pricing for institutions.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Link to="/verify">Verify a certificate</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/contact">Talk to us</Link>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              ["Employers", "Confirm that a candidate's English proficiency matches the role requirements."],
              ["Universities", "Verify applicant certificates before conditional offers are made."],
              ["Immigration", "Use our public lookup to satisfy language proficiency requirements."],
              ["Schools", "Arrange group examination sessions and receive bulk certificate delivery."],
            ].map(([title, desc]) => (
              <div key={title} className="bg-card border border-border p-5 shadow-card" style={{ borderRadius: 4 }}>
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  <div className="font-semibold text-sm text-foreground">{title}</div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA — indigo: the credential authority surface ────── */}
      <section className="bg-indigo text-cream py-20">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-8 h-px bg-white/20" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-cream/60 font-semibold">Get started today</span>
            <div className="w-8 h-px bg-white/20" />
          </div>
          <h2 className="font-serif text-4xl md:text-5xl font-bold mb-4">
            Ready to certify your English?
          </h2>
          <p className="text-cream/65 mb-8 text-lg leading-relaxed max-w-xl mx-auto">
            Join thousands of learners worldwide who have proven their English proficiency with TOEFL Academic.
          </p>
          <Button asChild size="lg" className="bg-primary text-primary-foreground font-semibold hover:bg-primary/90 px-10">
            <Link to="/auth?mode=signup">Create your account — it's free</Link>
          </Button>
          <p className="text-cream/35 text-xs mt-4">No payment required to sign up · Results reviewed within 24 hours</p>
        </div>
      </section>
    </Layout>
  );
}
