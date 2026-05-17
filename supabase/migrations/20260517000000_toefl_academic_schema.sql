-- =============================================================
-- TOEFL Academic — Consolidated Schema Migration
-- Generated: 2026-05-17
-- Consolidates all 11 incremental migrations from source project
-- Run this single file on a fresh Supabase project
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. ENUM TYPES
-- ─────────────────────────────────────────────────────────────
CREATE TYPE public.app_role      AS ENUM ('admin', 'user');
CREATE TYPE public.test_level    AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
CREATE TYPE public.booking_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled');
CREATE TYPE public.exam_status   AS ENUM ('not_started', 'in_progress', 'submitted', 'graded');

-- ─────────────────────────────────────────────────────────────
-- 2. TABLE: user_roles
-- (defined before has_role so the function body resolves at call time)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.user_roles (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       app_role    NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 3. HELPER FUNCTION: has_role()
-- Resolved at call time — user_roles must exist first
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS policies for user_roles (use has_role now that both exist)
CREATE POLICY "Users view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ─────────────────────────────────────────────────────────────
-- 4. TABLE: profiles + trigger + RLS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  country       TEXT,
  date_of_birth DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile + assign 'user' role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 5. TABLE: questions + index + RLS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level          test_level NOT NULL,
  section        TEXT       NOT NULL CHECK (section IN ('reading', 'grammar', 'vocabulary', 'listening')),
  prompt         TEXT       NOT NULL,
  passage        TEXT,
  audio_url      TEXT,
  option_a       TEXT       NOT NULL,
  option_b       TEXT       NOT NULL,
  option_c       TEXT       NOT NULL,
  option_d       TEXT       NOT NULL,
  correct_option CHAR(1)    NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_questions_level_section ON public.questions(level, section);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage questions"
  ON public.questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read questions"
  ON public.questions FOR SELECT TO authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────
-- 6. TABLE: bookings — final schema (all payment columns)
--    + index + RLS + realtime
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.bookings (
  id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level          test_level     NOT NULL,
  scheduled_at   TIMESTAMPTZ    NOT NULL,
  status         booking_status NOT NULL DEFAULT 'confirmed',
  notes          TEXT,
  -- Payment fields
  payment_id     TEXT,
  payment_status TEXT           NOT NULL DEFAULT 'unpaid',
  amount_kes     INTEGER,
  phone          TEXT,
  mpesa_receipt  TEXT,
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_payment_id ON public.bookings(payment_id);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own bookings"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage bookings"
  ON public.bookings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Realtime
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;

-- ─────────────────────────────────────────────────────────────
-- 7. TABLE: exam_attempts — final schema
--    (includes all listening/reading/approval columns)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.exam_attempts (
  id                    UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID       NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id            UUID       REFERENCES public.bookings(id) ON DELETE SET NULL,
  level                 test_level NOT NULL,
  status                exam_status NOT NULL DEFAULT 'not_started',
  -- Legacy MCQ fields (kept for schema compatibility)
  question_ids          UUID[]     NOT NULL DEFAULT '{}'::uuid[],
  answers               JSONB      NOT NULL DEFAULT '{}'::jsonb,
  writing_prompt        TEXT,
  writing_response      TEXT,
  mcq_score             INT,
  mcq_total             INT,
  writing_score         INT,
  final_band            TEXT,
  -- Listening section
  listening_prompt_text TEXT,
  listening_response    TEXT,
  -- Reading section
  reading_passage       TEXT,
  reading_audio_url     TEXT,
  -- Admin approval
  approval_status       TEXT       NOT NULL DEFAULT 'pending',
  admin_notes           TEXT,
  admin_band            TEXT,
  approved_by           UUID,
  approved_at           TIMESTAMPTZ,
  -- Timestamps
  started_at            TIMESTAMPTZ,
  submitted_at          TIMESTAMPTZ,
  graded_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own attempts"
  ON public.exam_attempts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own attempts"
  ON public.exam_attempts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own attempts"
  ON public.exam_attempts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status IN ('not_started', 'in_progress'));

CREATE POLICY "Admins manage attempts"
  ON public.exam_attempts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ─────────────────────────────────────────────────────────────
-- 8. TABLE: certificates — final schema (all pct columns)
--    + index + RLS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.certificates (
  id                 UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_number TEXT       NOT NULL UNIQUE,
  user_id            UUID       NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_id         UUID       NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  candidate_name     TEXT       NOT NULL,
  level              test_level NOT NULL,
  band               TEXT       NOT NULL,
  score              INT,       -- nullable; admin-graded flow doesn't set this
  total              INT,       -- nullable
  -- Per-skill percentages
  listening_pct      INTEGER,
  reading_pct        INTEGER,
  speaking_pct       INTEGER,
  writing_pct        INTEGER,
  overall_pct        INTEGER,
  -- Validity
  issued_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until        DATE        NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '2 years'),
  revoked            BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_cert_number ON public.certificates(certificate_number);

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- Public: anyone (anon + authenticated) can look up certificates
CREATE POLICY "Public verification"
  ON public.certificates FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins manage certificates"
  ON public.certificates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ─────────────────────────────────────────────────────────────
-- 9. TABLE: apicosts — final schema
--    (api_earnings_kes — NOT platform_fee_kes)
--    (includes all owner/partner split columns)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.apicosts (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type                       TEXT        NOT NULL,  -- 'deposit' | 'withdrawal' | 'settlement'
  booking_id                 UUID        REFERENCES public.bookings(id),
  user_id                    UUID        REFERENCES auth.users(id),
  payment_id                 TEXT        NOT NULL,
  transaction_amount_kes     INTEGER     NOT NULL,
  pretium_fee_kes            INTEGER     NOT NULL,
  api_earnings_kes           INTEGER     NOT NULL DEFAULT 0,
  combined_fee_kes           INTEGER     NOT NULL,
  -- Owner earnings (60% of api_earnings)
  owner_earnings_kes         INTEGER     NOT NULL DEFAULT 0,
  owner_withdrawn            BOOLEAN     NOT NULL DEFAULT false,
  owner_withdrawn_at         TIMESTAMPTZ,
  owner_withdrawal_receipt   TEXT,
  -- Partner earnings (40% of api_earnings)
  partner_earnings_kes       INTEGER     NOT NULL DEFAULT 0,
  partner_withdrawn          BOOLEAN     NOT NULL DEFAULT false,
  partner_withdrawn_at       TIMESTAMPTZ,
  partner_withdrawal_receipt TEXT,
  -- Legacy single-target withdrawal tracking (retained for compatibility)
  withdrawn                  BOOLEAN     NOT NULL DEFAULT false,
  withdrawn_at               TIMESTAMPTZ,
  withdrawal_receipt         TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_apicosts_payment_id ON public.apicosts(payment_id);
CREATE INDEX idx_apicosts_withdrawn  ON public.apicosts(withdrawn);

-- No RLS — accessed exclusively via service role in edge functions

-- ─────────────────────────────────────────────────────────────
-- 10. TABLE: site_settings
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.site_settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- After running this migration, insert manually:
--   INSERT INTO public.site_settings (key, value) VALUES ('api_owner_user_id', '<your-admin-user-uuid>');
--   INSERT INTO public.site_settings (key, value) VALUES ('auto_settle_enabled', 'true');

-- ─────────────────────────────────────────────────────────────
-- 11. TABLE: support_messages + index + RLS + realtime
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.support_messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL,
  sender_id     UUID        NOT NULL,
  sender_role   TEXT        NOT NULL CHECK (sender_role IN ('user', 'admin')),
  body          TEXT        NOT NULL,
  read_by_user  BOOLEAN     NOT NULL DEFAULT false,
  read_by_admin BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_messages_user_id ON public.support_messages(user_id, created_at);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own messages"
  ON public.support_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users send own messages"
  ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND auth.uid() = sender_id AND sender_role = 'user');

CREATE POLICY "Users update own thread read flags"
  ON public.support_messages FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage all messages"
  ON public.support_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.support_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;

-- ─────────────────────────────────────────────────────────────
-- 12. STORAGE: exam-recordings bucket + policies
-- ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('exam-recordings', 'exam-recordings', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users upload own recordings" ON storage.objects;
CREATE POLICY "Users upload own recordings"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'exam-recordings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users read own recordings" ON storage.objects;
CREATE POLICY "Users read own recordings"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'exam-recordings'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins manage recordings" ON storage.objects;
CREATE POLICY "Admins manage recordings"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'exam-recordings'
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    bucket_id = 'exam-recordings'
    AND public.has_role(auth.uid(), 'admin')
  );

-- =============================================================
-- END OF MIGRATION
-- =============================================================
-- POST-MIGRATION MANUAL STEPS (run after migration + first admin signup):
--
-- 1. Set the API earnings owner (replace with real admin user UUID):
--    INSERT INTO public.site_settings (key, value)
--    VALUES ('api_owner_user_id', 'YOUR-ADMIN-USER-UUID');
--
-- 2. Enable auto-settlement:
--    INSERT INTO public.site_settings (key, value)
--    VALUES ('auto_settle_enabled', 'true');
--
-- 3. Grant admin role to your first admin user:
--    INSERT INTO public.user_roles (user_id, role)
--    VALUES ('YOUR-ADMIN-USER-UUID', 'admin');
-- =============================================================
