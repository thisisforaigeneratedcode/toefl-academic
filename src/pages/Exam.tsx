import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Headphones, Mic, Play, Square, RotateCcw, CheckCircle2, BookOpen } from "lucide-react";

type Step = "intro" | "listening" | "reading" | "review";

export default function Exam() {
  const { id } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<any>(null);
  const [step, setStep] = useState<Step>("intro");

  // Listening
  const [listeningResponse, setListeningResponse] = useState("");
  const [playsLeft, setPlaysLeft] = useState(2);
  const [isPlaying, setIsPlaying] = useState(false);

  // Reading
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<number | null>(null);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      const { data: a } = await supabase.from("exam_attempts").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
      if (!a) { toast.error("Exam not found"); navigate("/dashboard"); return; }
      if (a.status === "submitted" || a.status === "graded") { navigate(`/results/${a.id}`); return; }
      setAttempt(a);
    })();
  }, [user, id, navigate]);

  // Cleanup recording on unmount
  useEffect(() => () => {
    if (recTimerRef.current) window.clearInterval(recTimerRef.current);
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    try { window.speechSynthesis?.cancel(); } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const playListening = () => {
    if (!attempt?.listening_prompt_text || playsLeft <= 0 || isPlaying) return;
    try {
      const u = new SpeechSynthesisUtterance(attempt.listening_prompt_text);
      u.lang = "en-US";
      u.rate = 0.92;
      u.pitch = 1;
      u.onend = () => setIsPlaying(false);
      u.onerror = () => { setIsPlaying(false); toast.error("Couldn't play audio. Please use Chrome, Edge or Safari."); };
      setIsPlaying(true);
      setPlaysLeft((n) => n - 1);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      toast.error("Audio not supported in this browser");
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setRecordedBlob(blob);
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      setRecordSeconds(0);
      recTimerRef.current = window.setInterval(() => setRecordSeconds((s) => {
        if (s + 1 >= 90) { stopRecording(); return 90; }
        return s + 1;
      }), 1000);
    } catch (e: any) {
      toast.error("Microphone access denied. Please allow microphone permissions and try again.");
    }
  };

  const stopRecording = () => {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    if (recTimerRef.current) { window.clearInterval(recTimerRef.current); recTimerRef.current = null; }
    setRecording(false);
  };

  const resetRecording = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null); setRecordedUrl(null); setRecordSeconds(0);
  };

  const submit = async () => {
    if (!attempt || !user) return;
    if (!listeningResponse.trim()) { toast.error("Please complete the listening section first."); setStep("listening"); return; }
    if (!recordedBlob) { toast.error("Please record your reading before submitting."); setStep("reading"); return; }

    setSubmitting(true);
    try {
      const ext = (recordedBlob.type.includes("mp4") ? "m4a" : "webm");
      const path = `${user.id}/${attempt.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from("exam-recordings").upload(path, recordedBlob, {
        contentType: recordedBlob.type || "audio/webm",
        upsert: true,
      });
      if (upErr) throw upErr;

      const { data, error } = await supabase.functions.invoke("submit-exam", {
        body: { attempt_id: id, listening_response: listeningResponse, reading_audio_url: path },
      });
      if (error) throw error;
      toast.success("Submitted! An examiner will review your responses shortly.");
      navigate(`/results/${id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Submission failed");
      setSubmitting(false);
    }
  };

  if (loading) return <Layout><div className="container py-20 text-center">Loading...</div></Layout>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!attempt) return <Layout><div className="container py-20 text-center">Loading exam...</div></Layout>;

  const stepIndex = step === "intro" ? 0 : step === "listening" ? 1 : step === "reading" ? 2 : 3;
  const mins = Math.floor(recordSeconds / 60);
  const secs = recordSeconds % 60;

  return (
    <Layout>
      <div className="container mx-auto py-6 max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <Badge variant="secondary" className="font-serif font-bold">{attempt.level} Exam</Badge>
          <div className="text-sm text-muted-foreground">Step {Math.min(stepIndex + 1, 4)} of 4</div>
        </div>
        <Progress value={((stepIndex + 1) / 4) * 100} className="mb-6" />

        <Card className="p-6 md:p-8 shadow-card">
          {step === "intro" && (
            <div>
              <div className="text-xs uppercase tracking-wider text-accent font-semibold mb-2">Welcome</div>
              <h2 className="font-serif text-3xl font-bold text-primary mb-3">Your {attempt.level} examination</h2>
              <p className="text-muted-foreground mb-4">This exam has two short sections and takes around 5 minutes.</p>
              <ol className="space-y-3 mb-6">
                <li className="flex gap-3"><Headphones className="w-5 h-5 text-accent shrink-0 mt-0.5" /><div><div className="font-semibold">1. Listening</div><div className="text-sm text-muted-foreground">Listen to a short sentence (you can play it twice) and type exactly what you heard.</div></div></li>
                <li className="flex gap-3"><Mic className="w-5 h-5 text-accent shrink-0 mt-0.5" /><div><div className="font-semibold">2. Reading aloud</div><div className="text-sm text-muted-foreground">Read a short paragraph aloud while we record your voice. You can re-record if you wish.</div></div></li>
                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-accent shrink-0 mt-0.5" /><div><div className="font-semibold">3. Submit for review</div><div className="text-sm text-muted-foreground">Our examiners will review your responses and issue your certificate.</div></div></li>
              </ol>
              <div className="bg-secondary/40 border border-border rounded-md p-3 text-xs text-muted-foreground mb-6">
                Please make sure your microphone and speakers/headphones are working before you continue. We recommend Chrome, Edge or Safari.
              </div>
              <Button variant="gold" onClick={() => setStep("listening")}>Begin exam</Button>
            </div>
          )}

          {step === "listening" && (
            <div>
              <div className="text-xs uppercase tracking-wider text-accent font-semibold mb-2 flex items-center gap-2"><Headphones className="w-3.5 h-3.5" /> Section 1 · Listening</div>
              <h2 className="font-serif text-2xl font-bold text-primary mb-2">Listen and type what you hear</h2>
              <p className="text-muted-foreground text-sm mb-5">Click play, listen carefully, then type the sentence below. You can play the audio up to 2 times.</p>

              <div className="flex flex-wrap items-center gap-3 mb-5">
                <Button onClick={playListening} disabled={playsLeft <= 0 || isPlaying} variant="default" size="lg">
                  <Play className="w-5 h-5 mr-2" /> {isPlaying ? "Playing..." : "Play audio"}
                </Button>
                <span className="text-sm text-muted-foreground">Plays remaining: <strong>{playsLeft}</strong></span>
              </div>

              <Textarea
                value={listeningResponse}
                onChange={(e) => setListeningResponse(e.target.value)}
                rows={5}
                maxLength={1000}
                placeholder="Type exactly what you heard..."
              />
              <div className="text-xs text-muted-foreground mt-1">{listeningResponse.trim().split(/\s+/).filter(Boolean).length} words</div>

              <div className="flex justify-between mt-6 pt-6 border-t border-border">
                <Button variant="ghost" onClick={() => setStep("intro")}>Back</Button>
                <Button variant="gold" onClick={() => setStep("reading")} disabled={!listeningResponse.trim()}>Next: Reading</Button>
              </div>
            </div>
          )}

          {step === "reading" && (
            <div>
              <div className="text-xs uppercase tracking-wider text-accent font-semibold mb-2 flex items-center gap-2"><BookOpen className="w-3.5 h-3.5" /> Section 2 · Reading aloud</div>
              <h2 className="font-serif text-2xl font-bold text-primary mb-2">Read this paragraph aloud</h2>
              <p className="text-muted-foreground text-sm mb-4">Press <strong>Start recording</strong>, read clearly at a natural pace, then press stop. Maximum 90 seconds.</p>

              <div className="bg-secondary/40 border-l-4 border-accent rounded-md p-4 mb-5 font-serif text-lg leading-relaxed text-primary">
                {attempt.reading_passage}
              </div>

              <div className="flex flex-wrap items-center gap-3 mb-4">
                {!recording && !recordedBlob && (
                  <Button onClick={startRecording} variant="default" size="lg"><Mic className="w-5 h-5 mr-2" /> Start recording</Button>
                )}
                {recording && (
                  <Button onClick={stopRecording} variant="destructive" size="lg">
                    <Square className="w-5 h-5 mr-2" /> Stop ({String(mins).padStart(2,"0")}:{String(secs).padStart(2,"0")})
                  </Button>
                )}
                {recordedBlob && !recording && (
                  <Button onClick={resetRecording} variant="outline"><RotateCcw className="w-4 h-4 mr-2" /> Re-record</Button>
                )}
                {recording && <span className="flex items-center gap-2 text-sm text-destructive"><span className="w-2 h-2 rounded-full bg-destructive animate-pulse" /> Recording…</span>}
              </div>

              {recordedUrl && (
                <div className="border border-border rounded-md p-4 bg-card">
                  <div className="text-xs text-muted-foreground mb-2">Preview your recording:</div>
                  <audio controls src={recordedUrl} className="w-full" />
                </div>
              )}

              <div className="flex justify-between mt-6 pt-6 border-t border-border">
                <Button variant="ghost" onClick={() => setStep("listening")}>Back</Button>
                <Button variant="gold" onClick={() => setStep("review")} disabled={!recordedBlob}>Next: Review</Button>
              </div>
            </div>
          )}

          {step === "review" && (
            <div>
              <div className="text-xs uppercase tracking-wider text-accent font-semibold mb-2">Final review</div>
              <h2 className="font-serif text-2xl font-bold text-primary mb-4">Review and submit</h2>

              <div className="space-y-4 mb-6">
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Listening response</div>
                  <div className="bg-secondary/40 border border-border rounded-md p-3 text-sm whitespace-pre-wrap">{listeningResponse}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground mb-1">Reading recording</div>
                  {recordedUrl ? <audio controls src={recordedUrl} className="w-full" /> : <div className="text-sm text-destructive">No recording — please go back.</div>}
                </div>
              </div>

              <div className="bg-gold/10 border border-gold/40 rounded-md p-4 text-sm mb-6">
                Once submitted, your responses will be reviewed by a TOEFL Academic examiner. You'll be notified on your dashboard, and your official certificate will become available to download once approved.
              </div>

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep("reading")}>Back</Button>
                <Button variant="gold" onClick={submit} disabled={submitting}>{submitting ? "Submitting..." : "Submit for review"}</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
