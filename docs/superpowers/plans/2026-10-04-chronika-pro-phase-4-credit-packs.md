# Chronika Pro — Phase 4: Credit Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seller buys a credit pack through Stripe Checkout. The paid webhook credits it exactly once. A refund made in the Stripe dashboard takes those credits back. B2C payments are unchanged.

**Architecture:**
- A `pro_purchases` table records each pack bought, from `pending` to `paid` (or `failed` / `refunded`).
- `src/pro/purchases.ts` owns the pack catalogue and the purchase lifecycle. `src/stripe.ts` gains `createPackCheckout` next to the existing B2C `createCheckoutSession`.
- The existing `/v1/stripe/webhook` routes pack events (`metadata.kind = 'pro_pack'`) to the pro side before the B2C order logic, and handles `charge.refunded` for packs.
- Credits go through the Phase 1 ledger:
  - a purchase is `grant(reason 'purchase', ref <purchase id>)`;
  - a refund is `grant(reason 'adjust', delta −credits, ref 'refund:<purchase id>')`.

  Both are idempotent per ref.

**Tech Stack:** Cloudflare Workers, D1, TypeScript strict, Vitest via `@cloudflare/vitest-plugin` (Miniflare `outboundService` fakes Stripe's API).

**Spec:** `docs/chronika-pro/SPEC.md` → *Money*: packs 10/€99, 30/€249, 100/€690, EUR, Stripe Tax, optional VAT ID, credits never expire, money back only within 14 days and only if no credit of the pack was spent.

## Decisions made for this phase (controller; owner delegated)

- **Pack catalogue in code:** `p10` = 10 credits / 9900, `p30` = 30 / 24900, `p100` = 100 / 69000, all EUR minor units. Prices go inline into Checkout, as B2C does, so nothing needs syncing in Stripe's catalogue.
- **Checkout:**
  - mode `payment`, `customer_email` = the seller's email;
  - `tax_id_collection[enabled]=true` (optional VAT ID), and `automatic_tax[enabled]` when `STRIPE_TAX === '1'`;
  - `locale: 'ru'`, ToS consent required, with this text: «Кредиты зачисляются сразу после оплаты и не сгорают. Деньги можно вернуть в течение 14 дней, если ни один кредит пакета не потрачен.»;
  - metadata `{ kind: 'pro_pack', purchase_id, account_id, pack }`, idempotency key `pack-<purchase id>`;
  - success URL `${PRO_SITE_URL}/credits?purchase=<id>`, cancel URL `${PRO_SITE_URL}/credits`.
- **No Stripe key** (`STRIPE_SECRET_KEY` unset): `POST /v1/pro/purchases` answers 503 `{ error: 'payments unavailable' }`. Unlike B2C, there are no free test purchases: free credits come only through `adjust` or invites.
- **Refunds are made by the owner in the Stripe dashboard.**
  - Eligibility (≤ 14 days, no credit of the pack spent) is shown, not enforced. `GET /v1/pro/purchases` returns `refundable` = paid ≤ 14 days ago AND current balance ≥ the pack's credits. Phase 6 admin shows the same.
  - `charge.refunded` with `refunded: true` (full refund) for a pack's payment intent marks the purchase `refunded` and books −credits once. The balance may go negative; spending is then refused until it is positive again. A partial refund is ignored, apart from a log line.
- **Webhook events the owner must enable** in Stripe for the endpoint: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` (already used by B2C), plus `charge.refunded`.

## Global Constraints

- B2C checkout and webhook behaviour are unchanged. A B2C event never reaches pro code: it has no `metadata.kind = 'pro_pack'`, and its `charge.refunded` matches no purchase.
- Credits never expire. A pack is credited **at most once** per purchase, however often Stripe redelivers.
- No Stripe SDK; follow `src/stripe.ts` (form-encoded fetch, manual signature check).
- Secrets only from worker secrets. Tests use fixed fake values bound in `vitest.config.ts`.
- Plain SQL, ISO-8601 timestamps, `crypto.randomUUID()` ids, TEXT + CHECK enums.
- `corepack pnpm --filter @natalka/jobs test` and `corepack pnpm --filter @natalka/jobs exec tsc --noEmit` green before every commit.
- Commit messages are English outcome sentences ending with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never stage `.devcontainer/docker-compose.yml`, `.gitignore` or `apps/jobs/.wrangler/`. Never run remote wrangler commands.

## Review Focus

1. **Stripe delivers `checkout.session.completed` twice, or both `completed` and `async_payment_succeeded`.** Expected: credits granted once. → Task 3 test.
2. **A forged or stale webhook.** Expected: 400, nothing granted. This is the existing `verifyWebhook`, re-asserted for packs. → Task 3 test.
3. **A seller tries to buy a pack for another account**, for example by posting someone else's id. Expected: impossible. The account comes only from the session, and the webhook trusts only `purchase_id` from signed metadata, cross-checked against the row's account. → Task 2 and Task 3 tests.
4. **A refund webhook for a B2C order.** Expected: B2C untouched, no ledger entry. → Task 3 test.
5. **The paid amount differs from the pack price** (a tampered session cannot happen with inline prices, but check it). Expected: the purchase is marked `paid` only if `amount_total` equals the stored amount before tax; otherwise it is logged and marked `failed`. → Task 3 test.

Stripe Tax adds tax on top of `amount_subtotal`. Compare against `amount_subtotal`, not `amount_total`.

---

### Task 1: Migration `0011_pro_purchases.sql` and the purchase module

**Files:**
- Create: `apps/jobs/migrations/0011_pro_purchases.sql`, `apps/jobs/src/pro/purchases.ts`
- Test: `apps/jobs/test/purchases.test.ts`

**Interfaces:**
- Migration:

```sql
-- Chronika Pro, phase 4: credit packs bought through Stripe.
--
-- A purchase is written before the seller is sent to Stripe and settled by the webhook. The ledger
-- entry it produces carries the purchase id as its ref, so a webhook delivered twice books once.

CREATE TABLE pro_purchases (
  id                    TEXT PRIMARY KEY,
  account_id            TEXT NOT NULL REFERENCES pro_accounts(id),
  pack                  TEXT NOT NULL CHECK (pack IN ('p10','p30','p100')),
  credits               INTEGER NOT NULL CHECK (credits > 0),
  amount_minor          INTEGER NOT NULL CHECK (amount_minor > 0),
  currency              TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','paid','failed','refunded')),
  stripe_session_id     TEXT,
  stripe_payment_intent TEXT,
  created_at            TEXT NOT NULL,
  paid_at               TEXT,
  refunded_at           TEXT
);
CREATE INDEX pro_purchases_account ON pro_purchases (account_id, created_at);
CREATE UNIQUE INDEX pro_purchases_session ON pro_purchases (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX pro_purchases_intent ON pro_purchases (stripe_payment_intent) WHERE stripe_payment_intent IS NOT NULL;
```

- `purchases.ts` exports:
  - `PACKS: Record<PackId, { credits: number; amount_minor: number; currency: 'EUR' }>` and `type PackId = 'p10' | 'p30' | 'p100'`
  - `isPack(value: unknown): value is PackId`
  - `REFUND_DAYS = 14`
  - `createPurchase(db, accountId, pack): Promise<PurchaseRow>`: inserts `pending`.
  - `attachSession(db, purchaseId, sessionId): Promise<void>`
  - `markPaid(db, { purchaseId, accountId, paymentIntent, amountSubtotal, currency }): Promise<'paid' | 'already' | 'mismatch' | 'unknown'>`.
    - Conditional `UPDATE … SET status='paid', paid_at, stripe_payment_intent WHERE id=? AND account_id=? AND status='pending'`.
    - Before that, `mismatch` when the amount or currency (case-insensitive) differs, which also sets `status='failed'`.
    - `already` when the row is no longer `pending`, `unknown` when there is no such row for that account.
    - On `paid`, it grants: `grant(db, { accountId, delta: credits, reason: 'purchase', ref: purchaseId })`. Run the UPDATE and the grant together; use `env.DB.batch` with a ledger insert statement built the same way `grant` does. If you add a statement builder to `credits.ts` for that, keep `grant` using it.
  - `markFailed(db, purchaseId, accountId)`: `pending → failed` only.
  - `markRefunded(db, paymentIntent): Promise<'refunded' | 'already' | 'unknown'>`. Matches by `stripe_payment_intent` with `status='paid'`. Sets `refunded`/`refunded_at` and books `{ reason: 'adjust', delta: -credits, ref: 'refund:<id>' }` in one batch.
  - `listPurchases(db, accountId): Promise<PurchaseView[]>`, newest first, where `PurchaseView = { id, pack, credits, amount_minor, currency, status, created_at, paid_at, refundable }`. `refundable` = `status==='paid'` && `paid_at` within `REFUND_DAYS` && current balance ≥ `credits`.

  `grant()` currently refuses negative deltas except for `adjust`. The refund uses `adjust`, so that rule is satisfied.

- [ ] **Step 1: Failing tests** (`test/purchases.test.ts`):
  - `createPurchase` inserts a pending row with the catalogue values.
  - `markPaid` with the right amount gives `paid` and the balance rises by the pack's credits. A second call gives `already` and the balance is unchanged.
  - `markPaid` with the wrong `amountSubtotal` gives `mismatch`, the status is `failed` and no credits are granted.
  - `markPaid` with another account's id gives `unknown` and nothing is granted.
  - `markRefunded` gives `refunded` and the balance drops by the credits. A second call gives `already`. An unknown intent gives `unknown`.
  - `listPurchases`: `refundable` is true right after paying; false once the balance is below the credits (spend one); false when `paid_at` is older than 14 days (UPDATE it in the test).

  Use `signIn` from `test/env.ts` for accounts and `balance`/`spend` from `credits.ts`.
- [ ] **Step 2: RED → implement → GREEN; full suite; tsc. Commit** with the subject "Record the credit packs a seller buys, and credit each one once".

---

### Task 2: Pack checkout and the purchase routes

**Files:**
- Modify: `apps/jobs/src/stripe.ts` (add `createPackCheckout`), `apps/jobs/src/pro/routes.ts`, `apps/jobs/vitest.config.ts`, `apps/jobs/test/fakes.ts`
- Test: `apps/jobs/test/purchase-routes.test.ts`

**Interfaces:**
- `createPackCheckout(env, { purchaseId, accountId, email, pack, credits, amountMinor, currency }): Promise<CheckoutSession>`, with the fields from *Decisions*. Product name: `Chronika Pro · ${credits} кредитов`. That is the seller's own receipt, so our name is fine there; it never reaches the seller's clients.
- Routes (session and `x-pro-key` as usual):
  - `POST /v1/pro/purchases {pack}`:
    - no key → 503 `{error:'payments unavailable'}`; bad pack → 400 `{error:'pack'}`;
    - otherwise `createPurchase`, then `createPackCheckout`, then `attachSession`, then 201 `{ id, checkout_url }`;
    - if Stripe fails, `markFailed` and 502 `{error:'checkout'}`.
  - `GET /v1/pro/purchases` → `{ purchases: PurchaseView[] }`.
- Test harness:
  - In `vitest.config.ts` miniflare, add `outboundService: fakeOutbound` (exported from `test/fakes.ts`). It answers `POST https://api.stripe.com/v1/checkout/sessions` with `{ id: 'cs_test_<random>', url: 'https://checkout.stripe.test/<id>' }` and records the last form body so tests can inspect it. Expose that through the existing `/__last` mechanism with the key `stripe|checkout`, read via `lastRequest`. Pass anything else through as a 404.
  - Bind `STRIPE_SECRET_KEY: 'sk_test_fake'` and `STRIPE_WEBHOOK_SECRET: 'whsec_test_fake'` in `vitest.config.ts`.
  - Check that no existing test relies on the key being absent: `createOrder` (B2C) treats a missing key as a test order. Grep `test/` for `/v1/orders`. If any test posts orders, keep its behaviour by sending `x-test-order` with `TEST_ORDER_KEY` (bind a fake one) and say so.
  - If the installed plugin does not accept `outboundService`, read its README and use its documented way to intercept outbound `fetch`. If none works, report BLOCKED.

- [ ] **Step 1: Failing tests:**
  - `POST /v1/pro/purchases {pack:'p30'}` → 201 with `checkout_url`. The row is pending with `stripe_session_id`. The recorded Stripe form has:
    - `line_items[0][price_data][unit_amount]=24900` and `currency=eur`;
    - `metadata[kind]=pro_pack` and `metadata[purchase_id]=<id>`;
    - `tax_id_collection[enabled]=true` and `customer_email=<seller email>`.
  - A bad pack → 400.
  - `GET /v1/pro/purchases` lists it as pending.
  - Another seller's `GET` does not list it.
  - The 503 path: call `handlePro` directly with `Object.assign(Object.create(testEnv), { STRIPE_SECRET_KEY: undefined })`.
- [ ] **Step 2: RED → implement → GREEN; full suite; tsc. Commit** with the subject "Send a seller to Stripe for a credit pack".

---

### Task 3: The webhook credits packs and takes refunds back

**Files:**
- Modify: `apps/jobs/src/index.ts` (`stripeWebhook`), `apps/jobs/src/stripe.ts` (`StripeEvent` type gains `amount_subtotal?`, `refunded?`, `amount_refunded?`)
- Test: `apps/jobs/test/purchase-webhook.test.ts`

**Interfaces / behaviour**, at the top of `stripeWebhook` after verification:
- **`checkout.session.completed` / `async_payment_succeeded` with `metadata.kind === 'pro_pack'`:**
  - if `payment_status !== 'paid'`, return `{received:true}`;
  - else `markPaid(... amountSubtotal: session.amount_subtotal, currency: session.currency, accountId: metadata.account_id, purchaseId: metadata.purchase_id, paymentIntent: session.payment_intent)`;
  - return `{ received: true, pack: <result> }`. **Never fall through to the B2C order code.**
- **`checkout.session.async_payment_failed` with `kind === 'pro_pack'`:** `markFailed`, then return.
- **`charge.refunded`:**
  - if the object has `refunded === true` and a `payment_intent`, `markRefunded(payment_intent)` and return `{received:true, refund:<result>}`;
  - if `refunded` is false (partial), log it and return `{received:true, ignored:'partial refund'}`.

  B2C orders have no purchase row, so `unknown` falls through harmlessly to the existing "ignored" answer.

- [ ] **Step 1: Failing tests** (`test/purchase-webhook.test.ts`). Build signed events with a helper:

```ts
async function signed(event: unknown): Promise<Request> {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_test_fake'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://jobs.test/v1/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: payload });
}
```

  Cases:
  - **Completed, delivered twice, then `async_payment_succeeded` for the same session.** Balance +30 once; status `paid`.
  - **Bad signature.** 400 and nothing changes.
  - **`amount_subtotal` ≠ 24900.** Not credited; status `failed`.
  - **Metadata `account_id` of another seller.** `unknown`; nothing credited.
  - **Full refund for the purchase's payment intent.** Balance −30, status `refunded`; delivered twice → once.
  - **Partial refund.** Ignored.
  - **Refund for an unrelated intent** (a B2C one). Answered 200, no ledger change.
  - **A B2C `checkout.session.completed`** with `metadata.order_id` and no `kind`, for a seeded B2C order with status `pending`: still marks the order paid as before. Use `seedOrder` and set its status to `'pending'` and `stripe_session_id`.

  Send each via `SELF.fetch(await signed(event))`.
- [ ] **Step 2: RED → implement → GREEN; full suite; tsc. Commit** with the subject "Credit a paid pack once, and take the credits back when it is refunded".

---

### Task 4: Spec and operations

**Files:** `docs/chronika-pro/SPEC.md`

- [ ] Under *Money*, add:
  - The no-key behaviour: no free purchases.
  - Refunds are made by the owner in the Stripe dashboard; the system marks the purchase refunded and takes the credits back. `refundable` is advisory, not enforced. The balance can go negative.
- [ ] Under *Operations*, add a Phase 4 paragraph:
  - apply migration `0011_pro_purchases.sql` (a production write) before deploying the jobs worker;
  - in the Stripe dashboard, add `charge.refunded` to the webhook endpoint's events;
  - Stripe Tax must be active for `STRIPE_TAX=1`;
  - packs are priced in EUR inline.
- [ ] Commit with the subject "Write down how credit packs are bought and refunded".

## Self-review notes

- **Spec coverage:**
  - Packs and prices: Task 1.
  - EUR, Stripe Tax and VAT ID: Task 2.
  - Credits never expire: there is no expiry anywhere.
  - Webhook crediting: Task 3.
  - Refund window: shown in Task 1, owner-driven in Task 3.
- **B2C unchanged:** pack events return before the order code, and `charge.refunded` only touches purchases. A test in Task 3 pins the B2C path.
