'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { creditsLabel } from '@/lib/pro/credits';
import { PRO_LANGS, type ProLang } from '@/lib/pro/lang';
import {
  CREDIT_COST,
  orderLabel,
  PRODUCTS,
  type Product,
  productLabel,
  productNote,
} from '@/lib/pro/readings';
import { useLang, useText } from './Lang';
import { sendJson, signInAgain } from './post';

export interface OrderClient {
  id: string;
  name: string;
  initial: string;
  line: string;
}

type Problem = { kind: 'credits' } | { kind: 'text'; text: string };

/** The order: a client, a product (a synastry also needs a partner), the language it is written
 * in (the cabinet's to begin with), what it costs and what is left after. The button holds still
 * while the order is on its way, so a double tap orders once. */
export function OrderForm({
  clients,
  balance,
  initialClient,
}: {
  clients: OrderClient[];
  balance: number;
  initialClient?: string;
}) {
  const router = useRouter();
  const cabinetLang = useLang();
  const t = useText();
  const [readingLang, setReadingLang] = useState<ProLang>(cabinetLang);
  const [clientId, setClientId] = useState(initialClient ?? clients[0]?.id ?? '');
  const [partnerId, setPartnerId] = useState('');
  const [product, setProduct] = useState<Product>('natal');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // State lands on the next render; two taps in one frame both see `sending` false.
  const inFlight = useRef(false);

  const cost = CREDIT_COST[product];
  const left = balance - cost;
  const client = clients.find((c) => c.id === clientId);
  const partners = clients.filter((c) => c.id !== clientId);
  const needsPartner = product === 'synastry';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (needsPartner && !partnerId) {
      setProblem({ kind: 'text', text: t.order.refused.partner as string });
      return;
    }
    inFlight.current = true;
    setSending(true);
    setProblem(null);
    const { status, data } = await sendJson<{ id?: string; error?: string }>(
      '/api/pro/x/readings',
      'POST',
      {
        product,
        lang: readingLang,
        client_id: clientId,
        ...(needsPartner ? { partner_client_id: partnerId } : {}),
      },
    );
    if (status === 201 && data?.id) {
      router.push(`/readings/${data.id}`);
      // The balance in the header is the layout's; it changes with this order.
      router.refresh();
      return;
    }
    inFlight.current = false;
    setSending(false);
    if (status === 401) return signInAgain();
    if (status === 402) return setProblem({ kind: 'credits' });
    if (status === 400) {
      const refused = data?.error && Object.hasOwn(t.order.refused, data.error);
      const text =
        (refused ? t.order.refused[data.error as string] : data?.error) || t.common.tryLater;
      return setProblem({ kind: 'text', text });
    }
    setProblem({ kind: 'text', text: t.common.tryLater });
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="order-client">{t.order.client}</label>
        <div className="item">
          <span className="av" aria-hidden="true">
            {client?.initial ?? '·'}
          </span>
          <span className="grow">
            <select
              id="order-client"
              className="input select"
              value={clientId}
              onChange={(event) => {
                setClientId(event.target.value);
                if (event.target.value === partnerId) setPartnerId('');
              }}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {client ? <span className="s num">{client.line}</span> : null}
          </span>
        </div>
      </div>
      <fieldset className="field">
        <legend className="label">{t.order.what}</legend>
        <div className="products">
          {PRODUCTS.map((p) => {
            const note = productNote(p, cabinetLang);
            return (
              <button
                key={p}
                type="button"
                className={`prod${p === 'bundle' ? ' wide' : ''}`}
                aria-pressed={product === p}
                onClick={() => setProduct(p)}
              >
                <b>{productLabel(p, cabinetLang)}</b>
                <span>
                  {creditsLabel(CREDIT_COST[p], cabinetLang)}
                  {note ? ` · ${note}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend className="label">{t.order.language}</legend>
        <div className="seg">
          {PRO_LANGS.map((option) => (
            <button
              key={option}
              type="button"
              lang={option}
              aria-pressed={readingLang === option}
              onClick={() => setReadingLang(option)}
            >
              {t.lang.name[option]}
            </button>
          ))}
        </div>
      </fieldset>
      {needsPartner ? (
        <div className="field">
          <label htmlFor="order-partner">{t.order.partner}</label>
          {partners.length > 0 ? (
            <select
              id="order-partner"
              className="input select"
              value={partnerId}
              onChange={(event) => setPartnerId(event.target.value)}
            >
              <option value="">{t.order.choosePartner}</option>
              {partners.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="muted">
              {t.order.partnerNeeded}
              <Link href="/clients/new">{t.common.addClient}</Link>
            </p>
          )}
        </div>
      ) : null}
      <div className="card">
        <div className="row">
          <span className="grow muted">{left >= 0 ? t.order.left : t.order.short}</span>
          <span className="num strong">{creditsLabel(Math.abs(left), cabinetLang)}</span>
        </div>
        <span className="muted">{t.order.timing}</span>
      </div>
      {left >= 0 ? (
        <button className="btn" type="submit" disabled={sending}>
          {sending ? t.order.submitting : orderLabel(cost, cabinetLang)}
        </button>
      ) : (
        <Link href="/credits" className="btn">
          {t.order.topUp}
        </Link>
      )}
      {problem?.kind === 'credits' ? (
        <p className="field-error" role="alert">
          {t.order.noCredits}
          <Link href="/credits">{t.order.topUpShort}</Link>
        </p>
      ) : null}
      {problem?.kind === 'text' ? (
        <p className="field-error" role="alert">
          {problem.text}
        </p>
      ) : null}
    </form>
  );
}
