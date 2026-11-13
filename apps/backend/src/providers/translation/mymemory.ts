import { isRecord } from '../../utils/json';
import { requestJson } from '../http';
import type { HttpOptions } from '../http';
import { ProviderError } from '../types';
import type { ResolvedProviderConfig, TranslateInput, TranslationProvider } from '../types';

const ENDPOINT = 'https://api.mymemory.translated.net/get';
const CHUNK_CHARS = 450;

interface Unit {
  text: string;
  separator: string;
}

interface Chunk {
  text: string;
  separator: string;
}

function mapCode(code: string): string {
  if (code === 'zh-Hans') return 'zh-CN';
  if (code === 'zh-Hant') return 'zh-TW';
  return code;
}

/** Splits a line into sentence-sized pieces no longer than `max`, hard-slicing overlong sentences. */
function splitLine(line: string, max: number): string[] {
  const sentences = line.match(/[^.!?。！？]+[.!?。！？]*/g) ?? [line];
  const pieces: string[] = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    for (let i = 0; i < trimmed.length; i += max) {
      const piece = trimmed.slice(i, i + max).trim();
      if (piece) pieces.push(piece);
    }
  }
  return pieces;
}

/** Turns text into ordered units; each unit remembers what separated it from the next. */
function buildUnits(text: string, max: number): Unit[] {
  const units: Unit[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      const last = units[units.length - 1];
      if (last) last.separator += '\n';
      continue;
    }
    const pieces = splitLine(line, max);
    pieces.forEach((piece, index) => {
      units.push({ text: piece, separator: index < pieces.length - 1 ? ' ' : '\n' });
    });
  }
  const last = units[units.length - 1];
  if (last) last.separator = '';
  return units;
}

/** Greedily packs units into chunks of at most `max` characters, keeping original separators. */
export function chunkForMyMemory(text: string, max: number = CHUNK_CHARS): Chunk[] {
  const chunks: Chunk[] = [];
  let current = '';
  let separator = '';
  for (const unit of buildUnits(text, max)) {
    if (current === '') {
      current = unit.text;
      separator = unit.separator;
      continue;
    }
    const candidate = `${current}${separator}${unit.text}`;
    if (candidate.length <= max) {
      current = candidate;
    } else {
      chunks.push({ text: current, separator });
      current = unit.text;
    }
    separator = unit.separator;
  }
  if (current !== '') chunks.push({ text: current, separator: '' });
  return chunks;
}

async function translateChunk(
  text: string,
  langpair: string,
  input: TranslateInput,
  cfg: ResolvedProviderConfig,
  http: HttpOptions,
): Promise<string> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', langpair);
  if (cfg.apiKey) url.searchParams.set('de', cfg.apiKey);

  const data = await requestJson({
    provider: 'mymemory',
    url: url.toString(),
    method: 'GET',
    signal: input.signal,
    timeoutMs: http.timeoutMs,
    redact: cfg.apiKey ? [cfg.apiKey] : [],
  });
  if (!isRecord(data)) throw new ProviderError('mymemory', 'MyMemory returned an unexpected response.');

  const status = Number(data.responseStatus);
  if (status !== 200) {
    const details = typeof data.responseDetails === 'string' ? `: ${data.responseDetails.slice(0, 120)}` : '';
    throw new ProviderError('mymemory', `MyMemory responded with status ${status}${details}`);
  }

  const payload = isRecord(data.responseData) ? data.responseData : {};
  const translated = typeof payload.translatedText === 'string' ? payload.translatedText.trim() : '';
  if (/^(MYMEMORY WARNING|QUERY LENGTH LIMIT)/i.test(translated)) {
    throw new ProviderError('mymemory', 'MyMemory daily quota reached or the text is too long.');
  }
  if (!translated) throw new ProviderError('mymemory', 'MyMemory returned an empty translation.');
  return translated;
}

export function createMyMemoryProvider(http: HttpOptions): TranslationProvider {
  return {
    id: 'mymemory',
    async translate(input, cfg) {
      const source = input.source === 'auto' ? 'Autodetect' : mapCode(input.source);
      const langpair = `${source}|${mapCode(input.target)}`;
      const chunks = chunkForMyMemory(input.text);
      const outputs: string[] = [];
      for (const chunk of chunks) {
        outputs.push(await translateChunk(chunk.text, langpair, input, cfg, http));
      }
      const text = outputs.map((out, index) => (index < outputs.length - 1 ? out + chunks[index].separator : out)).join('');
      return { text };
    },
  };
}
