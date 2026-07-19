import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import '@zenvy/ui/theme.css';

export const metadata: Metadata = {
  title: 'ZenvyDental',
  description: 'La couche de communication patient pour les cabinets dentaires.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className="antialiased">
      <body className="min-h-screen bg-background font-sans text-foreground flex flex-col">
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-8">
            <Link href="/" className="flex items-center space-x-2">
              <span className="font-bold sm:inline-block">ZenvyDental</span>
            </Link>
            <nav className="flex items-center space-x-6 text-sm font-medium">
              <Link href="/tarifs" className="transition-colors hover:text-foreground/80 text-foreground/60">Tarifs</Link>
              <Link href="/demo" className="transition-colors hover:text-foreground/80 text-foreground/60">Réserver une démo</Link>
              <a href="http://app.zenvydental.local" className="transition-colors hover:text-foreground/80 text-foreground/60">Connexion</a>
            </nav>
          </div>
        </header>
        <div className="flex-1">
          {children}
        </div>
        <footer className="border-t py-6 md:py-0">
          <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row px-8">
            <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
              &copy; {new Date().getFullYear()} ZenvyDental. Tous droits réservés.
            </p>
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <Link href="/mentions-legales" className="hover:underline">Mentions légales</Link>
              <Link href="/confidentialite" className="hover:underline">Confidentialité</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
