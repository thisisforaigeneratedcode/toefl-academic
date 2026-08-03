# Pretium (M-Pesa) Payments — Integration Guide

A portable, platform-agnostic guide for wiring **Pretium** (M-Pesa collections & disbursements via `api.xwift.africa`) into a new project — e.g. a fresh **Lovable + Supabase** app. It documents the exact money model, fees, database ledger, admin views, and — most importantly — how to keep **your** money separate from everyone else's in a **shared Pretium account**.

> This is distilled from a production integration. Level/exam wording has been generalized to **order / product**. Wherever you see `orders`, map it to your own purchasable entity.

---

## 0. TL;DR — the golden rules

1. **Never trust Pretium's account balance as "your money."** A Pretium account can host multiple projects; the funds sitting there are the *sum of all projects*. **You must maintain your own ledger** and compute "what I can withdraw" from **your database only**.
2. **Every transaction gets a unique `reference` (UUID) that you generate.** Pretium echoes it back in the webhook as `transaction_code`. That reference is your join key.
3. **Two independent fee events:** a **collection fee** when money comes *in* (~2%), and a **tiered disbursement fee** when money goes *out* (flat KES amount by band). Model both.
4. **The webhook is the source of truth for "paid," not the API response.** The `/kes/collect` 200 only means "STK push sent," not "paid."
5. **Split every successful deposit into fixed buckets in your ledger** (business revenue, platform cut, provider fee) so reporting and payouts are unambiguous.

---

## 1. What Pretium is

Pretium (API host `https://api.xwift.africa`) is an aggregator that provides:

- **Collections** (`POST /kes/collect`) — triggers an **M-Pesa STK push** to a customer's phone; they approve on their handset.
- **Disbursements** (`POST /kes/disburse`) — sends money **out** to an M-Pesa number (B2C).
- **Webhooks** — POSTs transaction results back to a callback URL you provide.

Auth is via an `x-api-key` header. Amounts are integer **KES**.

---

## 2. ⚠️ The multi-project separation problem (read this twice)

A single Pretium account/API key can be used by **several unrelated projects**. Consequences:

- The **Pretium dashboard balance is NOT your project's balance.** It includes other projects' collections.
- If you ever call a "get balance" endpoint and pay out against it, **you may spend another project's money** (or over-withdraw yours).

### The rule: your database is the ledger, Pretium is just the rails

You compute **"available to withdraw"** entirely from **your own records**:

```
available_to_withdraw =  Σ(your successful deposits, net of fees & cuts)
                       − Σ(your completed withdrawals)
```

Never from Pretium's balance. To make this reliable:

- **Namespace every `reference`** so it's obvious which project a transaction belongs to (e.g. prefix `MYAPP-` or embed the project id). Pretium mixes all projects together; your prefix is how you filter *your* rows if you ever reconcile against a Pretium export.
- **Record a ledger row for every deposit and every withdrawal** in your DB, keyed by that reference.
- Treat the Pretium account as a shared float you are *allowed to draw from up to your own tracked balance* — not as a wallet you own.

> If two projects share one key, each project's `available_to_withdraw` from its own ledger must always be ≤ the shared Pretium balance. Your ledger is what stops you from withdrawing beyond your share.

---

## 3. Environment variables / secrets

Set these as server-side secrets (Supabase Edge Function secrets, never in client code):

| Secret | Purpose |
|---|---|
| `PRETIUM_API_KEY` | `x-api-key` for all Pretium calls |
| `PRETIUM_WEBHOOK_SECRET` | random string; appended to callback URL as `?token=` and checked on every webhook |
| `SUPABASE_URL` | your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | privileged DB writes inside Edge Functions |
| `SUPABASE_ANON_KEY` | to verify the *caller's* JWT before acting |
| `PLATFORM_FEE_PHONE` | M-Pesa number that receives owner payouts (auto-settle) |
| `PARTNER_FEE_PHONE` | (optional) second payout number if you split with a partner |
| `PRETIUM_TEST_AMOUNT` | (optional) if set, overrides the charged amount for sandbox testing |

