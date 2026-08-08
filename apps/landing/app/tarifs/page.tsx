import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

export const metadata: Metadata = {
  title: "Tarifs — ZenvyDental",
  description:
    "Un abonnement unique pour transformer la communication de votre cabinet dentaire. Essai gratuit de 14 jours, sans carte bancaire.",
};

export default function TarifsPage() {
  return (
    <main className="flex min-h-[calc(100vh-140px)] flex-col items-center justify-center p-8 md:p-24 bg-muted">
      <div className="text-center mb-16 space-y-4 max-w-2xl mx-auto">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-primary">
          Une tarification simple et transparente.
        </h1>
        <p className="text-lg text-muted-foreground text-balance">
          Un abonnement unique pour transformer la gestion de vos patients.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl w-full">
        {/* Standard Plan (Anchor) */}
        <div className="flex flex-col rounded-3xl border border-border bg-card p-8">
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-primary">Standard</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              Pour les cabinets souhaitant une présence basique.
            </p>
          </div>
          <div className="mb-6 flex items-baseline text-5xl font-extrabold text-primary">
            20&#8239;€<span className="text-3xl ml-2">HT</span>
            <span className="ml-2 text-xl font-medium text-muted-foreground">/mois</span>
          </div>
          <ul className="mb-8 flex flex-1 flex-col space-y-3">
            <li className="flex items-center space-x-3 text-sm text-muted-foreground">
              <Check className="h-4 w-4 text-primary shrink-0" />
              <span>Profil cabinet en ligne</span>
            </li>
            <li className="flex items-center space-x-3 text-sm text-muted-foreground">
              <Check className="h-4 w-4 text-primary shrink-0" />
              <span>Réception de messages simples</span>
            </li>
          </ul>
          <div className="flex flex-col space-y-2 text-center">
            <span className="text-sm font-medium text-muted-foreground">Bientôt disponible</span>
            <Link href="/demo" className="inline-flex h-12 w-full items-center justify-center rounded-md bg-secondary px-8 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/90">
              Prévenez-moi
            </Link>
          </div>
        </div>

        {/* Premium Plan */}
        <div className="relative flex flex-col rounded-3xl border-2 border-primary bg-primary p-8">
          <div className="absolute -top-4 right-8 rounded-full bg-accent px-4 py-1 text-xs font-semibold text-accent-foreground tracking-wide uppercase">
            Populaire
          </div>
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-white">Premium</h3>
            <p className="text-primary-foreground/80 mt-2 text-sm">
              La solution complète avec assistant IA et rappels.
            </p>
          </div>
          <div className="mb-6 flex items-baseline text-5xl font-extrabold text-primary-foreground">
            399&#8239;€<span className="text-3xl ml-2">HT</span>
            <span className="ml-2 text-xl font-medium text-primary-foreground/80">/mois</span>
          </div>
          <ul className="mb-8 flex flex-1 flex-col space-y-3 text-primary-foreground">
            <li className="flex items-center space-x-3 text-sm">
              <Check className="h-4 w-4 shrink-0 text-accent" />
              <span>Assistant WhatsApp 24/7 (IA)</span>
            </li>
            <li className="flex items-center space-x-3 text-sm">
              <Check className="h-4 w-4 shrink-0 text-accent" />
              <span>Rappels de RDV automatisés</span>
            </li>
            <li className="flex items-center space-x-3 text-sm">
              <Check className="h-4 w-4 shrink-0 text-accent" />
              <span>Tableau de bord de gestion</span>
            </li>
            <li className="flex items-center space-x-3 text-sm">
              <Check className="h-4 w-4 shrink-0 text-accent" />
              <span>Support prioritaire</span>
            </li>
          </ul>
          <a href={process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/register` : 'https://app.zenvydental.fr/register'} className="inline-flex h-12 w-full items-center justify-center rounded-md bg-primary-foreground px-8 text-sm font-bold text-primary transition-colors hover:bg-primary-foreground/90">
            Commencer l'essai gratuit de 14 jours
          </a>
          <p className="mt-4 text-center text-xs text-primary-foreground/60">
            Aucune carte bancaire requise.
          </p>
        </div>
      </div>
    </main>
  );
}
