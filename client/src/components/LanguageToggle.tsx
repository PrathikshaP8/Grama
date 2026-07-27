import { useTranslation } from 'react-i18next';

export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const next = i18n.language === 'kn' ? 'en' : 'kn';

  return (
    <button
      type="button"
      className="text-sm font-medium tracking-wide text-leaf-100/90 underline-offset-4 hover:underline"
      aria-label={t('common.language')}
      onClick={() => {
        void i18n.changeLanguage(next);
        localStorage.setItem('gramcare-lang', next);
      }}
    >
      {i18n.language === 'kn' ? 'English' : 'ಕನ್ನಡ'}
    </button>
  );
}
