import {
  DEFAULT_SETTINGS,
  LANGUAGES,
  REWRITE_STYLE_CATALOG,
  TRANSLATION_TONES,
  TRANSLATION_TONE_LABELS,
  languageName,
  type RewriteStyle,
  type TranslationTone,
  type UserSettingsUpdate,
} from '@verba/shared';
import { Save, X } from 'lucide-react';
import { useState } from 'react';
import { LanguageSelect } from '../../components/LanguageSelect';
import { Button, IconButton } from '../../components/ui/Button';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { fieldClass } from '../../components/ui/fieldClass';
import { useSaveSettings } from '../../hooks/useSaveSettings';
import type { ExtensionState } from '../../shared/messages';
import { Field, Notice, SectionCard } from './SectionCard';

export const MAX_FAVORITE_LANGUAGES = 12;

interface LanguageDraft {
  targetLang: string;
  favorites: string[];
  tone: TranslationTone;
  rewriteStyle: RewriteStyle;
}

const TONE_OPTIONS = TRANSLATION_TONES.map((t) => ({ value: t, label: TRANSLATION_TONE_LABELS[t] }));

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function LanguagesSection({ state, refresh }: { state: ExtensionState | null; refresh: () => void }) {
  const settings = state?.settings ?? null;
  const { save, saving } = useSaveSettings(refresh);

  const saved: LanguageDraft = {
    targetLang: settings?.defaultTargetLang ?? DEFAULT_SETTINGS.defaultTargetLang,
    favorites: settings?.favoriteLanguages ?? DEFAULT_SETTINGS.favoriteLanguages,
    tone: settings?.translationTone ?? DEFAULT_SETTINGS.translationTone,
    rewriteStyle: settings?.defaultRewriteStyle ?? DEFAULT_SETTINGS.defaultRewriteStyle,
  };

  // null = no unsaved edits; the view shows the saved settings.
  const [draft, setDraft] = useState<LanguageDraft | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const current = draft ?? saved;
  const dirty =
    draft !== null &&
    (draft.targetLang !== saved.targetLang ||
      !sameList(draft.favorites, saved.favorites) ||
      draft.tone !== saved.tone ||
      draft.rewriteStyle !== saved.rewriteStyle);

  const favoriteOptions = LANGUAGES.filter((l) => !current.favorites.includes(l.code));
  const atLimit = current.favorites.length >= MAX_FAVORITE_LANGUAGES;

  function edit(next: Partial<LanguageDraft>) {
    setFeedback(null);
    setDraft({ ...current, ...next });
  }

  function addFavorite(code: string) {
    if (!code || atLimit || current.favorites.includes(code)) return;
    edit({ favorites: [...current.favorites, code] });
  }

  function removeFavorite(code: string) {
    edit({ favorites: current.favorites.filter((c) => c !== code) });
  }

  /** Sends only the fields that differ from the saved settings. */
  async function saveChanges() {
    if (!draft || !dirty) return;
    const patch: UserSettingsUpdate = {};
    if (draft.targetLang !== saved.targetLang) patch.defaultTargetLang = draft.targetLang;
    if (!sameList(draft.favorites, saved.favorites)) patch.favoriteLanguages = draft.favorites;
    if (draft.tone !== saved.tone) patch.translationTone = draft.tone;
    if (draft.rewriteStyle !== saved.rewriteStyle) patch.defaultRewriteStyle = draft.rewriteStyle;

    const res = await save(patch);
    if (res.ok) {
      setDraft(null);
      setFeedback({ tone: 'success', text: 'Saved.' });
    } else {
      setFeedback({ tone: 'error', text: res.error.message });
    }
  }

  const selectedStyle = REWRITE_STYLE_CATALOG.find((s) => s.id === current.rewriteStyle);

  return (
    <SectionCard
      id="languages"
      title="Languages and defaults"
      description="Defaults for translation and rewriting, used by the popup and the on-page toolbar."
    >
      {!settings && (
        <p className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
          Connect to a Verba server to change these settings.
        </p>
      )}

      <fieldset disabled={!settings || saving} className="min-w-0 space-y-5 disabled:opacity-60">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field htmlFor="default-target" label="Default target language">
            <LanguageSelect
              id="default-target"
              label="Default target language"
              value={current.targetLang}
              onChange={(code) => edit({ targetLang: code })}
              favorites={current.favorites}
              className="h-9 w-full text-[13px]"
            />
          </Field>

          <Field htmlFor="default-rewrite" label="Default rewrite style" hint={selectedStyle?.description}>
            <select
              id="default-rewrite"
              value={current.rewriteStyle}
              onChange={(e) => edit({ rewriteStyle: e.target.value as RewriteStyle })}
              className={fieldClass}
            >
              {REWRITE_STYLE_CATALOG.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-medium">Translation tone</span>
          </div>
          <SegmentedControl
            label="Translation tone"
            options={TONE_OPTIONS}
            value={current.tone}
            onChange={(tone) => edit({ tone })}
            className="flex w-full"
          />
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[13px] font-semibold">Favourite languages</h3>
              <p className="text-[12px] text-muted">These appear first in every language menu.</p>
            </div>
            <span className="shrink-0 text-[11.5px] tabular-nums text-subtle">
              {current.favorites.length} / {MAX_FAVORITE_LANGUAGES}
            </span>
          </div>

          {current.favorites.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {current.favorites.map((code) => (
                <li
                  key={code}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pl-2.5 pr-0.5 text-[12px] font-medium"
                >
                  {languageName(code)}
                  <IconButton
                    icon={X}
                    size="sm"
                    label={`Remove ${languageName(code)} from favourites`}
                    onClick={() => removeFavorite(code)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-subtle">No favourites yet.</p>
          )}

          <select
            aria-label="Add a favourite language"
            value=""
            disabled={atLimit}
            onChange={(e) => addFavorite(e.target.value)}
            className={fieldClass}
          >
            <option value="">{atLimit ? 'Favourite limit reached' : 'Add a language…'}</option>
            {favoriteOptions.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="min-w-0 flex-1">
          {dirty ? (
            <Notice tone="muted">You have unsaved changes.</Notice>
          ) : (
            feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>
          )}
        </div>
        <div className="flex gap-2">
          {dirty && (
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
              Discard
            </Button>
          )}
          <Button icon={Save} loading={saving} disabled={!dirty || !settings} onClick={() => void saveChanges()}>
            Save changes
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
