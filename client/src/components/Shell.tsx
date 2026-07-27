import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from './LanguageToggle';
import { useAuth } from '../auth/AuthContext';

export function Shell({
  children,
  links,
}: {
  children: React.ReactNode;
  links: { to: string; label: string }[];
}) {
  const { t } = useTranslation();
  const { logout, user } = useAuth();

  return (
    <div className="bg-atmosphere min-h-dvh text-leaf-50">
      <header className="border-b border-white/10 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link to="/" className="font-display text-xl tracking-tight text-leaf-100 sm:text-2xl">
            {t('brand')}
          </Link>
          <div className="flex items-center gap-4">
            <LanguageToggle />
            {user && (
              <button
                type="button"
                onClick={() => void logout()}
                className="text-sm text-leaf-100/80 hover:text-white"
              >
                {t('nav.logout')}
              </button>
            )}
          </div>
        </div>
        {links.length > 0 && (
          <nav className="mx-auto mt-3 flex max-w-6xl gap-1 overflow-x-auto pb-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-leaf-100/85 hover:bg-white/10"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
