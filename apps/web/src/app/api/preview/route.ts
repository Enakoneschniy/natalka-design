import { type NextRequest, NextResponse } from 'next/server';
import { fetchPreview } from '@/lib/jobs';
import { previewConfigured, previewPayload, verifyPreview } from '@/lib/preview';
import { notSameOrigin, readJson, relayFailure, unavailable } from '@/lib/route';

/** A synastry's two charts are the largest facts the page signs, at a few dozen kilobytes. */
const MAX_PREVIEW_BYTES = 64 * 1024;

/** The free preview passages for a chart the preview page drew. The request must carry the
 * page's signature of exactly what it asks about; the jobs worker gets those fields and nothing
 * else, and the browser gets the passages back and nothing else. */
export async function POST(request: NextRequest) {
  const refused = notSameOrigin(request);
  if (refused) return refused;
  if (!previewConfigured()) {
    return unavailable('preview failed', new Error('PREVIEW_KEY is not configured'));
  }
  const read = await readJson(request, MAX_PREVIEW_BYTES);
  if (!read.ok) return read.response;
  const payload = previewPayload(read.value);
  if (!(await verifyPreview(payload, read.value.sig))) {
    return NextResponse.json({ error: 'signature' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetchPreview(payload);
  } catch (error) {
    return unavailable('preview failed', error);
  }
  if (!upstream.ok) return relayFailure('preview refused', { status: upstream.status });
  const data = (await upstream.json().catch(() => null)) as { blocks?: unknown } | null;
  const blocks = Array.isArray(data?.blocks)
    ? data.blocks.filter(
        (block): block is { title: string; text: string } =>
          typeof block?.title === 'string' && typeof block?.text === 'string',
      )
    : [];
  if (blocks.length === 0) return unavailable('preview failed', new Error('no passages'));
  return NextResponse.json(
    { blocks: blocks.map(({ title, text }) => ({ title, text })) },
    { headers: { 'cache-control': 'private, max-age=600' } },
  );
}
