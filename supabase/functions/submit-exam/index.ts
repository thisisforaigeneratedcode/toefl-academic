import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: corsHeaders });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { attempt_id, listening_response, reading_audio_url } = await req.json();
    if (!attempt_id) {
      return new Response(JSON.stringify({ error: "Missing attempt_id" }), { status: 400, headers: corsHeaders });
    }
    if (!listening_response || typeof listening_response !== "string" || listening_response.trim().length < 3) {
      return new Response(JSON.stringify({ error: "You must type what you heard in the listening section before submitting." }), { status: 400, headers: corsHeaders });
    }
    if (!reading_audio_url || typeof reading_audio_url !== "string") {
      return new Response(JSON.stringify({ error: "You must record the reading section before submitting." }), { status: 400, headers: corsHeaders });
    }

    const { data: attempt } = await admin.from("exam_attempts").select("*").eq("id", attempt_id).eq("user_id", user.id).maybeSingle();
    if (!attempt) return new Response(JSON.stringify({ error: "Attempt not found" }), { status: 404, headers: corsHeaders });
    if (attempt.status !== "in_progress" && attempt.status !== "not_started") {
      return new Response(JSON.stringify({ error: "Already submitted" }), { status: 400, headers: corsHeaders });
    }

    await admin.from("exam_attempts").update({
      status: "submitted",
      approval_status: "pending",
      listening_response: listening_response ?? null,
      reading_audio_url: reading_audio_url ?? null,
      submitted_at: new Date().toISOString(),
    }).eq("id", attempt_id);

    if (attempt.booking_id) {
      await admin.from("bookings").update({ status: "completed" }).eq("id", attempt.booking_id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
