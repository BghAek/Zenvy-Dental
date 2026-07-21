import { Suspense, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ErrorBoundary } from "./ErrorBoundary";
import { Spinner } from "@zenvy/ui";

export function DashboardLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden md:block h-full">
        <Sidebar />
      </div>

      {/* Mobile drawer: the sidebar is hidden below md, so the header hamburger opens this. */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-foreground/50"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0">
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0">
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-background md:bg-muted/30 p-4 md:p-8">
          <ErrorBoundary>
            <Suspense fallback={
              <div className="flex items-center justify-center h-full">
                <Spinner className="h-8 w-8" />
              </div>
            }>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
