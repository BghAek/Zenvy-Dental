import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom';
import { Building2, Bot, Users, CreditCard } from 'lucide-react';
import { useMe } from '../../lib/queries/session';
import { Spinner } from '@zenvy/ui';

export function SettingsLayout() {
  const { data: me, isLoading } = useMe();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!me || !me.clinic) {
    return <Navigate to="/" replace />;
  }

  const isOwner = me.user.role === 'CLINIC_OWNER';

  // Sub-routes protection
  if (!isOwner && (location.pathname.endsWith('/staff') || location.pathname.endsWith('/subscription'))) {
    return <Navigate to="/settings/profile" replace />;
  }

  const navItems = [
    {
      label: 'Profil du cabinet',
      to: '/settings/profile',
      icon: Building2,
      description: 'Coordonnées et options de localisation',
    },
    {
      label: 'Assistant IA',
      to: '/settings/ai',
      icon: Bot,
      description: 'Instructions, services, horaires et FAQ',
    },
    ...(isOwner
      ? [
          {
            label: 'Équipe',
            to: '/settings/staff',
            icon: Users,
            description: 'Gestion des membres et invitations',
          },
          {
            label: 'Abonnement',
            to: '/settings/subscription',
            icon: CreditCard,
            description: 'Facturation, période d’essai et Stripe',
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-muted-foreground">
          Gérez les informations de votre cabinet et configurez l'assistant virtuel.
        </p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Left Sub-Navigation */}
        <aside className="w-full md:w-64 shrink-0">
          <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors shrink-0 md:shrink ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`
                }
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <div className="text-left hidden md:block">
                  <div className="font-semibold leading-tight">{item.label}</div>
                  <div className="text-[11px] font-normal opacity-80 mt-0.5 max-w-[180px] truncate">
                    {item.description}
                  </div>
                </div>
                <span className="md:hidden font-semibold">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Right Settings Content */}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
