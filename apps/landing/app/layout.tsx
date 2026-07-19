import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@zenvy/ui/theme.css';

export const metadata: Metadata = {
  title: 'ZenvyDental',
  description: 'La couche de communication patient pour les cabinets dentaires.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
