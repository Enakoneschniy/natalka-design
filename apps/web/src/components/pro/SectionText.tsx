import { type Run, richParagraphs } from '@/lib/pro/readings';

function RunText({ run }: { run: Run }) {
  if (run.bold && run.italic) {
    return (
      <b>
        <i>{run.text}</i>
      </b>
    );
  }
  if (run.bold) return <b>{run.text}</b>;
  if (run.italic) return <i>{run.text}</i>;
  return <>{run.text}</>;
}

/** A section's text as paragraphs, with its bold and italic marks; rendered as text, never as
 * HTML. `preview` keeps only the first paragraph, clamped to three lines by the stylesheet. */
export function SectionText({ text, preview = false }: { text: string; preview?: boolean }) {
  const paragraphs = richParagraphs(text);
  const shown = preview ? paragraphs.slice(0, 1) : paragraphs;
  return (
    <div className={preview ? 'text preview' : 'text'}>
      {shown.map((runs, p) => (
        // Paragraphs never move; their position is their identity.
        // biome-ignore lint/suspicious/noArrayIndexKey: static, ordered text
        <p key={p}>
          {runs.map((run, r) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static, ordered text
            <RunText key={r} run={run} />
          ))}
        </p>
      ))}
    </div>
  );
}
