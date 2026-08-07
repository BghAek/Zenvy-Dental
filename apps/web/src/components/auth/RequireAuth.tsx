import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner, Alert, AlertDescription, Button } from '@zenvy/ui';
import { ApiError } from '@zenvy/shared';
import { useMe } from '../../lib/queries/session';

// Guards the dashboard shell: fetches GET /me and redirects unauthenticated
// callers to /login. A non-401 failure (server/network) shows an error instead
// of logging the user out, so a transient blip doesn't bounce them to login.
export function RequireAuth() {
  const { data, isLoading, isError, error, refetch } = useMe();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (isError) {
    if (error instanceof ApiError && error.status === 401) {
      return <Navigate to="/login" replace />;
    }
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>
            Impossible de charger votre session. Veuillez réessayer.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => refetch()}>
          Réessayer
        </Button>
      </div>
    );
  }

  // If user is authenticated but has no clinic, redirect to onboarding — unless
  // they are already in the wizard, which lives behind this same guard: sending
  // it back to itself loops and renders nothing at all.
  if (data && !data.clinic && !location.pathname.startsWith('/onboarding')) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
