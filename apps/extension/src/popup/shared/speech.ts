import { useCallback, useEffect, useRef, useState } from 'react';

/** The parts of the (WebKit-prefixed) Web Speech API that Verba uses. */
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const scope = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const SPEECH_LANGS: Record<string, string> = {
  en: 'en-IN',
  // Hinglish is spoken Hindi with English words. The English (India) recognizer writes it in Latin letters, which Verba understands.
  hinglish: 'en-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
  gu: 'gu-IN',
  mr: 'mr-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  pa: 'pa-Guru-IN',
  ur: 'ur-IN',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  nb: 'nb-NO',
  fil: 'fil-PH',
};

/** Speech recognition language for a Verba language code. Unknown codes are passed through. */
export function toSpeechLang(code: string): string {
  return SPEECH_LANGS[code] ?? code;
}

export type SpeechProblem = 'permission' | 'no-speech' | 'no-mic' | 'network' | 'unsupported' | 'other';

export const SPEECH_MESSAGES: Record<SpeechProblem, string> = {
  permission: 'Verba needs microphone access.',
  'no-speech': "Didn't catch that. Tap the mic and try again.",
  'no-mic': 'No microphone was found.',
  network: 'Speech service could not be reached. Check your internet.',
  unsupported: 'Voice input is not available in this browser.',
  other: 'Voice input stopped. Try again.',
};

function problemFor(error: string): SpeechProblem | null {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission';
    case 'no-speech':
      return 'no-speech';
    case 'audio-capture':
      return 'no-mic';
    case 'network':
      return 'network';
    case 'aborted':
      return null;
    default:
      return 'other';
  }
}

export interface SpeechInput {
  supported: boolean;
  listening: boolean;
  /** The microphone is open (the browser started capturing sound). */
  audioOn: boolean;
  /** Some speech was recognised or detected since listening began. */
  heardSpeech: boolean;
  /** Listening for a while but nothing was heard: the wrong or a muted microphone. */
  quiet: boolean;
  problem: SpeechProblem | null;
  /** The browser's own error code for the last failure, to show when the cause is unclear. */
  errorCode: string | null;
  /** Starts listening. `base` is the text already in the box; spoken words are added after it. */
  start: (base: string) => void;
  stop: () => void;
  /** Stops at once and drops anything still being recognised, so no late words land in the box. */
  abort: () => void;
  toggle: (base: string) => void;
}

/** Voice input. `onText` receives the full text (base + what was said so far), live while speaking. */
export function useSpeechInput(lang: string, onText: (text: string) => void): SpeechInput {
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<SpeechProblem | null>(null);
  const [audioOn, setAudioOn] = useState(false);
  const [heardSpeech, setHeardSpeech] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const supported = recognitionCtor() !== null;

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  const abort = useCallback(() => {
    const rec = recognition.current;
    if (!rec) return;
    rec.onresult = null;
    rec.abort();
  }, []);

  const begin = useCallback(
    (base: string) => {
      const Ctor = recognitionCtor();
      if (!Ctor) {
        setProblem('unsupported');
        return;
      }
      recognition.current?.abort();
      const rec = new Ctor();
      rec.lang = toSpeechLang(lang);
      rec.continuous = true;
      rec.interimResults = true;
      const prefix = base.trim() === '' ? '' : `${base.trimEnd()} `;
      let finalText = '';
      rec.onresult = (event) => {
        setHeardSpeech(true);
        setQuiet(false);
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result?.[0]?.transcript ?? '';
          if (result?.isFinal) finalText += transcript;
          else interim += transcript;
        }
        onTextRef.current(`${prefix}${finalText}${interim}`.replace(/[ \t]+/g, ' ').trimStart());
      };
      rec.onerror = (event) => {
        const found = problemFor(event.error);
        if (found) {
          setProblem(found);
          setErrorCode(event.error);
        }
      };
      rec.onspeechstart = () => {
        setHeardSpeech(true);
        setQuiet(false);
      };
      let heardAudio = false;
      let watchdog: number | undefined;
      let quietTimer: number | undefined;
      rec.onaudiostart = () => {
        heardAudio = true;
        window.clearTimeout(watchdog);
        setAudioOn(true);
        // The microphone is open but no sound has been picked up for a while.
        quietTimer = window.setTimeout(() => setQuiet(true), 7000);
      };
      rec.onend = () => {
        window.clearTimeout(watchdog);
        window.clearTimeout(quietTimer);
        setAudioOn(false);
        setQuiet(false);
        if (recognition.current === rec) recognition.current = null;
        setListening(false);
      };
      recognition.current = rec;
      setProblem(null);
      setErrorCode(null);
      setAudioOn(false);
      setHeardSpeech(false);
      setQuiet(false);
      try {
        rec.start();
        setListening(true);
        // If the microphone never opens, say so instead of listening forever.
        watchdog = window.setTimeout(() => {
          if (heardAudio || recognition.current !== rec) return;
          rec.onresult = null;
          rec.abort();
          setProblem('permission');
        }, 5000);
      } catch {
        recognition.current = null;
        setProblem('other');
      }
    },
    [lang],
  );

  /** Chrome cannot ask for the microphone inside the popup, so check first and point to the permission page. */
  const start = useCallback(
    (base: string) => {
      const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
      if (!perms) {
        begin(base);
        return;
      }
      perms
        .query({ name: 'microphone' as PermissionName })
        .then((status) => {
          if (status.state === 'granted') begin(base);
          else setProblem('permission');
        })
        .catch(() => begin(base));
    },
    [begin],
  );

  const toggle = useCallback(
    (base: string) => {
      if (recognition.current) stop();
      else start(base);
    },
    [start, stop],
  );

  // Never leave the microphone on after the popup (or this view) goes away.
  useEffect(
    () => () => {
      recognition.current?.abort();
      recognition.current = null;
    },
    [],
  );

  return { supported, listening, audioOn, heardSpeech, quiet, problem, errorCode, start, stop, abort, toggle };
}
