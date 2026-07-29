import { AuthGate } from '../components/AuthGate';

export default function Login() {
  return (
    <AuthGate>
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4 text-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Access Granted ✓</h2>
        <p className="text-sm text-slate-500">You are successfully authenticated into CDSI Platform.</p>
        <a href="/" className="px-5 py-2.5 bg-teal-600 text-white font-medium text-sm rounded-xl hover:bg-teal-700 transition-colors shadow-sm">
          Proceed to Dashboard →
        </a>
      </div>
    </AuthGate>
  );
}
