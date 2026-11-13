export type DiffOp = 'equal' | 'insert' | 'delete';

export interface DiffSegment {
  op: DiffOp;
  text: string;
}

/** Split into words and the whitespace/punctuation between them, keeping everything. */
function tokenize(text: string): string[] {
  return text.match(/\s+|[\p{L}\p{N}\p{M}'’_-]+|[^\s\p{L}\p{N}\p{M}]/gu) ?? [];
}

/** Above this many token pairs we fall back to a coarse diff to bound memory/CPU. */
const MAX_MATRIX = 4_000_000;

/**
 * Word-level diff (LCS). Used to highlight grammar corrections and rewrites.
 * Adjacent segments with the same op are merged.
 */
export function diffWords(before: string, after: string): DiffSegment[] {
  if (before === after) return before ? [{ op: 'equal', text: before }] : [];
  const a = tokenize(before);
  const b = tokenize(after);

  // Trim common prefix/suffix — most edits are local, this keeps the matrix small.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const out: DiffSegment[] = [];
  const push = (op: DiffOp, text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };

  push('equal', a.slice(0, start).join(''));

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;

  if ((n + 1) * (m + 1) > MAX_MATRIX) {
    push('delete', midA.join(''));
    push('insert', midB.join(''));
  } else {
    // dp[i][j] = LCS length of midA[i..] and midB[j..]
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      const row = dp[i]!;
      const next = dp[i + 1]!;
      for (let j = m - 1; j >= 0; j--) {
        row[j] = midA[i] === midB[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        push('equal', midA[i]!);
        i++;
        j++;
      } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
        push('delete', midA[i]!);
        i++;
      } else {
        push('insert', midB[j]!);
        j++;
      }
    }
    while (i < n) push('delete', midA[i++]!);
    while (j < m) push('insert', midB[j++]!);
  }

  push('equal', a.slice(endA).join(''));
  return out;
}
