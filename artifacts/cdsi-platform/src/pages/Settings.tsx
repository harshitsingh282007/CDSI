import { CheckCircle2, XCircle, Globe, Database, Monitor, Cpu, Sparkles } from 'lucide-react';
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
    <div className="w-full max-w-4xl flex flex-col gap-8 py-4">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-500/20 text-teal-300 rounded-xl border border-teal-500/40">
            <Cpu className="w-6 h-6 animate-pulse" />
          </div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight text-white">{t('settingsTitle', language)}</h1>
        </div>
        <p className="text-slate-400 text-sm max-w-xl">{t('settingsSubtitle', language)}</p>
      </div>

      {/* Appearance Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Monitor className="w-4 h-4 text-teal-400" />
          <h2 className="text-sm font-mono font-bold text-slate-300 uppercase tracking-wider">Appearance Engine</h2>
        </div>
        <div className="cyber-card rounded-2xl p-6 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-semibold text-white text-sm">Dark Cyber Mode</span>
            <span className="text-xs text-slate-400">Toggle HackMIT 2025 cyber-luminous dark theme.</span>
          </div>
          <ThemeToggle showText={true} />
        </div>
      </section>

      {/* Language Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Globe className="w-4 h-4 text-teal-400" />
          <h2 className="text-sm font-mono font-bold text-slate-300 uppercase tracking-wider">{t('languageSection', language)}</h2>
        </div>
        <div className="cyber-card rounded-2xl p-6 space-y-4">
          <label className="block text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">{t('appLanguage', language)}</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  language === lang.code
                    ? 'border-teal-500/50 bg-teal-500/20 text-teal-300 shadow-lg shadow-teal-500/10'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span className="text-base">{lang.flag}</span>
                <span className="truncate">{lang.code}</span>
              </button>
            ))}
          </div>
          {language !== 'English' && (
            <div className="flex items-center gap-2 text-xs text-teal-300 bg-teal-500/10 border border-teal-500/30 rounded-xl px-4 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400 flex-shrink-0" />
              <span>Active Language: <strong>{language}</strong></span>
            </div>
          )}
        </div>
      </section>

      {/* System Status Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Database className="w-4 h-4 text-teal-400" />
          <h2 className="text-sm font-mono font-bold text-slate-300 uppercase tracking-wider">{t('systemStatus', language)}</h2>
        </div>
        <div className="cyber-card rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-semibold text-white text-sm">{t('apiConnection', language)}</span>
              <span className="text-xs text-slate-400">{t('apiBackend', language)}</span>
            </div>
            <div className="flex items-center gap-2">
              {apiStatus === 'checking' && (
                <span className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs font-mono font-semibold flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  {t('checking', language)}
                </span>
              )}
              {apiStatus === 'up' && (
                <span className="px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />{t('online', language)}
                </span>
              )}
              {apiStatus === 'down' && (
                <span className="px-3 py-1 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-mono font-bold flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-400" />{t('offline', language)}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
