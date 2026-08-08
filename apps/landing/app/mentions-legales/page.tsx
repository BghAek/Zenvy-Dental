import Link from "next/link";
import { Button } from "@zenvy/ui";

export const metadata = {
  title: "Mentions légales - ZenvyDental",
};

export default function MentionsLegalesPage() {
  return (
    <div className="container max-w-screen-md mx-auto py-12 px-8">
      <div className="mb-8">
        <Button asChild variant="ghost" className="mb-4 -ml-4">
          <Link href="/">← Retour à l'accueil</Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Mentions légales</h1>
      </div>
      <div className="prose prose-slate max-w-none text-muted-foreground">
        <p>Mentions légales — bientôt disponible.</p>
      </div>
    </div>
  );
}
