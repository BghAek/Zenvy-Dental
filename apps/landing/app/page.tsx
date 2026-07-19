import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-[calc(100vh-140px)] flex-col items-center justify-center p-24 text-center">
      <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl text-primary mb-6">
        La communication patient, réinventée.
      </h1>
      <p className="max-w-[600px] text-lg text-muted-foreground mb-8">
        ZenvyDental gère vos rendez-vous et répond à vos patients sur WhatsApp, automatiquement. Libérez du temps pour ce qui compte vraiment.
      </p>
      <div className="flex gap-4">
        <Link href="/demo" className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
          Réserver une démo
        </Link>
        <Link href="/tarifs" className="inline-flex h-11 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
          Voir les tarifs
        </Link>
      </div>
    </main>
  );
}
