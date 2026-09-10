-- Turns the Costs-page Bookings tab into a payment-recovery tool: the owner
-- can see why a payment failed and email the candidate to chase it.

-- Persist the payment failure reason (Pretium's message), previously only
-- console.log'd and lost.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

-- Log of every recovery email sent, so the owner can see what's already
-- been said before following up again.
CREATE TABLE IF NOT EXISTS public.booking_outreach (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID        NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sent_by     UUID        REFERENCES auth.users(id),
  subject     TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_outreach_booking ON public.booking_outreach(booking_id);

-- Written and read only by the owner-transactions edge function (service
-- role). RLS on with no policies = no client can touch it directly.
ALTER TABLE public.booking_outreach ENABLE ROW LEVEL SECURITY;
