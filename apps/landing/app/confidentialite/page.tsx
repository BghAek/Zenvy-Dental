import Link from "next/link";
import { Button } from "@zenvy/ui";

export const metadata = {
  title: "Confidentialité - ZenvyDental",
};

export default function ConfidentialitePage() {
  return (
    <div className="container max-w-screen-md mx-auto py-12 px-8">
      <div className="mb-8">
        <Button asChild variant="ghost" className="mb-4 -ml-4">
          <Link href="/">← Retour à l'accueil</Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Politique de confidentialité</h1>
      </div>
      <div className="prose prose-slate max-w-none text-muted-foreground">
        <p>Politique de confidentialité — bientôt disponible.</p>
      </div>
    </div>
  );
}
