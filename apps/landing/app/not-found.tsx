import Link from 'next/link';
import { Button } from '@zenvy/ui';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight mb-4 text-foreground">Page introuvable</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Cette page n'existe pas ou a été déplacée.
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <Button asChild size="lg">
          <Link href="/">Retour à l'accueil</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/tarifs">Voir les tarifs</Link>
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link href="/demo">Réserver une démo</Link>
        </Button>
      </div>
    </div>
  );
}
