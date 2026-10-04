'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { creditsLabel } from '@/lib/pro/credits';
import { CREDIT_COST, orderLabel, PRODUCT_LABEL, PRODUCTS, type Product } from '@/lib/pro/readings';
import { sendJson, signInAgain, TRY_LATER } from './post';

export interface OrderClient {
  id: string;
  name: string;
  initial: string;
  line: string;
}

const REFUSED: Record<string, string> = {
  client: 'Выберите клиента.',
  partner: 'Для синастрии выберите партнёра: другого клиента.',
  product: 'Выберите, что подготовить.',
};

type Problem = { kind: 'credits' } | { kind: 'text'; text: string };

/** The order: a client, a product (a synastry also needs a partner), what it costs and what is
 * left after. The button holds still while the order is on its way, so a double tap orders once. */
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
      setProblem({ kind: 'text', text: REFUSED.partner as string });
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
      const text = (data?.error && REFUSED[data.error]) || data?.error || TRY_LATER;
      return setProblem({ kind: 'text', text });
    }
    setProblem({ kind: 'text', text: TRY_LATER });
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="order-client">Клиент</label>
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
        <legend className="label">Что подготовить</legend>
        <div className="products">
          {PRODUCTS.map((p) => (
            <button
              key={p.product}
              type="button"
              className={`prod${p.product === 'bundle' ? ' wide' : ''}`}
              aria-pressed={product === p.product}
              onClick={() => setProduct(p.product)}
            >
              <b>{PRODUCT_LABEL[p.product]}</b>
              <span>
                {creditsLabel(CREDIT_COST[p.product])}
                {p.note ? ` · ${p.note}` : ''}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      {needsPartner ? (
        <div className="field">
          <label htmlFor="order-partner">Партнёр</label>
          {partners.length > 0 ? (
            <select
              id="order-partner"
              className="input select"
              value={partnerId}
              onChange={(event) => setPartnerId(event.target.value)}
            >
              <option value="">Выберите клиента</option>
              {partners.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="muted">
              Для синастрии нужен второй клиент. <Link href="/clients/new">Добавить клиента</Link>
            </p>
          )}
        </div>
      ) : null}
      <div className="card">
        <div className="row">
          <span className="grow muted">{left >= 0 ? 'После заказа останется' : 'Не хватает'}</span>
          <span className="num strong">{creditsLabel(Math.abs(left))}</span>
        </div>
        <span className="muted">
          Пишется 10–15 минут. Можно закрыть страницу, отчёт появится в списке.
        </span>
      </div>
      {left >= 0 ? (
        <button className="btn" type="submit" disabled={sending}>
          {sending ? 'Заказываем…' : orderLabel(cost)}
        </button>
      ) : (
        <Link href="/credits" className="btn">
          Пополнить кредиты
        </Link>
      )}
      {problem?.kind === 'credits' ? (
        <p className="field-error" role="alert">
          Недостаточно кредитов. <Link href="/credits">Пополнить</Link>
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