Client-side (safe to expose): `PROJECT_URL`, `ANON_KEY` only.

---

## 4. The money model & fees

Every successful **deposit of `amount` KES** is decomposed the same way. Two fee events exist; do not conflate them.

### 4.1 Collection fee (money IN) — ~2%

Pretium's collection cost is modeled as **2% of the gross deposit**:

```ts
const pretium_fee_kes = Math.round(amount_kes * 0.02);   // provider takes this on the way in
const net_kes         = amount_kes - pretium_fee_kes;    // ~98%
```

> Confirm the exact live collection rate with Pretium for your account and adjust the `0.02`. Treat it as a single named constant.

### 4.2 Platform cut — 8% of NET

Your platform's own margin ("API earnings" / owner cut) is **8% of net** (i.e. after the collection fee):

```ts
const platform_cut_kes = Math.round(net_kes * 0.08);     // ≈ 7.84% of gross
```

### 4.3 The three buckets

Each deposit splits into exactly three parts that sum back to `amount_kes`:

| Bucket | Formula | ~Share of gross | Who it belongs to |
|---|---|---|---|
| **Provider fee** | `round(amount * 0.02)` | ~2% | Pretium (gone) |
| **Platform cut** | `round(net * 0.08)` | ~7.84% | You (the platform owner) |
| **Business revenue** | `amount − provider_fee − platform_cut` | ~90.16% | The business/merchant wallet |

Worked example, `amount = 1,000 KES`:

```
provider_fee     = round(1000 * 0.02)      = 20
net              = 1000 - 20               = 980
platform_cut     = round(980 * 0.08)       = 78
business_revenue = 1000 - 20 - 78          = 902
```

> **Owner vs partner:** in the reference implementation the platform cut is assigned **100% to the owner** (`owner_earnings = platform_cut`, `partner_earnings = 0`). A 60/40 owner/partner split was *documented in a comment but never implemented*. **Decide explicitly** for your project:
> - Owner takes all 8% → `owner_earnings = platform_cut; partner_earnings = 0`
> - Split 60/40 → `owner_earnings = round(platform_cut*0.6); partner_earnings = round(platform_cut*0.4)`
> Make the code and the comment agree.

### 4.4 Disbursement fee (money OUT) — flat, TIERED

Withdrawals cost a **flat KES fee determined by a band**, not a percentage. This is the exact production table:

```ts
// [upper_bound_inclusive, flat_fee]
export const PRETIUM_DISBURSE_TIERS: [number, number][] = [
  [100, 1], [500, 8], [1000, 12], [1500, 20], [2500, 22],
  [3500, 25], [5000, 27], [7500, 30], [10000, 35], [15000, 37],
  [20000, 40], [25000, 43], [30000, 45], [35000, 50], [40000, 60],
  [45000, 70], [50000, 80], [70000, 100],
];

export function pretiumDisburseFee(amount: number): number {
  return PRETIUM_DISBURSE_TIERS.find(([cap]) => amount <= cap)?.[1] ?? 150;
}
```

So the recipient nets `amount − pretiumDisburseFee(amount)`. e.g. withdrawing 5,000 → fee 27 → they receive 4,973. Above 70,000 → flat 150.

> Verify this table against your live Pretium pricing; it can change. Keep it in one shared module used by **both** the withdrawal function and any UI that previews the fee.

---

## 5. Database schema (the ledger)

Three tables. `orders` is your purchasable thing; `apicosts` is the **ledger** (the important one); `site_settings` is key/value config.

### 5.1 `orders` (the thing being paid for)

Minimum payment-relevant columns:

