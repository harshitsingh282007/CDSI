import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch } from 'wouter';
import { CDSIProvider } from './context/CDSIContext';
import { Sidebar } from './components/Sidebar';
import Upload from './pages/Upload';
import Intake from './pages/Intake';
import Processing from './pages/Processing';
import Report from './pages/Report';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { ThemeProvider } from './components/ThemeProvider';
import ClickSpark from './components/ClickSpark';

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
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">404 - Page Not Found</h1>
      <p className="text-slate-500 dark:text-slate-400 text-sm">The requested page does not exist or has moved.</p>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ClickSpark sparkColor="#10b981" sparkSize={10} sparkRadius={16} sparkCount={8}>
      <div className="flex min-h-screen bg-[#FAFAFA] dark:bg-slate-900 transition-colors font-sans text-slate-900 dark:text-slate-100">
        <Sidebar />
        <main className="flex-1 w-full flex justify-center">
          <div className="w-full max-w-[1100px] px-4 md:px-8 py-6 h-screen overflow-y-auto">
            {children}
          </div>
        </main>
      </div>
    </ClickSpark>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="*">
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
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CDSIProvider>
        <ThemeProvider defaultTheme="light">
          <AppRouter />
        </ThemeProvider>
      </CDSIProvider>
    </QueryClientProvider>
  );
}

export default App;
