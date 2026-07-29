import { Link, useLocation } from 'wouter';
import { UploadCloud, Activity, FileText, Settings, Menu, X, ShieldCheck, Sparkles, Globe, Cpu } from 'lucide-react';
import { useState } from 'react';
import { t } from '../translations';
import { useCDSI } from '../context/CDSIContext';

export function Sidebar() {
  const [location] = useLocation();
  const { language, setLanguage } = useCDSI();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { href: '/', icon: UploadCloud, label: t('upload', language), code: '01', desc: 'Document Prep' },
    { href: '/intake', icon: Activity, label: t('analysis', language), code: '02', desc: 'Clinical Screening' },
    { href: '/report', icon: FileText, label: t('report', language), code: '03', desc: 'AI Diagnosis' },
    { href: '/settings', icon: Settings, label: t('settings', language), code: '04', desc: 'System Config' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return location === '/';
    return location.startsWith(href);
  };

  const NavLinks = () => (
    <div className="space-y-2">
      {navItems.map(item => {
        const active = isActive(item.href);
        return (
          <Link 
            key={item.href} 
            href={item.href} 
            onClick={() => setIsOpen(false)}
            className={`group relative flex items-center justify-between px-3.5 py-3 rounded-xl transition-all duration-200 ${
              active 
                ? 'bg-gradient-to-r from-teal-500/15 via-cyan-500/10 to-transparent border border-teal-500/30 text-teal-300 shadow-lg shadow-teal-500/10 font-semibold' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className={`p-2 rounded-lg transition-colors ${
                active ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-800/50 text-slate-400 group-hover:text-slate-200 group-hover:bg-slate-800'
              }`}>
                <item.icon className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium tracking-wide">{item.label}</span>
                <span className="text-[10px] text-slate-500 group-hover:text-slate-400 tracking-wider font-mono">{item.desc}</span>
              </div>
            </div>
            
            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
              active ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'text-slate-600 group-hover:text-slate-400'
            }`}>
              {item.code}
            </span>

            {active && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-teal-400 rounded-r-full shadow-[0_0_10px_#0D9488]" />
            )}
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Mobile Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-teal-500/15 rounded-lg border border-teal-500/30 text-teal-400">
            <Cpu className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg text-white font-display tracking-tight">CDSI <span className="text-teal-400 text-xs font-mono font-normal">v2.4</span></span>
        </div>

        <button 
          className="p-2 bg-slate-900 rounded-lg border border-slate-800 text-slate-300 hover:text-white"
          onClick={() => setIsOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-[260px] bg-slate-950/95 backdrop-blur-2xl border-r border-slate-800/80 flex flex-col justify-between
        transform transition-transform duration-300 ease-out
        md:translate-x-0 md:static md:flex-shrink-0 md:h-screen
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Top Branding */}
        <div>
          <div className="p-5 flex items-center justify-between border-b border-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-600 via-cyan-500 to-emerald-400 p-[1px] shadow-lg shadow-teal-500/20">
                  <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center text-teal-300">
                    <Cpu className="w-5 h-5 animate-pulse" />
                  </div>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-950 animate-neon-pulse" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-xl font-extrabold text-white font-display tracking-tight">CDSI</h1>
                  <span className="px-1.5 py-0.2 bg-teal-500/20 text-teal-300 text-[10px] font-mono font-bold rounded border border-teal-500/30">AI 2.4</span>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Clinical Intelligence Platform</span>
              </div>
            </div>
            <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setIsOpen(false)}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Items */}
          <div className="p-4">
            <div className="px-2 pb-3 text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-widest">
              Navigation Engine
            </div>
            <NavLinks />
          </div>
        </div>

        {/* Bottom System Status Widget */}
        <div className="p-4 border-t border-slate-800/60 space-y-3">
          {/* Quick Language Toggle */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-900/80 border border-slate-800/80 rounded-xl">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Globe className="w-3.5 h-3.5 text-teal-400" />
              <span>Language</span>
            </div>
            <select 
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-transparent text-xs text-teal-300 font-medium border-none focus:outline-none cursor-pointer pr-1"
            >
              <option value="English" className="bg-slate-900 text-slate-200">English</option>
              <option value="Hindi" className="bg-slate-900 text-slate-200">Hindi (हिंदी)</option>
              <option value="Punjabi" className="bg-slate-900 text-slate-200">Punjabi (ਪੰਜਾਬੀ)</option>
              <option value="Bengali" className="bg-slate-900 text-slate-200">Bengali (বাংলা)</option>
              <option value="Spanish" className="bg-slate-900 text-slate-200">Spanish</option>
            </select>
          </div>

          {/* Live Node Badge */}
          <div className="px-3 py-2.5 bg-gradient-to-r from-emerald-950/40 to-slate-900/60 border border-emerald-500/20 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-mono text-emerald-300 font-medium">Node Online</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Render Cloud</span>
          </div>
        </div>
      </div>
    </>
  );
}
