import { type NextRequest, NextResponse } from 'next/server';
import { createSubscription, JobsNotConfigured, type SubscriptionRequest } from '@/lib/jobs';
import { unavailable } from '@/lib/route';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Starts a horoscope subscription: the chart is computed and the first horoscope written. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<SubscriptionRequest>;
  if (!body.email || !EMAIL.test(body.email) || !body.birth?.date || !body.birth?.zone) {
    return NextResponse.json({ error: 'email and birth data are required' }, { status: 400 });
  }
  if (body.cadence !== 'week' && body.cadence !== 'month') {
    return NextResponse.json({ error: 'cadence' }, { status: 400 });
  }
  try {
    const created = await createSubscription({
      email: body.email,
      locale: body.locale ?? 'ru',
      cadence: body.cadence,
      birth: body.birth as SubscriptionRequest['birth'],
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof JobsNotConfigured) return unavailable('subscription failed', error);
    console.error('subscription failed', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'could not subscribe' }, { status: 502 });
  }
}
