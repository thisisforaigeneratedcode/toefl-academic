import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 3;

const LISTENING_PROMPTS: Record<string, string[]> = {
  A1: [
    "My name is Sarah. I live in a small town near the river.",
    "I have one brother and two sisters. We all like to play football.",
    "Every morning I drink tea and eat bread with butter and honey.",
  ],
  A2: [
    "Last weekend we went to the beach. The weather was sunny and the water was warm.",
    "My friend Tom works in a bookshop. He starts at nine and finishes at six.",
    "I usually take the bus to school but today I walked because it was a beautiful day.",
  ],
  B1: [
    "If you want to learn English quickly, try to read short articles every day and write a few sentences about them.",
    "The new museum opens at ten in the morning and tickets cost fifteen pounds for adults and seven for students.",
    "Although it was raining heavily, we decided to continue our hike up the mountain to see the view from the top.",
  ],
  B2: [
    "Many companies are now allowing their staff to work from home several days a week, which has changed the way cities feel during weekday mornings.",
    "The author argues that reading fiction improves empathy because it forces readers to imagine the world through someone else's eyes.",
    "Despite the difficult conditions, the small team managed to complete the project on time and well within the original budget.",
  ],
  C1: [
    "The committee has unanimously concluded that the proposed reforms, while ambitious, will require considerable investment and a sustained effort over at least the next decade.",
    "Critics have suggested that the new policy, although well intentioned, may inadvertently disadvantage the very communities it was designed to support.",
  ],
  C2: [
    "Notwithstanding the considerable progress that has been made in recent years, a number of structural inequalities continue to undermine the fundamental promise of equal opportunity for all citizens.",
  ],
};

const READING_PASSAGES: Record<string, string[]> = {
  A1: [
    "Hello. My name is Anna. I am twelve years old. I live in a small house with my mother, my father and my dog. My dog is brown and very friendly. I go to school every day. I like English and music.",
  ],
  A2: [
    "On Saturdays I usually meet my friends in the park. We bring sandwiches and play football for two hours. After the game, we go to a small café near the bus stop and we drink hot chocolate. It is my favourite day of the week.",
  ],
  B1: [
    "Learning a new language takes time and patience. At first, you might feel embarrassed when you make mistakes, but mistakes are an important part of learning. The more you practise speaking, the more confident you become. Try to use new words every day, even if it feels strange at first.",
  ],
  B2: [
    "Cities around the world are facing a serious challenge: how to reduce traffic without harming the local economy. Some have introduced congestion charges, while others have built new cycle lanes and made public transport cheaper. The most successful solutions usually combine several different ideas rather than relying on a single measure.",
  ],
  C1: [
    "While the rapid development of artificial intelligence promises remarkable benefits, it also raises difficult ethical questions that society has barely begun to address. Decisions made by algorithms increasingly shape what we read, how we work, and even who is granted credit or insurance, often with very little transparency.",
  ],
  C2: [
    "The relentless pace of technological change has produced a peculiar paradox: never before have human beings had access to so much information, and yet seldom have we felt so overwhelmed by it. To navigate this landscape with clarity, one must cultivate not merely the ability to gather facts, but the deeper capacity to weigh, contextualise and ultimately disregard much of what one encounters.",
  ],
};

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

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

    const { booking_id, level } = await req.json();
    if (!booking_id || !level) return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: corsHeaders });

    const { data: booking } = await admin.from("bookings").select("*").eq("id", booking_id).eq("user_id", user.id).maybeSingle();
    if (!booking) return new Response(JSON.stringify({ error: "Booking not found" }), { status: 404, headers: corsHeaders });

    if (booking.payment_status !== "completed") {
      return new Response(JSON.stringify({ error: "Payment required before starting exam." }), { status: 402, headers: corsHeaders });
    }

    // Fetch all attempts for this booking, newest first
    const { data: existingAttempts } = await admin
      .from("exam_attempts")
      .select("*")
      .eq("booking_id", booking_id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const attempts = existingAttempts ?? [];
    const inProgress = attempts.find((a: any) => a.status === "in_progress" || a.status === "not_started");
    if (inProgress) {
      return new Response(JSON.stringify({ attempt_id: inProgress.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const latest = attempts[0];
    // Block if latest is awaiting review or already approved
    if (latest && (latest.approval_status === "pending" || latest.approval_status === "approved")) {
      return new Response(JSON.stringify({ attempt_id: latest.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (attempts.length >= MAX_ATTEMPTS) {
      return new Response(JSON.stringify({ error: `You have used all ${MAX_ATTEMPTS} attempts for this booking.` }), { status: 403, headers: corsHeaders });
    }

    const lvl = (LISTENING_PROMPTS[level] ? level : "B1") as keyof typeof LISTENING_PROMPTS;
    const listening = pick(LISTENING_PROMPTS[lvl]);
    const reading = pick(READING_PASSAGES[lvl]);

    const { data: attempt, error } = await admin.from("exam_attempts").insert({
      user_id: user.id,
      booking_id,
      level,
      status: "in_progress",
      question_ids: [],
      listening_prompt_text: listening,
      reading_passage: reading,
      started_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;

    return new Response(JSON.stringify({ attempt_id: attempt.id, attempt_number: attempts.length + 1, max_attempts: MAX_ATTEMPTS }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
