import { AUTO_LANGUAGE } from '@verba/shared';
import { ArrowRight, Languages } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Card, EmptyState, ErrorState, LanguageSelect, PageHeader, PrivacyNotice, TextEditor } from '@/components/ui';
import { CreditsBadge } from '@/features/credits/CreditsBadge';
import { LimitReachedCard } from '@/features/credits/LimitReachedCard';
import { canSubmit } from '@/features/tools/text';
import { isNotConfiguredError, NotConfiguredCard } from '@/features/variants/NotConfiguredCard';
import { ResultsSkeleton } from '@/features/variants/ResultsSkeleton';
import { VariantResults } from '@/features/variants/VariantResults';
import { useMeQuery, useTranslateVariantsMutation, api, type AppError } from '@/store/api';
import { useAppDispatch } from '@/store';

const CREDIT_LIMIT_CODE = 'CREDIT_LIMIT_REACHED';

export default function VariantTranslatorPage() {
  const [text, setText] = useState('');
  const [sourceLang, setSourceLang] = useState<string>(AUTO_LANGUAGE);
  const [targetLang, setTargetLang] = useState('en');
  const [translateVariants, { data, error, isLoading, originalArgs }] = useTranslateVariantsMutation();
  const me = useMeQuery();
  const canRun = canSubmit(text) && !isLoading;
  const limitReached = (error as AppError | undefined)?.code === CREDIT_LIMIT_CODE;

  // A failed run does not invalidate the cached credits, so re-read them once when the limit is hit.
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (limitReached) dispatch(api.util.invalidateTags(['Me']));
  }, [limitReached, dispatch]);

  const run = () => {
    if (canRun) void translateVariants({ text, sourceLang, targetLang });
  };

  let output: ReactNode;
  if (isLoading) {
    output = <ResultsSkeleton />;
  } else if (limitReached) {
    output = <LimitReachedCard resetsAt={me.data?.credits.resetsAt} />;
  } else if (error) {
    output = isNotConfiguredError(error) ? <NotConfiguredCard /> : <ErrorState error={error} onRetry={run} />;
  } else if (data) {
    // Label results with the language they were requested in, not the dropdown's current value.
    output = <VariantResults result={data} targetLang={originalArgs?.targetLang ?? targetLang} />;
  } else {
    output = (
      <Card>
        <EmptyState
          icon={Languages}
          title="Type something to start"
          description='Try: "hi tum kese ho"'
        />
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title="Translator"
        description="Type in any language — get English in every tone."
        icon={<Languages size={20} strokeWidth={2} />}
        actions={<CreditsBadge />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0">
          <TextEditor
            aria-label="Text to translate"
            value={text}
            onChange={setText}
            onSubmit={run}
            minRows={10}
            placeholder="Type or paste text in any language…"
            header={
              <div className="flex w-full items-center gap-2">
                <LanguageSelect
                  label="Source language"
                  value={sourceLang}
                  onChange={setSourceLang}
                  allowAuto
                  className="min-w-0 flex-1"
                />
                <ArrowRight size={16} aria-hidden className="shrink-0 text-subtle" />
                <LanguageSelect label="Target language" value={targetLang} onChange={setTargetLang} className="min-w-0 flex-1" />
              </div>
            }
            footer={
              <Button icon={Languages} onClick={run} disabled={!canRun} loading={isLoading}>
                Translate
              </Button>
            }
          />
          <PrivacyNotice />
        </div>

        <div aria-live="polite" className="min-w-0">
          {output}
        </div>
      </div>
    </div>
  );
}
