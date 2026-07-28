import { CheckCircle2, XCircle, Globe, Database, ShieldAlert, Monitor } from 'lucide-react';
import { useCDSI } from '../context/CDSIContext';
import { LANGUAGES, t } from '../translations';
import { useHealthCheck, getHealthCheckQueryKey } from '@workspace/api-client-react';
import { ThemeToggle } from '../components/ThemeToggle';

export default function Settings() {
  const { language, setLanguage } = useCDSI();

  const { isError, isLoading } = useHealthCheck({
    query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 10000 }
  });

  const apiStatus = isLoading ? 'checking' : isError ? 'down' : 'up';

  return (
    <div className="w-full max-w-3xl flex flex-col gap-10 pt-6 pb-20">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded-lg shadow-sm" />
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">{t('settingsTitle', language)}</h1>
        </div>
        <p className="text-slate-500 dark:text-slate-400">{t('settingsSubtitle', language)}</p>
      </div>

      {/* Appearance Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <Monitor className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Appearance</h2>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-medium text-slate-900 dark:text-slate-100">Dark Mode</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">Toggle between light and dark themes.</span>
          </div>
          <ThemeToggle showText={true} />
        </div>
      </section>

      {/* Language Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <Globe className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('languageSection', language)}</h2>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-4">{t('appLanguage', language)}</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                  language === lang.code
                    ? 'border-primary bg-primary/10 text-primary shadow-sm dark:bg-primary/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <span className="text-base">{lang.flag}</span>
                <span className="truncate text-xs">{lang.code}</span>
              </button>
            ))}
          </div>
          {language !== 'English' && (
            <div className="mt-4 flex items-center gap-2 text-xs text-primary bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-lg px-4 py-2.5">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Active: <strong>{language}</strong> - {t('appLanguage', language)}</span>
            </div>
          )}
        </div>
      </section>

      {/* System Status Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <Database className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('systemStatus', language)}</h2>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-medium text-slate-900 dark:text-slate-100">{t('apiConnection', language)}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">{t('apiBackend', language)}</span>
            </div>
            <div className="flex items-center gap-2">
              {apiStatus === 'checking' && (
                <span className="px-3 py-1 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm font-medium flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 animate-pulse" />
                  {t('checking', language)}
                </span>
              )}
              {apiStatus === 'up' && (
                <span className="px-3 py-1 rounded-full bg-primary/10 dark:bg-primary/20 border border-primary text-primary text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />{t('online', language)}
                </span>
              )}
              {apiStatus === 'down' && (
                <span className="px-3 py-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400 text-sm font-medium flex items-center gap-2">
                  <XCircle className="w-4 h-4" />{t('offline', language)}
                </span>
              )}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-medium text-slate-900 dark:text-slate-100">{t('jobProcessor', language)}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">{t('jobProcessorDesc', language)}</span>
            </div>
            <div className="flex items-center gap-2">
              {apiStatus === 'up' ? (
                <span className="px-3 py-1 rounded-full bg-primary/10 dark:bg-primary/20 border border-primary text-primary text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />{t('active', language)}
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400 text-sm font-medium flex items-center gap-2">
                  <XCircle className="w-4 h-4" />{t('unreachable', language)}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Compliance Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <ShieldAlert className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('compliance', language)}</h2>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-sm text-slate-500 dark:text-slate-400 flex flex-col gap-4 leading-relaxed">
          <p>
            <strong className="text-slate-900 dark:text-slate-100">Clinical Decision Support Intelligence (CDSI)</strong> is an AI-powered analytical platform that transforms medical documents into structured, reviewable clinical reports — giving healthcare professionals a comprehensive decision-support companion.
          </p>
          <p>
            <strong>Disclaimer:</strong> {t('disclaimer', language)}
          </p>
          <p>Version: 1.0.0-beta · Engine: CDSI Clinical Intelligence Engine</p>
        </div>
      </section>
    </div>
  );
}
