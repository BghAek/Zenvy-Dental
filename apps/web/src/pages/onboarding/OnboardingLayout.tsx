import { Outlet, Navigate } from 'react-router-dom';
import { useMe } from '../../lib/queries/session';
import { Spinner } from '@zenvy/ui';

export function OnboardingLayout() {
  const { data: me, isLoading } = useMe();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  // If they already have a completed clinic, send them to dashboard
  if (me?.clinic?.onboardingStatus === 'COMPLETED') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="sticky top-0 z-40 w-full border-b bg-background">
        <div className="flex h-16 items-center px-4 md:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <span className="font-bold">Z</span>
            </div>
            <span className="text-lg font-bold">ZenvyDental</span>
          </div>
        </div>
      </header>
      
      <main className="flex-1 px-4 py-8 md:px-8 md:py-12">
        <div className="mx-auto max-w-2xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
