import { Menu, User, Bell } from "lucide-react";
import { Button } from "@zenvy/ui";

export function Header() {
  return (
    <header className="h-16 border-b border-border bg-background flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Bell className="h-5 w-5" />
        </Button>
        <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground">
          <User className="h-5 w-5" />
        </div>
      </div>
    </header>
  );
}
