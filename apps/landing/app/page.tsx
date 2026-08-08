import Link from "next/link";
import { MessageSquare, CalendarCheck, Zap } from "lucide-react";
import { HeroWrapper } from "../components/hero-wrapper";

export default function Home() {
  return (
    <main className="flex min-h-[calc(100vh-140px)] flex-col items-center">
      {/* Hero Section */}
      <section className="w-full max-w-screen-xl mx-auto flex flex-col-reverse lg:flex-row items-center justify-between p-8 lg:p-24 gap-12 lg:gap-8">
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left flex-1 space-y-6">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl text-primary text-balance">
            La communication patient, réinventée.
          </h1>
          <p className="max-w-[600px] text-lg text-muted-foreground text-balance">
            ZenvyDental gère vos rendez-vous et répond à vos patients sur WhatsApp, automatiquement. Libérez du temps pour ce qui compte vraiment.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Link 
              href="/demo" 
              className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Réserver une démo
            </Link>
            <Link 
              href="/tarifs" 
              className="inline-flex h-12 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Voir les tarifs
            </Link>
          </div>
        </div>
        <div className="flex-1 flex justify-center lg:justify-end">
          <HeroWrapper />
        </div>
      </section>

      {/* Value Props Section */}
      <section className="w-full bg-muted py-24 border-t border-border/40">
        <div className="max-w-screen-xl mx-auto px-8">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-primary">
              Pourquoi choisir ZenvyDental ?
            </h2>
            <p className="text-muted-foreground text-lg max-w-[600px] mx-auto text-balance">
              Pensé exclusivement pour les cabinets dentaires, sans remplacer votre logiciel métier.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-card border border-border flex items-center justify-center text-primary">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-primary">Assistant WhatsApp 24/7</h3>
              <p className="text-muted-foreground text-balance">
                Ne manquez plus aucune demande. Notre IA répond instantanément à vos patients, de jour comme de nuit, en français parfait.
              </p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-card border border-border flex items-center justify-center text-primary">
                <CalendarCheck className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-primary">Rappels automatisés</h3>
              <p className="text-muted-foreground text-balance">
                Réduisez les rendez-vous manqués. ZenvyDental envoie des rappels sur WhatsApp, avec confirmation ou annulation en un message.
              </p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-card border border-border flex items-center justify-center text-primary">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-primary">Mise en place immédiate</h3>
              <p className="text-muted-foreground text-balance">
                Pas besoin de changer vos habitudes. ZenvyDental se superpose à votre organisation actuelle et fluidifie la communication.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
