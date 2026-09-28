import type { ReactNode } from 'react';

/**
 * Tiny markdown renderer for card notes. Emits React elements (never raw HTML),
 * so it's XSS-safe by construction. Supports: headings, bold/italic/code,
 * links, lists, task lists with live checkboxes, code fences, blockquotes.
 */

interface Props {
  text: string;
  /** Called with the updated full text when a task checkbox is toggled. */
  onToggleTask?: (updated: string) => void;
}

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Order matters: code first so its contents aren't re-parsed.
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]]+\]\((?:https?:\/\/|\/)[^)\s]+\))|(https?:\/\/[^\s<>)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${k++}`;
    if (tok.startsWith('`')) out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('**')) out.push(<strong key={key}>{inline(tok.slice(2, -2), key)}</strong>);
    else if (tok.startsWith('*') || tok.startsWith('_')) out.push(<em key={key}>{inline(tok.slice(1, -1), key)}</em>);
    else if (tok.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      out.push(
        <a key={key} href={mm[2]!} target="_blank" rel="noreferrer noopener">
          {mm[1]!}
        </a>,
      );
    } else {
      out.push(
        <a key={key} href={tok} target="_blank" rel="noreferrer noopener">
          {tok}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, onToggleTask }: Props) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const toggleTaskAt = (lineIdx: number) => {
    if (!onToggleTask) return;
    const updated = lines
      .map((l, idx) => {
        if (idx !== lineIdx) return l;
        return /\[ \]/.test(l) ? l.replace('[ ]', '[x]') : l.replace(/\[[xX]\]/, '[ ]');
      })
      .join('\n');
    onToggleTask(updated);
  };

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        buf.push(lines[i]!);
        i++;
      }
      i++; // closing fence
      blocks.push(
        <pre key={key++}>
          <code>{buf.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      const content = inline(h[2]!, `h${key}`);
      blocks.push(level === 1 ? <h1 key={key++}>{content}</h1> : level === 2 ? <h2 key={key++}>{content}</h2> : <h3 key={key++}>{content}</h3>);
      i++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) {
        buf.push(lines[i]!.replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push(<blockquote key={key++}>{inline(buf.join(' '), `q${key}`)}</blockquote>);
      continue;
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const items: ReactNode[] = [];
      const ordered = /^\s*\d+\./.test(line);
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i]!)) {
        const raw = lines[i]!;
        const lineIdx = i;
        const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(raw);
        if (task) {
          const done = task[1] !== ' ';
          items.push(
            <li key={key++} className={done ? 'task done' : 'task'}>
              <label className="task-check">
                <input
                  type="checkbox"
                  checked={done}
                  disabled={!onToggleTask}
                  onChange={() => toggleTaskAt(lineIdx)}
                  aria-label={task[2]!}
                />
                <span className="check-box" aria-hidden="true">
                  {done && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </span>
              </label>
              <span>{inline(task[2]!, `t${key}`)}</span>
            </li>,
          );
        } else {
          items.push(<li key={key++}>{inline(raw.replace(/^\s*([-*+]|\d+\.)\s+/, ''), `l${key}`)}</li>);
        }
        i++;
      }
      blocks.push(ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>);
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    // paragraph: consume consecutive non-empty, non-special lines
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i]!.trim() !== '' && !/^(#{1,3}\s|```|\s*>|\s*([-*+]|\d+\.)\s)/.test(lines[i]!)) {
      buf.push(lines[i]!);
      i++;
    }
    blocks.push(
      <p key={key++}>
        {buf.map((l, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {inline(l, `p${key}-${j}`)}
          </span>
        ))}
      </p>,
    );
  }

  return <div className="md">{blocks}</div>;
}