```sql
CREATE TABLE public.orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- your product fields (level, plan, sku, quantity, ...)
  amount_kes     INTEGER,                    -- price at time of order
  payment_id     TEXT,                       -- the UUID reference you send to Pretium
  payment_status TEXT NOT NULL DEFAULT 'unpaid', -- unpaid | pending | completed | failed
  phone          TEXT,                       -- normalized 07XXXXXXXX
  mpesa_receipt  TEXT,                        -- Pretium receipt_number on success
  paid_at        TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'pending', -- your fulfilment status
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`payment_status` lifecycle: `unpaid → pending` (STK push sent) `→ completed` (webhook COMPLETE) or `→ failed` (webhook FAILED, resettable to retry).

### 5.2 `apicosts` — THE LEDGER (deposits, withdrawals, settlements)

This single table records every money movement and the bucket split. Do not skip any column — several are `NOT NULL`.

```sql
CREATE TABLE public.apicosts (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                       TEXT NOT NULL,   -- 'deposit' | 'withdrawal' | 'settlement'
  order_id                   UUID REFERENCES public.orders(id),
  user_id                    UUID REFERENCES auth.users(id),
  payment_id                 TEXT NOT NULL,   -- the Pretium reference (UNIQUE join key)
  transaction_amount_kes     INTEGER NOT NULL,-- gross for deposits; amount for withdrawals
  pretium_fee_kes            INTEGER NOT NULL,-- 2% (deposit) or tiered flat (withdrawal)
  api_earnings_kes           INTEGER NOT NULL DEFAULT 0, -- the platform cut (8% of net)
  combined_fee_kes           INTEGER NOT NULL,-- pretium_fee + api_earnings (deposit)
  -- Owner slice of the platform cut
  owner_earnings_kes         INTEGER NOT NULL DEFAULT 0,
  owner_withdrawn            BOOLEAN NOT NULL DEFAULT false,
  owner_withdrawn_at         TIMESTAMPTZ,
  owner_withdrawal_receipt   TEXT,
  -- Partner slice (0 if you don't split)
  partner_earnings_kes       INTEGER NOT NULL DEFAULT 0,
  partner_withdrawn          BOOLEAN NOT NULL DEFAULT false,
  partner_withdrawn_at       TIMESTAMPTZ,
  partner_withdrawal_receipt TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_apicosts_payment_id ON public.apicosts(payment_id); -- idempotency
```

Row types:
- **`deposit`** — inserted by the webhook on a successful collection. Holds the full bucket split.
- **`withdrawal`** — inserted when the **business wallet** (the ~90%) is paid out. `transaction_amount_kes` = amount withdrawn; `api_earnings_kes = 0`.
- **`settlement`** — inserted on a **partial** payout of the **platform cut** (the 8%). Marks that slice settled.

> **No RLS** on `apicosts` — it is written/read exclusively by Edge Functions using the service role. Never expose it to the client with the anon key.

### 5.3 `site_settings` (config)

```sql
CREATE TABLE public.site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Seed rows you'll use:

```sql
INSERT INTO public.site_settings (key, value) VALUES
  ('api_owner_user_id',  '<the-owner-admin-user-uuid>'),  -- who may withdraw the platform cut
  ('auto_settle_enabled','false');                         -- webhook auto-payout toggle
```

---

## 6. Flow A — Deposit (collect / STK push)

**Edge Function `initiate-payment`** (called by an authenticated client):

1. Verify the caller's JWT (anon-key client + `getUser()`); reject if not the order owner.
2. Load the order with the **service role**; reject if already `pending`/`completed`.
3. **Normalize the phone** to `07XXXXXXXX`:

```ts
function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("254") && d.length === 12) return "0" + d.slice(3);
  if (!d.startsWith("0") && d.length === 9)  return "0" + d;
  if (d.startsWith("0")  && d.length === 10) return d;
  return null;
}
```

4. **Generate your reference** and mark the order pending *before* calling Pretium:

```ts
const payment_id = crypto.randomUUID();               // your reference (namespace it if sharing a key)
await admin.from("orders").update({
  payment_id, payment_status: "pending", phone: shortcode,
}).eq("id", order_id);
```

5. **Call collect:**

```ts
const res = await fetch("https://api.xwift.africa/kes/collect", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": PRETIUM_API_KEY },
  body: JSON.stringify({
    amount: amount_kes,
    shortcode,                       // the customer's phone
    mobile_network: "Safaricom",
    reference: payment_id,           // <-- echoed back as transaction_code in the webhook
    callback_url: `${SUPABASE_URL}/functions/v1/pretium-webhook?token=${WEBHOOK_SECRET}`,
    description: "Order payment",
  }),
});
```

6. On non-OK / network error, **roll the order back** to `unpaid` and clear `payment_id`. On OK, return "STK push sent — approve on your phone." **Do not mark paid here.**

---

## 7. Flow B — Webhook (the source of truth)

**Edge Function `pretium-webhook`** — deploy with JWT verification **off** (Pretium can't send a Supabase JWT); you authenticate it yourself:

1. **Auth:** require `?token=` to equal `PRETIUM_WEBHOOK_SECRET`; 401 otherwise. Optionally soft-check the source IP (log, don't hard-block, as provider IPs change).
2. **Parse** `{ status, transaction_code, receipt_number, message, is_released }`.
3. **Ignore disbursement-release pings:** `if (is_released !== undefined) return ok;` and `if (!transaction_code) return ok;`
4. **Find the order by your reference:** `orders.payment_id === transaction_code`. If none, or if it's not `pending`, return `ok` (idempotent no-op — this is how you dedupe repeated webhooks).
5. **On `status === "COMPLETE"`:** compute the buckets (§4) and, **in one transaction/batch:**
   - update the order → `payment_status: completed`, `status: confirmed`, `mpesa_receipt`, `paid_at`
   - **insert the `deposit` ledger row** with all buckets:

```ts
await db.from("apicosts").insert({
  type: "deposit",
  order_id: order.id,
  payment_id: transaction_code,             // idempotency via UNIQUE index
  transaction_amount_kes: amount_kes,
  pretium_fee_kes,                          // 2%
  api_earnings_kes: platform_cut_kes,       // 8% of net
  owner_earnings_kes: platform_cut_kes,     // owner takes all (or split — see §4.3)
  partner_earnings_kes: 0,
  combined_fee_kes: pretium_fee_kes + platform_cut_kes,
});
```

   - then run **auto-settle** (§9) if enabled, and send confirmation emails.
6. **On `status === "FAILED"`:** set order `payment_status: failed`, `status: pending` (so the user can retry), notify the user. **Insert no ledger row.**
7. Always return `200 {ok:true}` so Pretium stops retrying handled events.

> **Idempotency:** the `pending`-guard + the `UNIQUE(payment_id)` index together guarantee a duplicate webhook can't double-credit the ledger.

---

## 8. Flow C — Withdrawals (two separate wallets)

There are **two distinct pots**, withdrawn by different people through different functions. Keep them separate.

### 8.1 Business wallet (~90%) — admin only

**Edge Function `pretium-balance`** (`action: "withdraw"`), admin-role-gated:

- **Available = computed from the ledger, never from Pretium:**

```ts
const deposits    = rows.filter(r => r.type === "deposit");
const withdrawals = rows.filter(r => r.type === "withdrawal");
const deposited_net   = deposits.reduce((s,r) =>
    s + r.transaction_amount_kes - r.pretium_fee_kes - r.api_earnings_kes, 0);   // the ~90%
const withdrawn_total = withdrawals.reduce((s,r) => s + r.transaction_amount_kes, 0);
const available_to_withdraw = Math.max(0, deposited_net - withdrawn_total);
```

- Insert a `withdrawal` ledger row **first** (reference = new UUID), then call `/kes/disburse`. If the disburse fails, **delete that row** (compensating rollback).
- Recipient nets `amount − pretiumDisburseFee(amount)`.

```ts
await fetch("https://api.xwift.africa/kes/disburse", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": PRETIUM_API_KEY },
  body: JSON.stringify({
    amount: disburse_amount,          // what leaves the float
    shortcode: PHONE,                 // destination M-Pesa number
    mobile_network: "Safaricom",
    type: "MOBILE",
    reference: withdrawal_reference,
    description: "Revenue withdrawal",
  }),
});
```

### 8.2 Platform cut (the 8%) — owner only

**Edge Function `withdraw-api-costs`** (`target: "owner" | "partner"`), gated on `site_settings.api_owner_user_id === caller`:

- **Available (owner):**

```ts
const gross   = deposits.filter(r => !r.owner_withdrawn)
                        .reduce((s,r) => s + r.owner_earnings_kes, 0);
const settled = settlements.reduce((s,r) => s + r.owner_earnings_kes, 0);
const total   = Math.max(0, gross - settled);
```

- **Full payout:** UPDATE all unwithdrawn deposit rows → `owner_withdrawn = true` (+ timestamp + receipt).
- **Partial payout:** INSERT a `settlement` row for the amount. **This row must satisfy every `NOT NULL` column** — include `payment_id` (a UUID) and `combined_fee_kes`, or the insert throws:

```ts
await db.from("apicosts").insert({
  type: "settlement",
  payment_id: withdrawal_reference,   // REQUIRED (NOT NULL)
  transaction_amount_kes: requestedAmount,
  pretium_fee_kes: pretium_fee,
  combined_fee_kes: pretium_fee,      // REQUIRED (NOT NULL)
  api_earnings_kes: 0,
  owner_earnings_kes: requestedAmount,
  owner_withdrawn: true,
  owner_withdrawn_at: new Date().toISOString(),
  owner_withdrawal_receipt: withdrawal_reference,
});
```

> **Why two functions?** The 90% business revenue and the 8% platform cut are disjoint slices of the same deposits. The business-wallet math *excludes* `api_earnings_kes`, so the owner's 8% is never double-counted. Because they use different `type`s (`withdrawal` vs `settlement`/`owner_withdrawn`), neither wallet sees the other's payouts. Keep this invariant.

---

## 9. Auto-settle (optional)

Inside the webhook, after recording a successful deposit, optionally sweep accumulated cut to the payout phone(s) when a threshold is crossed:

```ts
const SETTLE_THRESHOLD = 5000;                  // KES
// gated by site_settings.auto_settle_enabled === "true" AND a configured phone
// sums unwithdrawn owner (or partner) earnings; if >= threshold, disburse and mark withdrawn
```

If disabled, the cut simply accumulates until the owner withdraws manually via §8.2. **Auto-settle marks rows `owner_withdrawn` with no human action** — so "settled" in reports can mean "auto-swept," not "someone clicked withdraw." Document this to avoid the "who withdrew?" confusion.

---

## 10. What the admin sees (cost separation)

The admin dashboard reads **only** the ledger and presents **three separated views**:

| View | Source | Meaning |
|---|---|---|
| **Business wallet (available)** | `Σ deposit net(90%) − Σ withdrawals` | Cash the merchant can pull now |
| **Platform earnings (pending)** | `Σ owner_earnings(unwithdrawn) − Σ settlements` | The 8% cut not yet paid out |
| **Provider fees (informational)** | `Σ pretium_fee_kes` | What Pretium took (2% in + tiered out) |

Plus a **Transactions** list straight from `apicosts` (each row shows gross, fee, cut, net, and settled/pending). Per-transaction the admin sees:
`gross in · provider fee −X · net · cut (8%) · earnings +Y · settled/pending`.

> **Common pitfall to avoid:** don't hardcode a headline balance to `0`. Compute each figure from the ledger. (A prior bug displayed platform pending as a literal `0`, making it look like there were no earnings while the transactions list clearly showed real deposits.)

---

## 11. (If you also add cards) — parallel provider

If you add a card provider (e.g. Paystack) alongside Pretium, keep it in the **same `apicosts` ledger** but distinguish it:

- Tag card rows by a `payment_id` prefix (e.g. `TA-…`) so you can filter `mpesa` vs `card`.
- Card fee ≈ **1.5%** (vs 2% M-Pesa); same **8%-of-net** platform cut.
- Card funds may have a **hold window** (e.g. 48 business hours) before "available" — model a `release_time` in the UI, don't auto-settle card cuts.

---

## 12. Security checklist

- [ ] All Pretium calls happen **server-side** (Edge Functions); the API key never reaches the client.
- [ ] `initiate-payment` / `withdraw-*` verify the **caller's JWT** and **authorization** (owner/admin) before acting.
- [ ] Withdrawal functions re-check role **server-side** (don't trust a client "isAdmin").
- [ ] Webhook validates `?token=` against `PRETIUM_WEBHOOK_SECRET`; deployed with platform JWT check **off**.
- [ ] `apicosts` has **no RLS / no anon grants**; service-role only.
- [ ] `UNIQUE(payment_id)` enforces webhook idempotency.
- [ ] Withdrawals insert-then-disburse with **compensating delete** on provider failure.

---

## 13. New-project integration checklist (Lovable + Supabase)

1. **Create tables** `orders`, `apicosts`, `site_settings` (§5). Add the `UNIQUE(payment_id)` index. Disable RLS on `apicosts`.
2. **Seed** `site_settings`: `api_owner_user_id`, `auto_settle_enabled`.
3. **Add secrets** (§3) to Supabase Edge Function config.
4. **Create a shared module** with the fee constants: collection rate (`0.02`), platform cut (`0.08`), and `PRETIUM_DISBURSE_TIERS` + `pretiumDisburseFee()`.
5. **Deploy 4 Edge Functions:** `initiate-payment`, `pretium-webhook` (JWT off), `pretium-balance` (business withdraw), `withdraw-api-costs` (cut withdraw). Reuse the flows above.
6. **Namespace your `reference`** if the Pretium key is shared with other projects.
7. **Register the webhook URL** with `?token=` in every collect/disburse call.
8. **Build the client:** a pay button → `initiate-payment` → "approve STK on your phone" → poll the order's `payment_status` (or subscribe to realtime) until `completed`.
9. **Admin views** compute the three separated figures from the ledger only (§10) — **never** from Pretium's balance.
10. **Test** with `PRETIUM_TEST_AMOUNT` before going live; verify a duplicate webhook doesn't double-credit.

---

## 14. Optional feature — Admin "Collect payment" (charge any phone, no order)

A standalone admin tool: push an M-Pesa STK prompt to **any phone number**, with no order and no customer account required — useful for walk-ins, phone orders, or anything off the normal checkout flow. It plugs into the same ledger from §5.2, so a collected prompt counts toward the withdrawable balance exactly like a real order payment.

### 14.1 New table `direct_payments`

```sql
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

-- Read-only for admins in the client; all writes go through the edge
-- functions below using the service role, which bypasses RLS entirely.
ALTER TABLE public.direct_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view direct payments" ON public.direct_payments
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
```

### 14.2 Edge function `admin-collect`

Same admin-role gate as §8, same collect call as §6 — the only difference is there's no order row, just a `direct_payments` row created *before* the call so the webhook can always resolve it:

```ts
// after verifying JWT + admin role (see §12 checklist)
const reference = crypto.randomUUID();
await admin.from("direct_payments").insert({
  pretium_reference: reference, phone: shortcode, amount_kes, note: note || null, created_by: user.id,
});

const res = await fetch(`${PRETIUM_API_URL}/kes/collect`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": PRETIUM_API_KEY },
  body: JSON.stringify({
    amount: amount_kes, shortcode, mobile_network: "Safaricom", reference,
    callback_url: `${SUPABASE_URL}/functions/v1/pretium-webhook?token=${WEBHOOK_SECRET}`,
    description: note || "Direct payment",
  }),
});
// non-OK / network error → mark direct_payments row 'failed', same rollback pattern as §6
```

### 14.3 Webhook: recognize a third reference type

The webhook (§7) already resolves `transaction_code` against orders, then withdrawals. Add a third fallback — if neither matches, check `direct_payments`, and on `COMPLETE` run **the exact same fee split as §4** into the same `apicosts` ledger, with `order_id: null`:

```ts
if (!order) return handleDirectPayment(db, transaction_code, status, receipt_number);
// ...
async function handleDirectPayment(db, transaction_code, status, receipt_number) {
  const { data: direct } = await db.from("direct_payments")
    .select("id, status, amount_kes").eq("pretium_reference", transaction_code).maybeSingle();
  if (!direct || direct.status !== "pending") return json({ ok: true }); // idempotent no-op

  if (status === "FAILED") {
    await db.from("direct_payments").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", direct.id);
    return json({ ok: true });
  }

  const amount_kes = direct.amount_kes ?? 0;
  const pretium_fee_kes = Math.round(amount_kes * 0.02);
  const net_kes = amount_kes - pretium_fee_kes;
  const api_earnings_kes = Math.round(net_kes * 0.08);   // same platform cut as §4.2

  await db.from("apicosts").insert({
    type: "deposit", order_id: null, payment_id: transaction_code,
    transaction_amount_kes: amount_kes, pretium_fee_kes, api_earnings_kes,
    owner_earnings_kes: api_earnings_kes, partner_earnings_kes: 0,
    combined_fee_kes: pretium_fee_kes + api_earnings_kes,
  });
  await db.from("direct_payments").update({
    status: "completed", receipt_number: receipt_number ?? null, completed_at: new Date().toISOString(),
  }).eq("id", direct.id);
  return json({ ok: true });
}
```

**Idempotency note:** `apicosts.payment_id` in this ledger design has no `UNIQUE` constraint (only §5.2's design adds one) — the `direct.status !== "pending"` guard is what prevents a duplicate webhook delivery from double-crediting. If you added `UNIQUE(payment_id)` per §5.2, you get a second, DB-level guarantee on top; either is sufficient, both together is best.

### 14.4 Admin UI

A simple form (phone, amount, optional note) → "Send payment prompt", plus a polling history table reading `direct_payments` directly (admin RLS makes this safe client-side — no edge function needed just to list history).

---

## 15. Deploy flags — when to use `--no-verify-jwt`

Every Supabase Edge Function sits behind a **platform-level check**: "does this request carry a valid Supabase-issued JWT?" `--no-verify-jwt` turns that check off. Whether a given function needs it depends entirely on **who calls it**:

| Function type | Caller | Has a real Supabase JWT? | Flag |
|---|---|---|---|
| Client-invoked (`initiate-payment`, `admin-collect`, `withdraw-*`) | Browser via `supabase.functions.invoke()` | **Yes** — the signed-in user's session JWT is attached automatically | Leave verification **ON** (default — no flag) |
| Provider callback (`pretium-webhook`) | Pretium's servers | **No** — Pretium has no Supabase account; it only knows the `?token=` secret you gave it | `--no-verify-jwt` **required**, otherwise every legitimate webhook call gets rejected before your code runs |

**Do not reach for `--no-verify-jwt` out of convenience.** For any function called by a logged-in user, turning platform verification off means *all* auth enforcement now depends on your own function code being bug-free — you lose a free layer of defense-in-depth for no benefit, since the caller already has a valid JWT anyway. Reserve the flag strictly for functions whose caller structurally cannot present a Supabase JWT (webhooks, other server-to-server callbacks), and give those functions their own explicit authentication (a shared-secret token check, signature verification, etc.) in its place.

Note that platform JWT verification (authentication — *is this a real logged-in user?*) is a different layer from an in-function role check (authorization — *is this user allowed to do this?*, e.g. the `user_roles` admin lookup in §8 and §14.2). Client-invoked money-moving functions need **both**.

---

## Appendix — Pretium API quick reference

| Purpose | Method / Path | Key body fields | Auth |
|---|---|---|---|
| Collect (STK push in) | `POST https://api.xwift.africa/kes/collect` | `amount, shortcode, mobile_network, reference, callback_url, description` | `x-api-key` |
| Disburse (pay out) | `POST https://api.xwift.africa/kes/disburse` | `amount, shortcode, mobile_network, type:"MOBILE", reference, description` | `x-api-key` |
| Webhook (they call you) | `POST <your-fn>?token=SECRET` | receives `{ status, transaction_code, receipt_number, message, is_released }` | your token |

- `status`: `COMPLETE` | `FAILED`.
- `transaction_code` == the `reference` **you** sent → your ledger join key.
- `receipt_number` → store as the M-Pesa receipt on success.
- `is_released` present → a disbursement lifecycle ping; acknowledge and ignore for accounting.

> Always confirm current endpoints, field names, and live fee rates against Pretium's own docs for your account — treat the fee constants here as *starting values wired into one place*, not gospel.
