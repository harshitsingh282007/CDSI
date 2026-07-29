import { useState } from 'react';
import { useLocation } from 'wouter';
import { ShieldCheck, Stethoscope, ArrowRight, Activity, Cpu, Sparkles } from 'lucide-react';
import Antigravity from '../components/Antigravity';
import ClickSpark from '../components/ClickSpark';

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'clinician' | 'researcher' | 'guest'>('clinician');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    sessionStorage.setItem('cdsi_user_role', role);
    setLocation('/');
  };

  return (
    <ClickSpark sparkColor="#10b981" sparkSize={12} sparkRadius={20} sparkCount={10}>
      <div className="relative w-full min-h-screen bg-[#090D16] flex items-center justify-center p-4 overflow-hidden select-none">
        {/* Antigravity Background Particle Ring */}
        <div className="absolute inset-0 pointer-events-none opacity-60">
          <Antigravity
            count={220}
            magnetRadius={160}
            ringRadius={120}
            waveSpeed={0.5}
            waveAmplitude={1.5}
            particleSize={2.5}
            color="#0D9488"
            autoAnimate={true}
          />
        </div>

        {/* Floating Glowing Orbs */}
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Login Card */}
        <div className="relative z-10 w-full max-w-md cyber-card-glow rounded-3xl p-8 md:p-10 flex flex-col gap-6 shadow-2xl border border-teal-500/30">
          {/* Header Branding */}
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-500 via-cyan-400 to-emerald-400 p-[1.5px] shadow-xl shadow-teal-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-teal-300">
                <Cpu className="w-7 h-7 animate-pulse text-teal-400" />
              </div>
            </div>

            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-extrabold text-white font-display tracking-tight">CDSI</h1>
                <span className="px-2 py-0.5 bg-teal-500/20 text-teal-300 text-[10px] font-mono font-bold rounded border border-teal-500/40">AI v2.4</span>
              </div>
              <p className="text-xs text-teal-400 font-mono mt-1 tracking-wider uppercase font-semibold">
                Clinical Decision Support System
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-mono font-semibold text-slate-300 mb-2 uppercase">Physician Email / License ID</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@hospital.org"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-teal-500/60"
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-semibold text-slate-300 mb-2 uppercase">Role Category</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'clinician', label: 'Clinician' },
                  { id: 'researcher', label: 'Researcher' },
                  { id: 'guest', label: 'Quick Guest' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setRole(item.id as any)}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                      role === item.id
                        ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 shadow-md shadow-teal-500/10'
                        : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="mt-2 w-full py-3.5 bg-gradient-to-r from-teal-500 via-cyan-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-extrabold text-sm rounded-xl shadow-xl shadow-teal-500/20 flex items-center justify-center gap-2 animate-shimmer transition-all cursor-pointer"
            >
              <span>Enter Clinical Platform</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Demo Access */}
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>HIPAA Compliant Session</span>
            </div>
            <button
              type="button"
              onClick={() => setLocation('/')}
              className="text-teal-400 hover:text-teal-300 font-semibold underline underline-offset-4 cursor-pointer"
            >
              Instant Access →
            </button>
          </div>
        </div>
      </div>
    </ClickSpark>
  );
}
