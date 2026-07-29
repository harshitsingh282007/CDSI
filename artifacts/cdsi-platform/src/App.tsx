import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch } from 'wouter';
import { CDSIProvider } from './context/CDSIContext';
import { Sidebar } from './components/Sidebar';
import Upload from './pages/Upload';
import Intake from './pages/Intake';
import Processing from './pages/Processing';
import Report from './pages/Report';
import Settings from './pages/Settings';
import { ThemeProvider } from './components/ThemeProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="p-4 bg-teal-500/10 border border-teal-500/30 rounded-2xl text-teal-400">
        <h1 className="text-4xl font-extrabold font-display">404</h1>
      </div>
      <h2 className="text-xl font-semibold text-white">Page Not Found</h2>
      <p className="text-sm text-slate-400 max-w-sm">The clinical page or route you requested does not exist or has moved.</p>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#090D16] text-slate-100 font-sans selection:bg-teal-500/30 selection:text-teal-200 relative overflow-x-hidden">
      {/* Background Ambient Glow Orbs */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-cyan-500/08 rounded-full blur-3xl pointer-events-none translate-y-1/2" />

      <Sidebar />
      <main className="flex-1 w-full flex justify-center pt-14 md:pt-0">
        <div className="w-full max-w-[1280px] px-4 md:px-8 py-6 min-h-screen overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

function AppRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Upload} />
        <Route path="/intake" component={Intake} />
        <Route path="/processing" component={Processing} />
        <Route path="/report" component={Report} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CDSIProvider>
        <ThemeProvider defaultTheme="dark">
          <AppRouter />
        </ThemeProvider>
      </CDSIProvider>
    </QueryClientProvider>
  );
}

export default App;
