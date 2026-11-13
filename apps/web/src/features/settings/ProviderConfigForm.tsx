import type { ProviderDescriptor, ProviderTestResponse, ProviderUpdateRequest, ProviderView } from '@verba/shared';
import { Activity, CheckCircle2, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Field, Input, useToast } from '@/components/ui';
import { errorMessage, useTestProviderMutation, useUpdateProviderMutation } from '@/store/api';
import { formatNumber } from '@/utils/format';

interface ProviderConfigFormProps {
  provider: ProviderView;
  descriptor: ProviderDescriptor;
}

/** Builds the minimal update: only fields the user actually changed. */
function buildPatch(
  provider: ProviderView,
  descriptor: ProviderDescriptor,
  f: { apiKey: string; removeKey: boolean; baseUrl: string; model: string; region: string },
): ProviderUpdateRequest {
  const patch: ProviderUpdateRequest = {};
  const key = f.apiKey.trim();
  if (key) patch.apiKey = key;
  else if (f.removeKey) patch.clearApiKey = true;

  const changed = (next: string, prev: string | null) => (next.trim() || null) !== (prev ?? null);
  if (descriptor.supportsBaseUrl && changed(f.baseUrl, provider.baseUrl)) patch.baseUrl = f.baseUrl.trim() || null;
  if (descriptor.supportsModel && changed(f.model, provider.model)) patch.model = f.model.trim() || null;
  if (descriptor.supportsRegion && changed(f.region, provider.region)) patch.region = f.region.trim() || null;
  return patch;
}

export function ProviderConfigForm({ provider, descriptor }: ProviderConfigFormProps) {
  const toast = useToast();
  const [updateProvider, { isLoading: saving }] = useUpdateProviderMutation();
  const [testProvider, { isLoading: testing }] = useTestProviderMutation();

  const [apiKey, setApiKey] = useState('');
  const [removeKey, setRemoveKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? '');
  const [model, setModel] = useState(provider.model ?? '');
  const [region, setRegion] = useState(provider.region ?? '');
  const [result, setResult] = useState<ProviderTestResponse | null>(null);

  const isMyMemory = descriptor.id === 'mymemory';
  const showKey = descriptor.requiresApiKey || isMyMemory;
  const fromEnv = provider.apiKeySource === 'env';
  const fields = { apiKey, removeKey, baseUrl, model, region };
  const patch = buildPatch(provider, descriptor, fields);
  const hasChanges = Object.keys(patch).length > 0;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChanges || saving) return;
    try {
      await updateProvider({ id: provider.id, patch }).unwrap();
      setApiKey('');
      setRemoveKey(false);
      toast.success(`${descriptor.name} saved`);
    } catch (err) {
      toast.error(`Could not save ${descriptor.name}`, errorMessage(err));
    }
  }

  async function runTest() {
    try {
      setResult(await testProvider(provider.id).unwrap());
    } catch (err) {
      setResult({ ok: false, latencyMs: 0, message: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-5">
      {!showKey && !descriptor.supportsBaseUrl && !descriptor.supportsModel && !descriptor.supportsRegion && (
        <p className="text-[13px] text-muted">Nothing to configure. This provider uses your AI model setup.</p>
      )}

      {showKey && (
        <Field
          label={isMyMemory ? 'Contact email (optional, raises quota)' : 'API key'}
          hint={
            fromEnv
              ? `Supplied by your server environment${descriptor.envKey ? ` (${descriptor.envKey})` : ''}. Saving a key here overrides it.`
              : 'Stored encrypted on your server. Enter a new value to replace it.'
          }
        >
          {(id) => (
            <div className="space-y-2">
              <Input
                id={id}
                type={isMyMemory ? 'email' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setRemoveKey(false);
                }}
                placeholder={provider.apiKeyPreview ?? 'Not set'}
                autoComplete="new-password"
                spellCheck={false}
                className="font-mono text-[13px]"
              />
              {provider.apiKeySource === 'settings' && (
                <div className="flex items-center gap-2 text-[12.5px]">
                  {removeKey ? (
                    <>
                      <span className="text-warning">The stored key will be removed when you save.</span>
                      <Button variant="ghost" size="sm" onClick={() => setRemoveKey(false)}>
                        Undo
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setRemoveKey(true)}>
                      Remove stored key
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </Field>
      )}

      {descriptor.supportsBaseUrl && (
        <Field label="Base URL" hint="Leave empty to use the default address.">
          {(id) => (
            <Input
              id={id}
              type="url"
              inputMode="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={descriptor.defaultBaseUrl ?? 'https://'}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Field>
      )}

      {descriptor.supportsModel && (
        <Field label="Model" hint="Leave empty to use the default model.">
          {(id) => (
            <Input
              id={id}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={descriptor.defaultModel ?? ''}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Field>
      )}

      {descriptor.supportsRegion && (
        <Field label="Region" hint="The Azure resource region, for example eastus.">
          {(id) => (
            <Input
              id={id}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="eastus"
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Field>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" loading={saving} disabled={!hasChanges}>
          Save changes
        </Button>
        <Button variant="outline" size="sm" icon={Activity} loading={testing} onClick={runTest}>
          Test connection
        </Button>
        <span className="text-[12px] text-subtle">Tests the saved configuration.</span>
      </div>

      {result && (
        <div role="status" className="flex flex-wrap items-start gap-2.5 rounded-xl border border-border bg-surface-2/60 p-3 animate-fade-in">
          {result.ok ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
          ) : (
            <XCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={result.ok ? 'success' : 'danger'}>{result.ok ? 'Connection OK' : 'Test failed'}</Badge>
              {result.latencyMs > 0 && <span className="text-[12px] tabular-nums text-subtle">{formatNumber(result.latencyMs)} ms</span>}
            </div>
            <p className="break-words text-[13px] text-fg">{result.message}</p>
            {result.sample && <p className="break-words text-[12.5px] italic text-muted">“{result.sample}”</p>}
          </div>
        </div>
      )}
    </form>
  );
}
