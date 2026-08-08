import { Outlet, NavLink } from 'react-router-dom';
import { Users, AlertTriangle, UserPlus, MessageCircle } from 'lucide-react';
import { cn } from '@zenvy/ui';

export function OwnerLayout() {
  const navItems = [
    { to: '/clients', icon: Users, label: 'Clients' },
    { to: '/errors', icon: AlertTriangle, label: 'Erreurs' },
    { to: '/onboarding-requests', icon: UserPlus, label: 'Onboarding' },
    { to: '/support-threads', icon: MessageCircle, label: 'Support' },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <span className="font-bold text-lg text-primary">Zenvy Ops</span>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
