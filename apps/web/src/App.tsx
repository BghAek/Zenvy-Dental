import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SampleDesignPage } from './SampleDesignPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { LoginPage } from './pages/auth/LoginPage';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/sample" element={<SampleDesignPage />} />
          
          <Route
            path="/"
            element={
              <div className="p-8">
                <h1 className="text-2xl font-bold">Dashboard</h1>
                <p>Welcome to ZenvyDental Dashboard (Work in Progress)</p>
                <div className="flex gap-4 mt-4">
                  <a href="/login" className="text-primary hover:underline">Connexion</a>
                  <a href="/register" className="text-primary hover:underline">S'inscrire</a>
                </div>
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
