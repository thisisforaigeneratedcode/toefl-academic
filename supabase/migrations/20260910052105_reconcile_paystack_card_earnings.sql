-- Paystack is retired. Card payments always settled straight to the bank
-- via Paystack's own payouts — the owner's 8% cut was reconciled manually
-- against that bank transfer, never withdrawn through this app. The three
-- historical card deposit rows (all real B1 exam payments) are therefore
-- already paid out; the ledger just never recorded it, so they kept
-- showing as "pending" on the Costs page.
--
-- Mark them settled so the pending figure reads 0, WITHOUT deleting the
-- rows — the revenue history and the Ledger tab stay intact.
UPDATE public.apicosts
SET owner_withdrawn        = true,
    owner_withdrawn_at     = COALESCE(owner_withdrawn_at, now()),
    owner_withdrawal_receipt = COALESCE(owner_withdrawal_receipt, 'paystack-bank-settlement'),
    partner_withdrawn      = true,
    partner_withdrawn_at   = COALESCE(partner_withdrawn_at, now()),
    partner_withdrawal_receipt = COALESCE(partner_withdrawal_receipt, 'paystack-bank-settlement')
WHERE type = 'deposit'
  AND payment_id LIKE 'TA-%'
  AND owner_withdrawn = false;
