import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Calendar, Settings, MessageSquare } from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Tableau de bord", to: "/" },
  { icon: MessageSquare, label: "Messages", to: "/inbox" },
  { icon: Users, label: "Patients", to: "/patients" },
  { icon: Calendar, label: "Rendez-vous", to: "/appointments" },
  { icon: Settings, label: "Paramètres", to: "/settings" },
];

export function Sidebar() {
  return (
    <aside className="w-64 border-r border-border bg-background flex flex-col h-full">
      <div className="h-16 flex items-center px-6 border-b border-border">
        <h1 className="text-xl font-bold text-foreground">ZenvyDental</h1>
      </div>
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-border">
        <div className="text-sm text-muted-foreground px-3">
          Soutien technique? <br/>
          <a href="#" className="text-primary hover:underline font-medium">Contacter Zenvy</a>
        </div>
      </div>
    </aside>
  );
}
