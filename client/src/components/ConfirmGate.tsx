import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function ConfirmGate({
  prompt,
  onConfirm,
  disabled,
}: {
  prompt?: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [value, setValue] = useState('');
  const ok =
    /^(yes|y|ಹೌದು|haudu|houdu)$/i.test(value.trim()) ||
    value.trim().toLowerCase() === 'yes';

  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm text-muted">{prompt || t('facilities.confirmPrompt')}</p>
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[12rem] flex-1 rounded-md border border-forest-800/20 bg-white px-3 py-2 text-ink"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={i18n.language === 'kn' ? 'ಹೌದು / yes' : 'yes / ಹೌದು'}
        />
        <button
          type="button"
          disabled={!ok || disabled}
          onClick={onConfirm}
          className="rounded-md bg-forest-800 px-4 py-2 font-medium text-leaf-50 disabled:opacity-40"
        >
          {t('facilities.book')}
        </button>
      </div>
    </div>
  );
}
