import type { ReactNode } from 'react';

/**
 * Renders the model's plain-text explanation as React elements. No HTML is ever
 * parsed, so model output cannot inject markup or scripts.
 *
 * Supported: "- " or "• " bullet lines, inline **bold**, empty lines as spacing.
 */

type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'gap' };

const BULLET = /^[-•]\s+(.*)$/;
const BOLD = /\*\*([^*]+)\*\*/g;

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') {
      if (blocks.length > 0 && blocks[blocks.length - 1].kind !== 'gap') blocks.push({ kind: 'gap' });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      const last = blocks[blocks.length - 1];
      if (last && last.kind === 'list') last.items.push(bullet[1]);
      else blocks.push({ kind: 'list', items: [bullet[1]] });
      continue;
    }
    blocks.push({ kind: 'paragraph', text: line });
  }
  while (blocks.length > 0 && blocks[blocks.length - 1].kind === 'gap') blocks.pop();
  return blocks;
}

function renderInline(line: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const match of line.matchAll(BOLD)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(line.slice(last, index));
    nodes.push(
      <strong key={`${keyPrefix}-b${n++}`} className="font-semibold text-fg">
        {match[1]}
      </strong>,
    );
    last = index + match[0].length;
  }
  if (last < line.length) nodes.push(line.slice(last));
  return nodes;
}

export function ExplanationText({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div dir="auto" className="space-y-2 break-words text-start text-[13.5px] leading-6 text-fg">
      {blocks.map((block, i) => {
        if (block.kind === 'gap') return <div key={i} aria-hidden className="h-1" />;
        if (block.kind === 'list') {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item, `${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(block.text, `${i}`)}</p>;
      })}
    </div>
  );
}
