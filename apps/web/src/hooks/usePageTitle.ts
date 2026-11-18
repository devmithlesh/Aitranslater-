import { useEffect } from 'react';

const SITE_NAME = 'Verba';

/**
 * Sets the browser tab title (and, optionally, the meta description) for the current page, so each
 * route has its own title in tabs, history and search results. The description is restored on unmount.
 */
export function usePageTitle(title: string, description?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
  }, [title]);

  useEffect(() => {
    if (!description) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) return;
    const previous = meta.content;
    meta.content = description;
    return () => {
      meta.content = previous;
    };
  }, [description]);
}
