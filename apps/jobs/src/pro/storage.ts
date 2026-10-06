/** A seller's stored files, found by where they live rather than by the rows that point at them:
 * a reading's PDFs under `<order id>/`, the brand's pictures under `brand/<account id>/`. Listing
 * the prefix also finds a file whose row was never written or is already gone. */

import type { Env } from '../env';

/** The folder of one id; refuses an id that is empty or would reach past its own folder. */
function folder(base: string, id: string): string {
  if (!id || id.includes('/')) throw new Error('not an id');
  return `${base}${id}/`;
}

/** Deletes every object under `prefix` that `spare` does not keep, a page (at most a thousand keys,
 * R2's limit for one delete) at a time. Throws when storage does. */
async function deleteUnder(bucket: R2Bucket, prefix: string, spare?: (object: R2Object) => boolean): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    const keys = page.objects.filter((object) => !spare?.(object)).map((object) => object.key);
    if (keys.length > 0) await bucket.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

/** Every file of a reading: its PDF, and any stale one left behind. */
export const dropReadingFiles = (env: Env, orderId: string): Promise<void> => deleteUnder(env.DOCS, folder('', orderId));

/** Every brand picture of an account. */
export const dropBrandFiles = (env: Env, accountId: string): Promise<void> =>
  deleteUnder(env.DOCS, folder('brand/', accountId));

/** The pictures of one kind stored before `before`: the one just replaced, and any an earlier upload
 * stored without getting its row. A picture stored since is another upload's, which keeps or
 * removes it itself. */
export const dropOlderPictures = (env: Env, accountId: string, kind: 'logo' | 'photo', before: Date): Promise<void> =>
  deleteUnder(env.DOCS, `${folder('brand/', accountId)}${kind}-`, (object) => object.uploaded >= before);
