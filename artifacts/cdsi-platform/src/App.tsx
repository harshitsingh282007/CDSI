import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { CDSIProvider } from './context/CDSIContext';
import { Sidebar } from './components/Sidebar';
import { AuthGate } from './components/AuthGate';
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
    <div className="flex flex-col items-center justify-center h-full">
      <h1 className="text-3xl font-bold text-[#111827]">404 - Not Found</h1>
      <p className="text-[#6B7280] mt-2">The page you're looking for doesn't exist.</p>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#FAFAFA] dark:bg-slate-900 transition-colors font-sans text-slate-900 dark:text-slate-100">
      <Sidebar />
      <main className="flex-1 w-full flex justify-center">
        <div className="w-full max-w-[1100px] px-4 md:px-8 py-6 h-screen overflow-y-auto">
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
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <CDSIProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <AuthGate>
              <AppRouter />
            </AuthGate>
          </WouterRouter>
        </CDSIProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
