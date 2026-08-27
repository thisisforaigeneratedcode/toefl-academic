-- apicosts was the one table in the original schema migration that never
-- got RLS enabled or any policy written — every other table (user_roles,
-- profiles, questions, bookings, exam_attempts, certificates,
-- support_messages) explicitly does this, apicosts just never did.
--
-- Consequence: pretium-webhook writes to apicosts using the service-role
-- client, which bypasses RLS entirely, so every real payment is genuinely
-- recorded. But Admin.tsx reads apicosts directly from the browser as the
-- logged-in admin (not through an edge function), and with no grant/policy
-- ever established for `authenticated`, that read comes back empty. Admin.tsx
-- then does `const costs = ac.data || []` without checking ac.error, so the
-- failed read silently becomes "no deposits" — money that's real, on Pretium,
-- and correctly logged in this table, but invisible in the admin panel with
-- no error surfaced anywhere.
ALTER TABLE public.apicosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage apicosts"
  ON public.apicosts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
