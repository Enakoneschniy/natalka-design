import { redirect } from 'next/navigation';
import { cache } from 'react';
import { me, type ProMe, ProUnauthorized } from './client';
import { readSession } from './session';

/** The signed-in seller, once per request, for the cabinet's layout and pages alike.
 *
 * No session: off to the sign-in page. A session the jobs worker no longer accepts: off to the
 * logout route, which clears the cookie (a server component cannot) and lands on sign-in. */
export const currentSeller = cache(async (): Promise<ProMe> => {
  const session = await readSession();
  if (!session) redirect('/login');
  let account: ProMe;
  try {
    account = await me(session);
  } catch (error) {
    if (error instanceof ProUnauthorized) redirect('/logout?expired=1');
    throw error;
  }
  return account;
});

/** True when the visitor holds a session the jobs worker still accepts: the sign-in and sign-up
 * pages send such a visitor straight to the cabinet. Any failure counts as signed out. */
export async function hasLiveSession(): Promise<boolean> {
  const session = await readSession();
  if (!session) return false;
  try {
    await me(session);
    return true;
  } catch {
    return false;
  }
}
