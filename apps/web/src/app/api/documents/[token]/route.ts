import { documentUrl } from '@/lib/jobs';

/** Streams the finished PDF through our origin so the jobs Worker address stays private. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const upstream = await fetch(documentUrl(token));
  if (!upstream.ok) {
    return new Response('not ready', { status: upstream.status });
  }
  return new Response(upstream.body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="chronika.pdf"',
      'cache-control': 'private, no-store',
    },
  });
}
