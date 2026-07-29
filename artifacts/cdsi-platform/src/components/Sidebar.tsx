import { Link, useLocation } from 'wouter';
import { UploadCloud, Activity, FileText, MessageSquare, Settings, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { t } from '../translations';
import { useCDSI } from '../context/CDSIContext';

export function Sidebar() {
  const [location] = useLocation();
  const { language } = useCDSI();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { href: '/', icon: UploadCloud, label: t('upload', language) },
    { href: '/intake', icon: Activity, label: t('analysis', language) },
    { href: '/report', icon: FileText, label: t('report', language) },
    { href: '/settings', icon: Settings, label: t('settings', language) },
  ];

  const isActive = (href: string) => {
    if (href === '/') return location === '/';
    return location.startsWith(href);
  };

  const NavLinks = () => (
    <>
      {navItems.map(item => {
        const active = isActive(item.href);
        return (
          <Link 
            key={item.href} 
            href={item.href} 
            onClick={() => setIsOpen(false)}
            className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
              active 
                ? 'bg-primary/10 text-primary font-medium relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-primary before:rounded-r-md dark:bg-primary/20' 
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/50'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <>
      {/* Mobile Toggle */}
      <button 
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 shadow-sm text-slate-900 dark:text-slate-100"
        onClick={() => setIsOpen(true)}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-[240px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col
        transform transition-transform duration-200 ease-in-out
        md:translate-x-0 md:static md:flex-shrink-0 md:h-screen
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 rounded-md" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">CDSI</h1>
          </div>
          <button className="md:hidden text-slate-500 dark:text-slate-400" onClick={() => setIsOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          <NavLinks />
        </nav>
      </div>
    </>
  );
}
