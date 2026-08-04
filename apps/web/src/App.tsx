import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { InboxPage } from './pages/inbox/InboxPage';
import { AppointmentListPage } from './pages/appointments/AppointmentListPage';
import { AppointmentCreatePage } from './pages/appointments/AppointmentCreatePage';
import { AppointmentDetailPage } from './pages/appointments/AppointmentDetailPage';
import { AppointmentEditPage } from './pages/appointments/AppointmentEditPage';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { ProfileSettings } from './pages/settings/ProfileSettings';
import { AiSettings } from './pages/settings/AiSettings';
import { StaffSettings } from './pages/settings/StaffSettings';
import { SubscriptionSettings } from './pages/settings/SubscriptionSettings';
import { OnboardingLayout } from './pages/onboarding/OnboardingLayout';
import { Step1ClinicInfo } from './pages/onboarding/Step1ClinicInfo';
import { Step2WhatsApp } from './pages/onboarding/Step2WhatsApp';
import { Step3AiConfig } from './pages/onboarding/Step3AiConfig';

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
            <Route path="/onboarding" element={<OnboardingLayout />}>
              <Route index element={<Step1ClinicInfo />} />
              <Route path="whatsapp" element={<Step2WhatsApp />} />
              <Route path="ai-config" element={<Step3AiConfig />} />
            </Route>

            <Route element={<DashboardLayout />}>
              <Route path="/" element={<PlaceholderPage title="Tableau de bord" description="Bienvenue sur votre espace ZenvyDental." />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/patients" element={<PatientListPage />} />
              <Route path="/patients/new" element={<PatientCreatePage />} />
              <Route path="/patients/:id" element={<PatientDetailPage />} />
              <Route path="/patients/:id/edit" element={<PatientEditPage />} />
              <Route path="/appointments" element={<AppointmentListPage />} />
              <Route path="/appointments/new" element={<AppointmentCreatePage />} />
              <Route path="/appointments/:id" element={<AppointmentDetailPage />} />
              <Route path="/appointments/:id/edit" element={<AppointmentEditPage />} />
              
              <Route path="/settings" element={<SettingsLayout />}>
                <Route index element={<Navigate to="/settings/profile" replace />} />
                <Route path="profile" element={<ProfileSettings />} />
                <Route path="ai" element={<AiSettings />} />
                <Route path="staff" element={<StaffSettings />} />
                <Route path="subscription" element={<SubscriptionSettings />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

