import { useEffect, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Award, Clock3 } from "lucide-react";

export default function Results() {
  const { id } = useParams();
  const { user, loading } = useAuth();
  const [attempt, setAttempt] = useState<any>(null);
  const [cert, setCert] = useState<any>(null);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      const { data: a } = await supabase.from("exam_attempts").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
      setAttempt(a);
      if (a) {
        const { data: c } = await supabase.from("certificates").select("*").eq("attempt_id", a.id).maybeSingle();
        setCert(c);
      }
    })();
  }, [user, id]);

  if (loading) return <Layout><div className="container py-20 text-center">Loading...</div></Layout>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!attempt) return <Layout><div className="container py-20 text-center">Loading results...</div></Layout>;

  const status = attempt.approval_status as "pending" | "approved" | "rejected";
  const pending = status === "pending" && attempt.status === "submitted";
  const approved = status === "approved";
  const rejected = status === "rejected";

  return (
    <Layout>
      <div className="container mx-auto py-12 max-w-2xl">
        <Card className="p-8 text-center shadow-elegant">
          {approved && <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-4" />}
          {pending && <Clock3 className="w-16 h-16 text-accent mx-auto mb-4" />}
          {rejected && <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />}

          <h1 className="font-serif text-4xl font-bold text-primary mb-2">
            {approved ? "Congratulations!" : pending ? "Submission received" : "Result"}
          </h1>
          <p className="text-muted-foreground mb-6">
            {approved && "Your responses have been reviewed and approved by an examiner. Your certificate is ready."}
            {pending && "Thank you. A TOEFL Academic examiner is reviewing your responses. You'll see your certificate here as soon as it's approved — usually within 24 hours."}
            {rejected && "After review, your responses did not meet the level requirements. You can book a new attempt at any time."}
          </p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="border border-border rounded-md p-4">
              <div className="text-xs uppercase text-muted-foreground">Level</div>
              <div className="font-serif text-2xl font-bold text-primary">{attempt.level}</div>
            </div>
            <div className="border border-border rounded-md p-4">
              <div className="text-xs uppercase text-muted-foreground">Status</div>
              <div className="font-serif text-lg font-bold text-accent capitalize">{status}</div>
            </div>
          </div>

          {attempt.listening_response && (
            <div className="text-left mb-4">
              <div className="text-xs uppercase text-muted-foreground mb-1">Your listening response</div>
              <div className="bg-secondary/40 border border-border rounded-md p-3 text-sm whitespace-pre-wrap">{attempt.listening_response}</div>
            </div>
          )}

          {attempt.admin_notes && (
            <div className="text-left mb-6">
              <div className="text-xs uppercase text-muted-foreground mb-1">Examiner's note</div>
              <div className="bg-secondary/40 border border-border rounded-md p-3 text-sm whitespace-pre-wrap">{attempt.admin_notes}</div>
            </div>
          )}

          {cert && approved && (
            <div className="bg-gradient-subtle border border-gold rounded-lg p-5 mb-6">
              <Award className="w-10 h-10 text-gold mx-auto mb-2" />
              <div className="font-serif text-lg font-bold text-primary">Certificate issued</div>
              <Badge className="mt-1">{cert.band}</Badge>
              <div className="font-mono text-sm text-muted-foreground mt-2">{cert.certificate_number}</div>
              <Button asChild variant="gold" className="mt-4"><Link to={`/certificate/${cert.certificate_number}`}>View & download certificate</Link></Button>
            </div>
          )}

          <Button asChild variant="outline"><Link to="/dashboard">Back to dashboard</Link></Button>
        </Card>
      </div>
    </Layout>
  );
}
