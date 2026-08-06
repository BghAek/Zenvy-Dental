import type { Metadata } from "next";
import { DemoHero } from "../../components/demo-hero";
import { DemoCta } from "../../components/demo-cta";
import { VideoPlaceholder } from "../../components/video-placeholder";
import { DemoWhatsappShowcase } from "../../components/demo-whatsapp-showcase";
import { DemoTimelineShowcase } from "../../components/demo-timeline-showcase";
import { DemoInboxShowcase } from "../../components/demo-inbox-showcase";

export const metadata: Metadata = {
  title: "Réserver une démo — ZenvyDental",
  description:
    "Découvrez ZenvyDental en action avec notre équipe et voyez comment automatiser la communication de votre cabinet dentaire.",
};

export default function DemoPage() {
  return (
    <main className="flex min-h-screen flex-col items-center">
      <DemoHero />

      <div className="w-full max-w-screen-xl mx-auto px-8 py-16 space-y-32">
        {/* Showcase 1: WhatsApp Conversation */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-primary">
              Des conversations naturelles, 24/7
            </h2>
            <p className="text-lg text-muted-foreground">
              Notre assistant IA répond aux questions de vos patients et planifie des rendez-vous directement sur WhatsApp. Finis les appels manqués et les longues attentes au téléphone.
            </p>
            <div className="pt-4 max-w-md hidden lg:block">
              <VideoPlaceholder title="Vidéo : L'expérience patient sur WhatsApp" />
            </div>
          </div>
          <div className="flex justify-center">
            <DemoWhatsappShowcase />
          </div>
        </section>

        {/* Showcase 2: Timeline Reminders */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="order-2 lg:order-1 flex justify-center">
            <DemoTimelineShowcase />
          </div>
          <div className="order-1 lg:order-2 space-y-6">
            <h2 className="text-3xl font-bold text-primary">
              Des rappels intelligents
            </h2>
            <p className="text-lg text-muted-foreground">
              Programmez des rappels automatiques avant chaque rendez-vous. Réduisez l'absentéisme et optimisez l'agenda de votre cabinet sans effort supplémentaire pour votre équipe.
            </p>
            <div className="pt-4 max-w-md hidden lg:block">
              <VideoPlaceholder title="Vidéo : Configuration des rappels" />
            </div>
          </div>
        </section>

        {/* Showcase 3: Inbox Takeover */}
        <section className="space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold text-primary">
              Reprenez la main à tout moment
            </h2>
            <p className="text-lg text-muted-foreground">
              En cas de demande complexe ou d'urgence, l'IA vous transfère immédiatement la conversation. Vous gardez un contrôle total depuis votre tableau de bord.
            </p>
          </div>
          <DemoInboxShowcase />
          <div className="max-w-3xl mx-auto pt-8">
            <VideoPlaceholder title="Vidéo : Le tableau de bord ZenvyDental" />
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-24 border-t border-border/40 text-center space-y-8">
          <h2 className="text-3xl font-bold text-primary">
            Prêt à transformer votre cabinet ?
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-balance">
            Réservez une démonstration personnalisée dès aujourd'hui et découvrez comment ZenvyDental s'adapte à vos besoins.
          </p>
          <DemoCta />
        </section>
      </div>
    </main>
  );
}
