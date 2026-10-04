import { describe, expect, it } from 'vitest';
import {
  applyRewrite,
  assembleError,
  CREDIT_COST,
  dockState,
  editLine,
  firstName,
  missingNote,
  needsPolling,
  orderLabel,
  PRODUCT_LABEL,
  pdfBuildFailed,
  progressLabel,
  type ReadingView,
  readingDate,
  readingPill,
  readingTitle,
  reportError,
  rewriteError,
  richParagraphs,
  roman,
  sectionsLabel,
} from './readings';

describe('PRODUCT_LABEL', () => {
  it('names every product in Russian', () => {
    expect(PRODUCT_LABEL).toEqual({
      natal: 'Натальная карта',
      forecast: 'Прогноз на год',
      synastry: 'Синастрия',
      child: 'Детская карта',
      bundle: 'Натал + прогноз',
    });
  });
});

describe('readingPill', () => {
  it('shows a reading being written', () => {
    expect(readingPill({ status: 'writing' })).toEqual({ label: 'пишется', tone: 'wr' });
  });

  it('shows a ready reading, and one whose PDF is ready', () => {
    expect(readingPill({ status: 'ready' })).toEqual({ label: 'готов', tone: 'gold' });
    expect(readingPill({ status: 'ready', missing: 0, pdf: 'none' })).toEqual({
      label: 'готов',
      tone: 'gold',
    });
    expect(readingPill({ status: 'ready', pdf: 'ready' })).toEqual({
      label: 'PDF готов',
      tone: 'ok',
    });
  });

  it('flags a section left unwritten before anything else about a ready reading', () => {
    expect(readingPill({ status: 'ready', missing: 2, pdf: 'ready' })).toEqual({
      label: 'раздел не дописан',
      tone: 'bad',
    });
  });

  it('says a failed reading was refunded', () => {
    expect(readingPill({ status: 'failed', missing: 3 })).toEqual({
      label: 'не удалось, кредиты вернулись',
      tone: 'bad',
    });
  });

  it("reads the list's own flags: a missing count and pdf_ready", () => {
    expect(readingPill({ status: 'ready', missing: 0, pdf_ready: true })).toEqual({
      label: 'PDF готов',
      tone: 'ok',
    });
    expect(readingPill({ status: 'ready', missing: 1, pdf_ready: true })).toEqual({
      label: 'раздел не дописан',
      tone: 'bad',
    });
    expect(readingPill({ status: 'ready', missing: 0, pdf_ready: false })).toEqual({
      label: 'готов',
      tone: 'gold',
    });
  });
});

describe('ordering', () => {
  it('costs one credit, two for the bundle', () => {
    expect(CREDIT_COST).toEqual({ natal: 1, forecast: 1, synastry: 1, child: 1, bundle: 2 });
  });

  it('agrees the credit word on the order button for 1, 2 and 5', () => {
    expect(orderLabel(1)).toBe('Заказать за 1 кредит');
    expect(orderLabel(2)).toBe('Заказать за 2 кредита');
    expect(orderLabel(5)).toBe('Заказать за 5 кредитов');
  });
});

const view = (over: Partial<ReadingView> = {}): ReadingView => ({
  id: 'r1',
  product: 'natal',
  client_id: 'c1',
  partner_client_id: null,
  status: 'ready',
  written: 3,
  total: 3,
  sections: [],
  missing: [],
  regenerations_left: 9,
  editable_until: '2026-10-18T10:00:00.000Z',
  frozen: false,
  pdf: 'none',
  pages: null,
  created_at: '2026-10-04T10:00:00.000Z',
  ...over,
});

describe('editLine', () => {
  it('says how many rewrites are left and until when', () => {
    expect(editLine(view())).toBe('переписать: 9 из 10 до 18 окт');
  });

  it('says edits are closed once frozen', () => {
    expect(editLine(view({ frozen: true }))).toBe('правки закрыты');
  });
});

