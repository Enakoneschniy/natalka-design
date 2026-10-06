import { fetchDocument } from '@/lib/jobs';

/** Streams the finished PDF through our origin so the jobs Worker address stays private. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let upstream: Response;
  try {
    upstream = await fetchDocument(token);
  } catch (error) {
    console.error('document failed', error instanceof Error ? error.message : String(error));
    return new Response('unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  if (!upstream.ok) {
    // A link is opened by hand: the status says enough, and nothing from upstream is shown.
    const status = upstream.status === 404 || upstream.status === 410 ? upstream.status : 502;
    return new Response(status === 410 ? 'gone' : 'not ready', {
      status,
      headers: { 'cache-control': 'no-store' },
    });
  }
  return new Response(upstream.body, {
    headers: {
      'content-type': 'application/pdf',
      // The jobs worker names the file after the person and the birth; pass that through.
      'content-disposition':
        upstream.headers.get('content-disposition') ?? 'inline; filename="chronika.pdf"',
      'cache-control': 'private, no-store',
      // A signed link is not a secret worth indexing.
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
