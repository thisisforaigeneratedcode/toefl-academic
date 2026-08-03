-- "Collect payment" admin tool: push an M-Pesa STK prompt to any phone
-- number with no booking or customer account required. Ported from the
-- lexinon project's equivalent feature.

CREATE TABLE public.direct_payments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pretium_reference  UUID        NOT NULL UNIQUE,   -- the reference sent to /kes/collect
  phone              TEXT        NOT NULL,          -- normalized 07XXXXXXXX
  amount_kes         INTEGER     NOT NULL,
  note               TEXT,
  status             TEXT        NOT NULL DEFAULT 'pending', -- pending | completed | failed
  receipt_number     TEXT,
  created_by         UUID        REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ
);

CREATE INDEX idx_direct_payments_reference ON public.direct_payments(pretium_reference);

ALTER TABLE public.direct_payments ENABLE ROW LEVEL SECURITY;

-- Read-only for admins in the client; all writes go through admin-collect /
-- pretium-webhook using the service role, which bypasses RLS entirely.
CREATE POLICY "Admins view direct payments"
  ON public.direct_payments FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
