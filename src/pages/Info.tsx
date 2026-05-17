import Layout from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { LEVELS } from "@/lib/levels";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/hooks/useCurrency";

export function About() {
  return <Layout><div className="container mx-auto py-16 max-w-3xl"><h1 className="font-serif text-5xl font-bold text-primary mb-4">About TOEFL Academic</h1><p className="text-muted-foreground text-lg mb-4">TOEFL Academic is a globally accessible online testing programme aligned with the Common European Framework of Reference for Languages (CEFR). Our mission is to make trusted, professional English certification available to anyone, anywhere — without the cost and friction of traditional test centres.</p><p className="text-muted-foreground mb-4">Founded by linguists and assessment specialists, TOEFL Academic delivers six progressive levels (A1–C2), each rigorously calibrated to international language standards. Certificates are issued instantly upon completion, signed by our Director of Examinations, and can be verified publicly by employers, universities, and immigration authorities.</p><h2 className="font-serif text-2xl font-bold text-primary mt-8 mb-3">Our values</h2><ul className="list-disc pl-6 text-muted-foreground space-y-2"><li><b>Accessibility</b> — testing from any device, anywhere in the world.</li><li><b>Integrity</b> — every certificate is uniquely numbered and publicly verifiable.</li><li><b>Standards</b> — strict CEFR alignment ensures comparability with major frameworks.</li><li><b>Speed</b> — instant scoring and certificate delivery, no waiting weeks.</li></ul></div></Layout>;
}

export function Levels() {
  const { format, currency } = useCurrency();
  return <Layout><div className="container mx-auto py-16"><h1 className="font-serif text-5xl font-bold text-primary mb-4 text-center">CEFR Levels</h1><p className="text-muted-foreground text-center max-w-2xl mx-auto mb-10">Choose the level that best matches your current English ability. Prices shown in <strong>{currency}</strong> — change in the top bar.</p><div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">{LEVELS.map(l => <Card key={l.code} className="p-6"><div className="flex items-baseline justify-between mb-2"><span className="font-serif text-4xl font-bold text-primary">{l.code}</span><span className="text-sm text-muted-foreground">{l.duration}</span></div><div className="font-semibold text-lg mb-1">{l.name}</div><p className="text-sm text-muted-foreground mb-4">{l.description}</p><div className="flex justify-between items-center pt-3 border-t border-border"><span className="font-serif text-2xl font-bold text-accent">{format(l.price)}</span><Button asChild size="sm" variant="gold"><Link to={`/auth?mode=signup&level=${l.code}`}>Book</Link></Button></div></Card>)}</div></div></Layout>;
}

export function HowItWorks() {
  const steps = [["Create your account","Sign up free in under a minute. No payment needed to register."],["Choose your level & book","Select from A1 to C2 and pick a time that works for you. Free during launch."],["Take the exam online","A short Listening dictation followed by Reading aloud (with voice recording). Around 5 minutes."],["Examiner review","Qualified TOEFL Academic examiners review your responses, usually within 24 hours."],["Get your certificate","Once approved, download your official PDF certificate with stamp, signature, and QR verification."],["Share & verify","Anyone can verify your certificate at our public verification page using your unique code."]];
  return <Layout><div className="container mx-auto py-16 max-w-3xl"><h1 className="font-serif text-5xl font-bold text-primary mb-8">How it works</h1><div className="space-y-5">{steps.map((s, i) => <div key={i} className="flex gap-4"><div className="w-12 h-12 rounded-full bg-primary text-gold flex items-center justify-center font-serif text-xl font-bold shrink-0">{i+1}</div><div><h3 className="font-serif text-xl font-bold text-primary">{s[0]}</h3><p className="text-muted-foreground">{s[1]}</p></div></div>)}</div></div></Layout>;
}

export function Faq() {
  const qs = [["How long does the exam take?","About 5 minutes — a short listening dictation and a reading-aloud task."],["When will I get my certificate?","Examiners review every submission, usually within 24 hours. You'll see the certificate appear on your dashboard once approved."],["Can I retake the exam?","Yes — book a new attempt anytime from your dashboard."],["Is the certificate accepted by employers?","TOEFL Academic certificates are CEFR-aligned and publicly verifiable, making them widely accepted by employers worldwide. Acceptance for visas/universities depends on the institution."],["How long is my certificate valid?","All certificates are valid for 2 years from the date of issue."],["What if I don't pass?","You'll see the examiner's note and can rebook the same level immediately."],["Is there a free sample?","Yes — try our short sample on the home page."]];
  return <Layout><div className="container mx-auto py-16 max-w-3xl"><h1 className="font-serif text-5xl font-bold text-primary mb-8">Frequently Asked Questions</h1><div className="space-y-4">{qs.map(([q,a],i) => <Card key={i} className="p-5"><h3 className="font-semibold text-primary mb-1">{q}</h3><p className="text-sm text-muted-foreground">{a}</p></Card>)}</div></div></Layout>;
}

