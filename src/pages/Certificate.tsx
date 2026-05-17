import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Download, ShieldCheck, ArrowLeft, Headphones, BookOpen, Mic, PenLine } from "lucide-react";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import logo from "@/assets/logo.svg";
import stamp from "@/assets/stamp.svg";
import signature from "@/assets/signature.svg";
import { LEVELS } from "@/lib/levels";

async function imgToDataUrl(src: string, w = 200, h = 200): Promise<string> {
  const r = await fetch(src);
  const b = await r.blob();
  if (b.type.includes("svg")) {
    const svgText = await b.text();
    return new Promise((resolve) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(objUrl);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = objUrl;
    });
  }
  return new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.readAsDataURL(b);
  });
}

// Small skill ring component (SVG)
function SkillRing({ value, label, color = "hsl(var(--gold))" }: { value: number; label: string; color?: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  return (
    <div className="flex flex-col items-center">
      <svg width="70" height="70" viewBox="0 0 70 70">
        <circle cx="35" cy="35" r={r} stroke="hsl(var(--muted))" strokeWidth="6" fill="none" opacity="0.4" />
        <circle
          cx="35" cy="35" r={r}
          stroke={color} strokeWidth="6" fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          transform="rotate(-90 35 35)"
        />
        <text x="35" y="40" textAnchor="middle" className="fill-primary font-serif font-bold" fontSize="15">{value}%</text>
      </svg>
      <div className="text-[10px] md:text-xs font-semibold text-primary mt-1 uppercase tracking-wider">{label}</div>
    </div>
  );
}

export default function Certificate() {
  const { number } = useParams();
  const [cert, setCert] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const certRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!number) return;
    (async () => {
      const { data } = await supabase.from("certificates").select("*").eq("certificate_number", number).maybeSingle();
      if (!data) setNotFound(true); else setCert(data);
    })();
  }, [number]);

  // Draw a skill ring directly into the PDF
  const drawRing = (pdf: jsPDF, cx: number, cy: number, value: number, label: string) => {
    const r = 9;
    // background ring
    pdf.setDrawColor(220, 215, 200);
    pdf.setLineWidth(2);
    pdf.circle(cx, cy, r);
    // foreground arc using small line segments
    const pct = Math.max(0, Math.min(100, value)) / 100;
    pdf.setDrawColor(196, 152, 53);
    pdf.setLineWidth(2.2);
    const steps = Math.max(2, Math.round(60 * pct));
    for (let i = 0; i < steps; i++) {
      const a1 = -Math.PI / 2 + (i / 60) * Math.PI * 2;
      const a2 = -Math.PI / 2 + ((i + 1) / 60) * Math.PI * 2;
      pdf.line(cx + r * Math.cos(a1), cy + r * Math.sin(a1), cx + r * Math.cos(a2), cy + r * Math.sin(a2));
    }
    // value text
    pdf.setFont("times", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(13, 34, 71);
    pdf.text(`${value}%`, cx, cy + 1, { align: "center" });
    // label
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(60, 60, 60);
    pdf.text(label.toUpperCase(), cx, cy + r + 4, { align: "center" });
  };

  const download = async () => {
    if (!cert) return;
    setDownloading(true);
    try {
      const verifyUrl = `${window.location.origin}/verify/${cert.certificate_number}`;
      const [logoData, stampData, sigData, qrData] = await Promise.all([
        imgToDataUrl(logo, 200, 200), imgToDataUrl(stamp, 200, 200), imgToDataUrl(signature, 280, 90),
        QRCode.toDataURL(verifyUrl, { margin: 1, width: 240, color: { dark: "#0d2247", light: "#fcfaf4" } }),
      ]);

      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const W = 297, H = 210;

      // Background
      pdf.setFillColor(252, 250, 244);
      pdf.rect(0, 0, W, H, "F");

      // Subtle guilloché-like diagonal lines for security feel
      pdf.setDrawColor(232, 222, 198);
      pdf.setLineWidth(0.1);
      for (let i = -H; i < W; i += 3) {
        pdf.line(i, 0, i + H, H);
      }

      // Outer gold border
      pdf.setDrawColor(196, 152, 53);
      pdf.setLineWidth(2);
      pdf.rect(8, 8, W - 16, H - 16);
      pdf.setLineWidth(0.4);
      pdf.rect(11, 11, W - 22, H - 22);

      // Corner ornaments
      pdf.setDrawColor(196, 152, 53);
      pdf.setLineWidth(0.6);
      [[14,14],[W-14,14],[14,H-14],[W-14,H-14]].forEach(([x,y]) => {
        pdf.circle(x, y, 2.5);
        pdf.circle(x, y, 1.2);
      });

      // Top navy bar
      pdf.setFillColor(13, 34, 71);
      pdf.rect(11, 11, W - 22, 18, "F");

      // Logo
      pdf.addImage(logoData, "PNG", 18, 13, 14, 14);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("times", "bold");
      pdf.setFontSize(16);
      pdf.text("TOEFL ACADEMIC", W / 2, 21, { align: "center" });
      pdf.setFont("times", "italic");
      pdf.setFontSize(8);
      pdf.text("Globally Recognised  ·  CEFR Aligned  ·  Est. 2025", W / 2, 26, { align: "center" });

      // Title
      pdf.setTextColor(13, 34, 71);
      pdf.setFont("times", "bold");
      pdf.setFontSize(30);
      pdf.text("Certificate of Achievement", W / 2, 48, { align: "center" });

      pdf.setDrawColor(196, 152, 53);
      pdf.setLineWidth(0.6);
      pdf.line(W / 2 - 50, 52, W / 2 + 50, 52);

      // Body
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(60, 60, 60);
      pdf.text("This is to formally certify that", W / 2, 62, { align: "center" });

      pdf.setFont("times", "bold");
      pdf.setFontSize(28);
      pdf.setTextColor(13, 34, 71);
      pdf.text(cert.candidate_name, W / 2, 78, { align: "center" });
      // underline name
      pdf.setDrawColor(196, 152, 53);
      pdf.setLineWidth(0.4);
      const nameWidth = pdf.getTextWidth(cert.candidate_name);
      pdf.line(W/2 - nameWidth/2 - 4, 81, W/2 + nameWidth/2 + 4, 81);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(60, 60, 60);
      const lvlName = LEVELS.find((l) => l.code === cert.level)?.name ?? "";
      pdf.text(`has demonstrated proficiency in the English language at level`, W / 2, 90, { align: "center" });

      pdf.setFont("times", "bold");
      pdf.setFontSize(20);
      pdf.setTextColor(196, 152, 53);
      pdf.text(`${cert.level}  —  ${lvlName}`, W / 2, 100, { align: "center" });

      pdf.setFont("times", "italic");
      pdf.setFontSize(13);
      pdf.setTextColor(13, 34, 71);
      pdf.text(`Awarded the grade of "${cert.band}"  ·  Overall ${cert.overall_pct ?? cert.score ?? 0}%`, W / 2, 109, { align: "center" });

      // Skill rings row
      const ringY = 128;
      const xs = [W/2 - 60, W/2 - 20, W/2 + 20, W/2 + 60];
      drawRing(pdf, xs[0], ringY, cert.listening_pct ?? 0, "Listening");
      drawRing(pdf, xs[1], ringY, cert.reading_pct ?? 0, "Reading");
      drawRing(pdf, xs[2], ringY, cert.speaking_pct ?? 0, "Speaking");
      drawRing(pdf, xs[3], ringY, cert.writing_pct ?? 0, "Writing");

      // Signature
      pdf.addImage(sigData, "PNG", 35, 158, 50, 18);
      pdf.setDrawColor(120, 120, 120);
      pdf.setLineWidth(0.3);
      pdf.line(30, 178, 90, 178);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(13, 34, 71);
      pdf.text("Dr. A. Mitchell", 60, 183, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(80, 80, 80);
      pdf.text("Director of Examinations", 60, 187, { align: "center" });

      // Date
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(13, 34, 71);
      pdf.text(format(new Date(cert.issued_at), "dd MMMM yyyy"), W / 2, 183, { align: "center" });
      pdf.line(W / 2 - 25, 178, W / 2 + 25, 178);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(80, 80, 80);
      pdf.text("Date of Issue", W / 2, 187, { align: "center" });

      // Stamp
      pdf.addImage(stampData, "PNG", 210, 152, 32, 32);

      // QR code with frame
      pdf.setDrawColor(13, 34, 71);
      pdf.setLineWidth(0.4);
      pdf.rect(W - 39, 151, 24, 24);
      pdf.addImage(qrData, "PNG", W - 38, 152, 22, 22);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7);
      pdf.setTextColor(13, 34, 71);
      pdf.text("Scan to verify", W - 27, 179, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6);
      pdf.setTextColor(100, 100, 100);
      pdf.text("Authenticity check", W - 27, 182, { align: "center" });

      // Footer cert number
      pdf.setFont("courier", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(13, 34, 71);
      pdf.text(`Certificate No: ${cert.certificate_number}`, W / 2, 197, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(120, 120, 120);
      pdf.text(`Verify at: ${verifyUrl}   ·   Valid until ${format(new Date(cert.valid_until), "dd MMM yyyy")}`, W / 2, 201, { align: "center" });

      pdf.save(`TOEFL-Academic-Certificate-${cert.certificate_number}.pdf`);
    } finally { setDownloading(false); }
  };

  if (notFound) return <Layout><div className="container py-20 text-center"><h1 className="font-serif text-3xl">Certificate not found</h1><Button asChild className="mt-4"><Link to="/verify">Verify another</Link></Button></div></Layout>;
  if (!cert) return <Layout><div className="container py-20 text-center">Loading...</div></Layout>;

  const lvlName = LEVELS.find((l) => l.code === cert.level)?.name ?? "";
  const verifyUrl = `${window.location.origin}/verify/${cert.certificate_number}`;
  const skills = [
    { label: "Listening", value: cert.listening_pct ?? 0, Icon: Headphones },
    { label: "Reading", value: cert.reading_pct ?? 0, Icon: BookOpen },
    { label: "Speaking", value: cert.speaking_pct ?? 0, Icon: Mic },
    { label: "Writing", value: cert.writing_pct ?? 0, Icon: PenLine },
  ];

  return (
    <Layout>
      <div className="container mx-auto py-10 max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <Button asChild variant="ghost"><Link to="/dashboard"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Link></Button>
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link to={`/verify/${cert.certificate_number}`}><ShieldCheck className="w-4 h-4 mr-1" /> Public verify page</Link></Button>
            <Button variant="gold" onClick={download} disabled={downloading}><Download className="w-4 h-4 mr-1" /> {downloading ? "Generating..." : "Download PDF"}</Button>
          </div>
        </div>

        {/* On-screen certificate preview */}
        <Card ref={certRef} className="aspect-[297/210] bg-[#fcfaf4] relative overflow-hidden border-0 shadow-elegant">
          {/* security pattern */}
          <div
            className="absolute inset-0 opacity-[0.07] pointer-events-none"
            style={{ backgroundImage: "repeating-linear-gradient(45deg, hsl(var(--gold)) 0 1px, transparent 1px 8px)" }}
          />
          <div className="absolute inset-2 border-[3px] border-gold" />
          <div className="absolute inset-3 border border-gold/60" />
          {/* corner ornaments */}
          {[ "top-3 left-3", "top-3 right-3", "bottom-3 left-3", "bottom-3 right-3" ].map((p) => (
            <div key={p} className={`absolute ${p} w-4 h-4 rounded-full border-2 border-gold flex items-center justify-center`}>
              <div className="w-1.5 h-1.5 rounded-full bg-gold" />
            </div>
          ))}

          <div className="absolute top-3 left-3 right-3 h-[10%] bg-primary text-primary-foreground flex items-center justify-center">
            <img src={logo} alt="" className="h-8 w-8 absolute left-4" />
            <div className="text-center">
              <div className="font-serif font-bold text-lg md:text-xl tracking-wider">TOEFL ACADEMIC</div>
              <div className="text-[9px] md:text-xs italic opacity-80">Globally Recognised · CEFR Aligned · Est. 2025</div>
            </div>
          </div>

          <div className="absolute inset-0 pt-[13%] pb-[26%] px-[8%] flex flex-col items-center justify-start text-center">
            <h1 className="font-serif text-2xl md:text-4xl font-bold text-primary mt-2">Certificate of Achievement</h1>
            <div className="w-32 h-px bg-gold my-2" />
            <p className="text-muted-foreground text-xs md:text-sm">This is to formally certify that</p>
            <div className="font-serif text-xl md:text-3xl font-bold text-primary mt-1 border-b border-gold/60 px-4 pb-1">{cert.candidate_name}</div>
            <p className="text-muted-foreground text-[11px] md:text-sm mt-2">has demonstrated proficiency in the English language at level</p>
            <div className="font-serif text-lg md:text-2xl font-bold text-gold mt-1">{cert.level} — {lvlName}</div>
            <p className="font-serif italic text-primary text-[11px] md:text-base mt-1">Awarded the grade of "{cert.band}" · Overall {cert.overall_pct ?? cert.score ?? 0}%</p>

            {/* Skill rings on screen */}
            <div className="flex gap-3 md:gap-8 mt-3">
              {skills.map((s) => (
                <SkillRing key={s.label} value={s.value} label={s.label} />
              ))}
            </div>
          </div>

          <div className="absolute bottom-4 left-0 right-0 px-[6%] flex items-end justify-between">
            <div className="text-center">
              <img src={signature} alt="" className="h-8 md:h-10 mx-auto" />
              <div className="border-t border-muted-foreground/40 w-28 mt-1 mx-auto" />
              <div className="text-[9px] md:text-xs font-semibold text-primary mt-1">Dr. A. Mitchell</div>
              <div className="text-[8px] md:text-[10px] text-muted-foreground">Director of Examinations</div>
            </div>
            <div className="text-center hidden md:block">
              <div className="text-xs text-primary font-mono font-bold">{cert.certificate_number}</div>
              <div className="text-[10px] text-muted-foreground">Issued {format(new Date(cert.issued_at), "dd MMM yyyy")}</div>
              <div className="text-[10px] text-muted-foreground">Valid until {format(new Date(cert.valid_until), "dd MMM yyyy")}</div>
            </div>
            <img src={stamp} alt="" className="h-14 md:h-16 rotate-12" />
          </div>
        </Card>

        <Card className="mt-6 p-5">
          <div className="font-semibold mb-2 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-success" /> Public verification link</div>
          <code className="text-xs bg-secondary/40 p-2 rounded block break-all">{verifyUrl}</code>
          <p className="text-xs text-muted-foreground mt-2">Anyone — including employers and universities — can use this link or scan the QR code on the PDF to verify your certificate without an account.</p>
        </Card>
      </div>
    </Layout>
  );
}
