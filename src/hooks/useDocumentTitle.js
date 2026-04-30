import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const BASE_TITLE = 'Nikczemny Krzemuch';

export function useDocumentTitle(subtitle) {
  const { t } = useTranslation();
  const appName = t('common.appName', BASE_TITLE);

  const parts = Array.isArray(subtitle)
    ? subtitle.filter(Boolean)
    : (subtitle ? [subtitle] : []);

  const key = parts.join('|');

  useEffect(() => {
    const prev = document.title;
    document.title = parts.length ? `${appName} | ${parts.join(' | ')}` : appName;
    return () => { document.title = prev; };
  }, [key, appName]);
}