export function Contact() {
  return <Layout><div className="container mx-auto py-16 max-w-2xl"><h1 className="font-serif text-5xl font-bold text-primary mb-4">Contact Us</h1><p className="text-muted-foreground mb-6">Have a question, partnership inquiry, or need help with a certificate? Get in touch.</p><Card className="p-6 space-y-3"><div><div className="text-xs uppercase text-muted-foreground">Email</div><div className="font-semibold">support@toeflacademic.com</div></div><div><div className="text-xs uppercase text-muted-foreground">Organisations</div><div className="font-semibold">partners@toeflacademic.com</div></div><div><div className="text-xs uppercase text-muted-foreground">Hours</div><div className="font-semibold">Mon–Fri, 09:00–18:00 GMT</div></div></Card></div></Layout>;
}

export function Privacy() {
  return <Layout><div className="container mx-auto py-16 max-w-3xl prose prose-sm"><h1 className="font-serif text-5xl font-bold text-primary mb-4">Privacy Policy</h1><p className="text-muted-foreground">TOEFL Academic collects only the information necessary to deliver your test, issue your certificate, and verify it publicly. We never sell personal data. Your name and certificate details are made publicly verifiable by certificate number — that is the entire point of the certification system. You may request deletion of your account at any time by contacting us.</p></div></Layout>;
}

export function Terms() {
  return <Layout><div className="container mx-auto py-16 max-w-3xl"><h1 className="font-serif text-5xl font-bold text-primary mb-4">Terms of Service</h1><p className="text-muted-foreground">By using TOEFL Academic you agree to take exams honestly and without external assistance. Certificates obtained through fraudulent means will be revoked. TOEFL Academic reserves the right to invalidate any certificate found to be issued in error or in breach of these terms.</p></div></Layout>;
}

export function ForEmployers() {
  return <Layout><div className="container mx-auto py-16 max-w-3xl"><h1 className="font-serif text-5xl font-bold text-primary mb-4">For Employers</h1><p className="text-muted-foreground mb-4">Verify a candidate's English level instantly. Every TOEFL Academic certificate has a unique number that anyone can check at our public verification page — no account required.</p><Button asChild variant="gold"><Link to="/verify">Verify a certificate</Link></Button></div></Layout>;
}

export function ForSchools() {
  return <Layout><div className="container mx-auto py-16 max-w-3xl"><h1 className="font-serif text-5xl font-bold text-primary mb-4">For Schools</h1><p className="text-muted-foreground mb-4">Use TOEFL Academic certification as part of your admissions process or to benchmark student progress. Volume pricing available for institutions.</p><Button asChild variant="gold"><Link to="/contact">Contact us</Link></Button></div></Layout>;
}

export function Recognition() {
  return <Layout><div className="container mx-auto py-16 max-w-3xl"><h1 className="font-serif text-5xl font-bold text-primary mb-4">Recognition</h1><p className="text-muted-foreground mb-4">TOEFL Academic certificates are CEFR-aligned, mapping directly to the international Common European Framework reference levels (A1, A2, B1, B2, C1, C2). This makes our certifications comparable with widely-used English benchmarks across employers, schools, and immigration authorities globally.</p><p className="text-muted-foreground">Each certificate carries a unique ID, QR verification code, and is signed by our Director of Examinations.</p></div></Layout>;
}

export function SampleTest() {
  return <Layout><div className="container mx-auto py-16 max-w-2xl text-center"><h1 className="font-serif text-5xl font-bold text-primary mb-4">Free Sample Test</h1><p className="text-muted-foreground mb-6">Get a feel for the TOEFL Academic experience. Sign up and your dashboard lets you book any level — there's no charge to register.</p><Button asChild variant="gold" size="lg"><Link to="/auth?mode=signup">Create free account</Link></Button></div></Layout>;
}
