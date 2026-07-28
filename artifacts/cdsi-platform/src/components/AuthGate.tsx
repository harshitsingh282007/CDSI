// Refined minimalist authentication gate
import { useState, useEffect } from "react";
import { Lock, ArrowRight, Linkedin } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState("");
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const expectedToken = import.meta.env.VITE_ENTRY_TOKEN || "1234567812345678";

  useEffect(() => {
    const verified = sessionStorage.getItem("cdsi_access_token_verified");
    if (verified === "true") {
      setIsAuthorized(true);
    } else {
      setIsAuthorized(false);
    }
  }, []);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    setErrorMsg("");

    if (token.trim() === expectedToken) {
      sessionStorage.setItem("cdsi_access_token_verified", "true");
      sessionStorage.setItem("cdsi_access_token", token.trim());
      setIsAuthorized(true);
    } else {
      setErrorMsg("Invalid token. Please try again.");
    }
  };

  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (isAuthorized) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-slate-900 transition-colors flex flex-col justify-center items-center p-4 relative font-sans text-slate-900 dark:text-slate-100">
      {/* Top Right Controls */}
      <div className="absolute top-6 right-6 flex items-center gap-3">
        <ThemeToggle />
        <a
          href="https://www.linkedin.com/in/harshit7820/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors bg-white dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm"
        >
          <Linkedin className="w-3.5 h-3.5 text-[#0A66C2] dark:text-[#2d83db]" />
          <span>Connect on LinkedIn</span>
        </a>
      </div>

      <div className="w-full max-w-[360px]">
        {/* Minimalist Header with Logo */}
        <div className="flex flex-col items-center mb-8 text-center">
          <img src="/logo.png" alt="CDSI Logo" className="w-14 h-14 mb-4 rounded-xl shadow-sm" />
          <h1 className="text-xl font-semibold tracking-tight">CDSI Platform</h1>
          <p className="text-2xl sm:text-3xl font-handwritten text-primary mt-3 -rotate-2 whitespace-nowrap">
            The universal passport for your health.
          </p>
        </div>

        {/* Minimalist Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl p-8 shadow-sm">
          <form onSubmit={handleVerify} className="space-y-5">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Access Token"
                required
                className="w-full bg-slate-50/50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-primary dark:focus:border-primary rounded-lg pl-9 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none transition-all text-center tracking-wider"
              />
            </div>

            {errorMsg && (
              <p className="text-[11px] font-medium text-red-600 text-center leading-normal">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={!token}
              className="w-full bg-primary hover:bg-primary/90 disabled:bg-slate-100 disabled:text-slate-400 text-white font-medium text-sm rounded-lg py-2.5 px-4 transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              Enter Platform
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