describe('dockState and needsPolling', () => {
  it('follows the reading from writing to the PDF', () => {
    expect(dockState(view({ status: 'writing' }))).toBe('writing');
    expect(dockState(view({ status: 'failed' }))).toBe('failed');
    expect(dockState(view({ missing: [{ id: 'b', title: 'Солнце' }] }))).toBe('missing');
    expect(dockState(view())).toBe('assemble');
    expect(dockState(view({ pdf: 'building' }))).toBe('building');
    expect(dockState(view({ pdf: 'ready', pages: 34 }))).toBe('download');
  });

  it('polls only while writing or building', () => {
    expect(needsPolling(view({ status: 'writing' }))).toBe(true);
    expect(needsPolling(view({ pdf: 'building' }))).toBe(true);
    expect(needsPolling(view())).toBe(false);
    expect(needsPolling(view({ status: 'failed' }))).toBe(false);
  });

  it('names the sections to fill first', () => {
    expect(missingNote([{ id: 'b', title: 'Солнце' }])).toBe('Сначала допишите: «Солнце»');
    expect(
      missingNote([
        { id: 'b', title: 'Солнце' },
        { id: 'c', title: 'Луна' },
      ]),
    ).toBe('Сначала допишите: «Солнце», «Луна»');
  });
});

describe('messages', () => {
  it('explains a refused rewrite', () => {
    expect(rewriteError(409, 'limit')).toBe(
      'Переписывать больше нельзя: использованы все 10 попыток',
    );
    expect(rewriteError(409, 'frozen')).toBe('Срок правок закончился');
    expect(rewriteError(409, 'busy')).toBe('Раздел уже переписывается, подождите');
    expect(rewriteError(503, 'failed')).toBe(
      'Не получилось переписать раздел. Попробуйте ещё раз.',
    );
    expect(rewriteError(0)).toBe('Не получилось отправить. Попробуйте ещё раз через минуту.');
  });

  it('explains a refused PDF', () => {
    expect(assembleError('incomplete')).toBe('Сначала допишите все разделы');
    expect(assembleError('no_brand')).toBe('Сначала заполните бренд: он нужен для обложки PDF');
    expect(assembleError(undefined)).toBe(
      'Не получилось отправить. Попробуйте ещё раз через минуту.',
    );
  });

  it('explains a refused report', () => {
    expect(reportError(400)).toBe('Напишите, что не так: до 1000 символов');
    expect(reportError(429)).toBe('Слишком много сообщений. Попробуйте через час.');
  });
});

describe('richParagraphs', () => {
  it('splits paragraphs on blank lines', () => {
    expect(richParagraphs('Один.\n\n  \nДва\nстроки.')).toEqual([
      [{ text: 'Один.', bold: false, italic: false }],
      [{ text: 'Два\nстроки.', bold: false, italic: false }],
    ]);
  });

  it('keeps <b> and <i> as marks, never as markup', () => {
    expect(richParagraphs('Солнце в <b>Тельце</b> и <i>Луна</i>.')).toEqual([
      [
        { text: 'Солнце в ', bold: false, italic: false },
        { text: 'Тельце', bold: true, italic: false },
        { text: ' и ', bold: false, italic: false },
        { text: 'Луна', bold: false, italic: true },
        { text: '.', bold: false, italic: false },
      ],
    ]);
  });

  it('leaves any other tag as plain text and copes with an unclosed mark', () => {
    expect(richParagraphs('<script>x</script> <b>жирно')).toEqual([
      [
        { text: '<script>x</script> ', bold: false, italic: false },
        { text: 'жирно', bold: true, italic: false },
      ],
    ]);
  });

  it('gives nothing for empty text', () => {
    expect(richParagraphs('  \n\n ')).toEqual([]);
  });
});

describe('roman', () => {
  it('numbers sections the way the sketch does', () => {
    expect([1, 2, 3, 4, 9, 14, 20, 40].map(roman)).toEqual([
      'I',
      'II',
      'III',
      'IV',
      'IX',
      'XIV',
      'XX',
      'XL',
    ]);
  });
});

