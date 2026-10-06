/** A seller's stored files, found by where they live rather than by the rows that point at them:
 * a reading's PDFs under `<order id>/`, the brand's pictures under `brand/<account id>/`. Listing
 * the folder also finds a file whose row was never written or is already gone. */

import type { Env } from '../env';
import { errorCode } from '../errors';

/** The folder of one id; refuses an id that is empty or would reach past its own folder. */
function folder(base: string, id: string): string {
  if (!id || id.includes('/')) throw new Error('not an id');
  return `${base}${id}/`;
}

/** Where a reading's PDFs live: the current one and any stale one left behind. */
export const readingFolder = (orderId: string): string => folder('', orderId);

/** Where a seller's brand pictures live. */
export const brandFolder = (accountId: string): string => folder('brand/', accountId);

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

/** Deletes rows for good together with the folders of files that belong to them. The files go
 * first, so that a failure leaves rows to delete again rather than files nothing points at; then
 * the rows, in one batch; then the folders are looked at once more, for a file stored while the
 * rows were going. */
export async function dropFilesThenRows(env: Env, folders: string[], rows: D1PreparedStatement[]): Promise<void> {
  for (const prefix of folders) await deleteUnder(env.DOCS, prefix);
  await env.DB.batch(rows);
  for (const prefix of folders) {
    try {
      await deleteUnder(env.DOCS, prefix);
    } catch (error) {
      console.error('files left in storage', prefix, errorCode(error));
    }
  }
}

/** The pictures of one kind stored before `before`: the one just replaced, and any an earlier upload
 * stored without getting its row. A picture stored since is another upload's, which keeps or
 * removes it itself. */
export const dropOlderPictures = (env: Env, accountId: string, kind: 'logo' | 'photo', before: Date): Promise<void> =>
  deleteUnder(env.DOCS, `${brandFolder(accountId)}${kind}-`, (object) => object.uploaded >= before);
