import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { metadata as confirmMetadata } from './(site)/subscription/confirm/page';
import { metadata as subscriptionMetadata } from './(site)/subscription/page';
import { metadata as generatingMetadata } from './generating/page';

const here = fileURLToPath(new URL('.', import.meta.url));
const src = join(here, '..', '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('advertising tags', () => {
  it('are rendered by the landing, the documents and the empty form, and nowhere else', () => {
    const rendering = files(join(src, 'app'))
      .filter((path) => !path.endsWith('.test.ts'))
      .filter((path) => /<Marketing\b/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(here, path))
      .sort();
    expect(rendering).toEqual(
      ['(site)/legal/[doc]/page.tsx', '(site)/page.tsx', '(site)/start/page.tsx'].sort(),
    );
  });

  it('never see birth data: the form leaves its page by a full load', () => {
    const form = readFileSync(join(src, 'components', 'BirthForm.tsx'), 'utf8');
    expect(form).toContain('window.location.assign(');
    expect(form).not.toMatch(/router\.(push|replace)\(/);
    const subscribe = readFileSync(join(here, '(site)', 'subscribe', 'page.tsx'), 'utf8');
    expect(subscribe).toContain('/start?p=horoscope');
  });
});

describe('pages behind a token', () => {
  it('send no referrer and are never indexed', () => {
    for (const metadata of [generatingMetadata, subscriptionMetadata, confirmMetadata]) {
      expect(metadata.referrer).toBe('no-referrer');
      expect(metadata.robots).toEqual({ index: false, follow: false });
    }
  });
});
