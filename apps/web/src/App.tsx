import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SampleDesignPage } from './SampleDesignPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { LoginPage } from './pages/auth/LoginPage';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { RequireAuth } from './components/auth/RequireAuth';
import { EmptyState, Button } from '@zenvy/ui';
import { Settings } from 'lucide-react';
import { PatientListPage } from './pages/patients/PatientListPage';
import { PatientDetailPage } from './pages/patients/PatientDetailPage';
import { PatientCreatePage } from './pages/patients/PatientCreatePage';
import { PatientEditPage } from './pages/patients/PatientEditPage';

const queryClient = new QueryClient();

// Placeholder component for dashboard routes
function PlaceholderPage({ title, description }: { title: string, description: string }) {
  return (
    <div className="bg-background rounded-lg border border-border">
      <EmptyState 
        icon={Settings} 
        title={title} 
        description={description} 
        action={<Button>Nouvelle action</Button>}
      />
    </div>
  );
}

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
          
          <Route element={<RequireAuth />}>
            <Route element={<DashboardLayout />}>
            <Route path="/" element={<PlaceholderPage title="Tableau de bord" description="Bienvenue sur votre espace ZenvyDental." />} />
            <Route path="/inbox" element={<PlaceholderPage title="Messages" description="Vos conversations avec les patients s'afficheront ici." />} />
            <Route path="/patients" element={<PatientListPage />} />
            <Route path="/patients/new" element={<PatientCreatePage />} />
            <Route path="/patients/:id" element={<PatientDetailPage />} />
            <Route path="/patients/:id/edit" element={<PatientEditPage />} />
            <Route path="/appointments" element={<PlaceholderPage title="Rendez-vous" description="Consultez et planifiez vos rendez-vous." />} />
            <Route path="/settings" element={<PlaceholderPage title="Paramètres" description="Configurez votre clinique et l'assistant IA." />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
