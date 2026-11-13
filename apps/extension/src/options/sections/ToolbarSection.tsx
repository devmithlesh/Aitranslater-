import {
  TOOLBAR_ACTION_CATALOG,
  type ExtensionSettings,
  type ToolbarAction,
} from '@verba/shared';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { IconButton, Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Switch } from '../../components/ui/Switch';
import { fieldClass } from '../../components/ui/fieldClass';
import { useSaveSettings } from '../../hooks/useSaveSettings';
import type { ExtensionState } from '../../shared/messages';
import { normalizeHostname } from '../validation';
import { Notice, SectionCard } from './SectionCard';

const MAX_TOOLBAR_ACTIONS_NOTE = 'Keep at least one toolbar action.';

export function ToolbarSection({ state, refresh }: { state: ExtensionState | null; refresh: () => void }) {
  const ext: ExtensionSettings | undefined = state?.settings?.extension;
  const { save, saving } = useSaveSettings(refresh);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [siteDraft, setSiteDraft] = useState('');
  const [siteError, setSiteError] = useState<string | null>(null);

  const enabledActions: readonly ToolbarAction[] = ext?.toolbarActions ?? [];
  const disabledSites: readonly string[] = ext?.disabledSites ?? [];

  /** Enabled actions first in their saved order, then the rest in catalog order. */
  const orderedActions = [...TOOLBAR_ACTION_CATALOG].sort((a, b) => orderOf(a.id) - orderOf(b.id));

  function orderOf(id: ToolbarAction): number {
    const index = enabledActions.indexOf(id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  }

  /** Saves an extension patch, then reports the outcome. Returns true on success. */
  async function saveExtension(patch: Partial<ExtensionSettings>): Promise<boolean> {
    setFeedback(null);
    const res = await save({ extension: patch });
    if (res.ok) {
      setFeedback({ tone: 'success', text: 'Saved.' });
      return true;
    }
    setFeedback({ tone: 'error', text: res.error.message });
    return false;
  }

  async function toggleAction(id: ToolbarAction, on: boolean) {
    if (on) {
      await saveExtension({ toolbarActions: [...enabledActions, id] });
      return;
    }
    if (enabledActions.length <= 1) {
      setFeedback({ tone: 'error', text: MAX_TOOLBAR_ACTIONS_NOTE });
      return;
    }
    await saveExtension({ toolbarActions: enabledActions.filter((a) => a !== id) });
  }

  async function moveAction(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= enabledActions.length) return;
    const next = [...enabledActions];
    const moved = next[index];
    next[index] = next[target];
    next[target] = moved;
    await saveExtension({ toolbarActions: next });
  }

  async function addSite() {
    const host = normalizeHostname(siteDraft);
    if (!host) {
      setSiteError('Enter a hostname such as bank.example.com.');
      return;
    }
    if (disabledSites.includes(host)) {
      setSiteError('That site is already in the list.');
      return;
    }
    setSiteError(null);
    const ok = await saveExtension({ disabledSites: [...disabledSites, host] });
    if (ok) setSiteDraft('');
  }

  async function removeSite(host: string) {
    await saveExtension({ disabledSites: disabledSites.filter((s) => s !== host) });
  }

  return (
    <SectionCard
      id="toolbar"
      title="Toolbar and behaviour"
      description="How the floating toolbar appears on web pages. Changes apply to the dashboard and every open tab."
    >
      {!ext && (
        <p className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
          Connect to a Verba server to change these settings.
        </p>
      )}

      <fieldset disabled={!ext || saving} className="min-w-0 space-y-6 disabled:opacity-60">
        <div className="space-y-1">
          <ToggleRow
            label="Verba enabled"
            description="Turn on-page features on or off everywhere."
            checked={ext?.enabled ?? false}
            onChange={(v) => void saveExtension({ enabled: v })}
          />
          <ToggleRow
            label="Show toolbar on selection"
            description="Pop up the toolbar automatically when you select text."
            checked={ext?.showToolbarOnSelection ?? false}
            onChange={(v) => void saveExtension({ showToolbarOnSelection: v })}
          />
          <ToggleRow
            label="Only in text fields"
            description="Auto-show the toolbar only in inputs and editable areas, not on regular page text."
            checked={ext?.editableOnly ?? false}
            onChange={(v) => void saveExtension({ editableOnly: v })}
          />
        </div>

        <div className="space-y-2.5">
          <div>
            <h3 className="text-[13px] font-semibold">Toolbar buttons</h3>
            <p className="text-[12px] text-muted">Tick the buttons to show, and use the arrows to reorder them.</p>
          </div>
          <ul className="space-y-1.5">
            {orderedActions.map((action) => {
              const position = enabledActions.indexOf(action.id);
              const on = position !== -1;
              const isLastEnabled = on && enabledActions.length === 1;
              const inputId = `toolbar-action-${action.id}`;
              return (
                <li
                  key={action.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors hover:border-border-strong"
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={on}
                    disabled={isLastEnabled}
                    onChange={(e) => void toggleAction(action.id, e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-[rgb(var(--brand))]"
                  />
                  <Icon name={action.icon} size={15} className="shrink-0 text-muted" />
                  <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block text-[13px] font-medium">{action.label}</span>
                    <span className="block truncate text-[12px] text-muted">{action.description}</span>
                  </label>
                  {on && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <IconButton
                        icon={ChevronUp}
                        size="sm"
                        label={`Move ${action.label} up`}
                        disabled={position === 0}
                        onClick={() => void moveAction(position, -1)}
                      />
                      <IconButton
                        icon={ChevronDown}
                        size="sm"
                        label={`Move ${action.label} down`}
                        disabled={position === enabledActions.length - 1}
                        onClick={() => void moveAction(position, 1)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-2.5">
          <div>
            <h3 className="text-[13px] font-semibold">Disabled sites</h3>
            <p className="text-[12px] text-muted">The toolbar never appears on these hostnames.</p>
          </div>

          {disabledSites.length === 0 ? (
            <p className="text-[12.5px] text-subtle">Verba is active on every site.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {disabledSites.map((host) => (
                <li key={host}>
                  <Badge className="gap-1 py-1 pl-2.5 pr-1 text-[12px]">
                    <span className="font-mono">{host}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${host}`}
                      onClick={() => void removeSite(host)}
                      className="rounded-full p-0.5 text-muted hover:bg-surface-2 hover:text-fg"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <input
              aria-label="Hostname to disable"
              type="text"
              value={siteDraft}
              placeholder="bank.example.com"
              spellCheck={false}
              onChange={(e) => {
                setSiteDraft(e.target.value);
                setSiteError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addSite();
                }
              }}
              className={`${fieldClass} font-mono text-[12.5px]`}
            />
            <Button variant="outline" disabled={!siteDraft.trim()} onClick={() => void addSite()} className="shrink-0">
              Add site
            </Button>
          </div>
          {siteError && <Notice tone="error">{siteError}</Notice>}
        </div>
      </fieldset>

      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
    </SectionCard>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl px-1 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{label}</p>
        <p className="text-[12px] leading-5 text-muted">{description}</p>
      </div>
      <Switch label={label} checked={checked} onChange={onChange} />
    </div>
  );
}