describe('progressLabel', () => {
  it('agrees the noun with the total', () => {
    expect(progressLabel(7, 20)).toBe('7 из 20 разделов');
    expect(progressLabel(0, 21)).toBe('0 из 21 раздела');
    expect(progressLabel(1, 3)).toBe('1 из 3 разделов');
  });

  it('says nothing useful is known before the plan exists', () => {
    expect(progressLabel(0, 0)).toBe('готовим план');
  });
});

describe('sectionsLabel', () => {
  it('agrees the noun with the count', () => {
    expect([1, 3, 20, 21].map(sectionsLabel)).toEqual([
      '1 раздел',
      '3 раздела',
      '20 разделов',
      '21 раздел',
    ]);
  });
});

describe('firstName and readingTitle', () => {
  it('takes the first word of a name', () => {
    expect(firstName('  Анна  Коваль ')).toBe('Анна');
    expect(firstName('')).toBe('Клиент');
  });

  it('joins the person and the product', () => {
    expect(readingTitle('natal', 'Анна Коваль')).toBe('Анна · Натальная карта');
    expect(readingTitle('synastry', 'Оксана Мельник', 'Игорь Мельник')).toBe(
      'Оксана и Игорь · Синастрия',
    );
  });

  it('copes with a client that is gone', () => {
    expect(readingTitle('natal', undefined)).toBe('Клиент · Натальная карта');
  });
});

describe('readingDate', () => {
  const now = new Date('2026-10-04T12:00:00Z');

  it('says today and yesterday in words', () => {
    expect(readingDate('2026-10-04T01:00:00.000Z', now)).toBe('сегодня');
    expect(readingDate('2026-10-03T23:00:00.000Z', now)).toBe('вчера');
  });

  it('gives a short date this year and the year otherwise', () => {
    expect(readingDate('2026-10-02T10:00:00.000Z', now)).toBe('2 окт');
    expect(readingDate('2025-09-29T10:00:00.000Z', now)).toBe('29 сен 2025');
  });

  it('keeps quiet about a date it cannot read', () => {
    expect(readingDate('nonsense', now)).toBe('');
  });
});

describe('applyRewrite', () => {
  const sun = { id: 'b', title: 'Солнце', text: 'Новый текст' };

  it('moves a filled section out of missing and into the sections', () => {
    const before = view({
      written: 2,
      sections: [{ id: 'a', title: 'Асцендент', text: 'A' }],
      missing: [{ id: 'b', title: 'Солнце' }],
    });
    const after = applyRewrite(before, sun, 9);
    expect(after.missing).toEqual([]);
    expect(after.sections.map((s) => s.id)).toEqual(['a', 'b']);
    expect(after.written).toBe(3);
  });

  it('replaces the text of a rewritten section and takes the new counter', () => {
    const before = view({ sections: [{ id: 'b', title: 'Солнце', text: 'Старый' }] });
    const after = applyRewrite(before, sun, 8);
    expect(after.sections).toEqual([sun]);
    expect(after.regenerations_left).toBe(8);
    expect(after.written).toBe(3);
  });

  it('forgets the PDF, which the worker dropped', () => {
    const before = view({
      sections: [{ id: 'b', title: 'Солнце', text: 'Старый' }],
      pdf: 'ready',
      pages: 34,
    });
    expect(applyRewrite(before, sun, undefined)).toMatchObject({
      pdf: 'none',
      pages: null,
      regenerations_left: 9,
    });
  });
});

describe('pdfBuildFailed', () => {
  it('is true only when a build ends with no PDF', () => {
    expect(pdfBuildFailed('building', 'none')).toBe(true);
    expect(pdfBuildFailed('building', 'ready')).toBe(false);
    expect(pdfBuildFailed('none', 'none')).toBe(false);
  });
});
