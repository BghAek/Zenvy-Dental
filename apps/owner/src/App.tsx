import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { OwnerLayout } from './components/layout/OwnerLayout';
import { ClientsPage } from './pages/ClientsPage';
import { ErrorsPage } from './pages/ErrorsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { SupportThreadsPage } from './pages/SupportThreadsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<OwnerLayout />}>
            <Route index element={<Navigate to="/clients" replace />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="errors" element={<ErrorsPage />} />
            <Route path="onboarding-requests" element={<OnboardingPage />} />
            <Route path="support-threads" element={<SupportThreadsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
