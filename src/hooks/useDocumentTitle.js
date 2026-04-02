import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const BASE_TITLE = 'Nikczemny Krzemuch';

export function useDocumentTitle(subtitle) {
  const { t } = useTranslation();
  const appName = t('common.appName', BASE_TITLE);

  useEffect(() => {
    const prev = document.title;
    document.title = subtitle ? `${subtitle} — ${appName}` : appName;
    return () => { document.title = prev; };
  }, [subtitle, appName]);
}
