import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

export function SampleDesignPage() {
  return (
    <div className="min-h-screen bg-background p-8 md:p-16 flex flex-col items-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="max-w-3xl w-full space-y-12"
      >
        <header className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            Système de Design ZenvyDental
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Une interface minimaliste, rapide et fluide. Typographie soignée, contrastes accessibles et micro-interactions subtiles.
          </p>
        </header>

        <section className="bg-card border shadow-sm rounded-2xl p-8 space-y-8">
          <div>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">Couleurs & Boutons</h2>
            <div className="flex flex-wrap gap-4">
              <button className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-6 py-3 font-semibold transition-transform hover:opacity-90 hover:-translate-y-[1px] active:translate-y-0">
                Action Principale
              </button>
              <button className="inline-flex items-center justify-center rounded-lg border border-input bg-background hover:bg-muted text-foreground px-6 py-3 font-semibold transition-colors">
                Action Secondaire
              </button>
              <button className="inline-flex items-center justify-center rounded-lg bg-destructive text-destructive-foreground px-6 py-3 font-semibold transition-transform hover:opacity-90 hover:-translate-y-[1px] active:translate-y-0">
                Action Destructive
              </button>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4 text-foreground">États & Cartes</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <motion.div
                whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                transition={{ duration: 0.2 }}
                className="p-6 rounded-xl border bg-card flex flex-col gap-2 cursor-pointer"
              >
                <div className="flex items-center gap-2 text-primary font-semibold">
                  <CheckCircle2 className="w-5 h-5 text-accent" />
                  Rendez-vous confirmé
                </div>
                <p className="text-sm text-muted-foreground">
                  Le patient a confirmé sa présence pour demain à 14h30.
                </p>
              </motion.div>
              
              <motion.div
                whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                transition={{ duration: 0.2 }}
                className="p-6 rounded-xl border bg-card flex flex-col gap-2 cursor-pointer"
              >
                <div className="flex items-center justify-between font-semibold text-foreground">
                  Voir tous les patients
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Accédez à la liste complète de vos dossiers.
                </p>
              </motion.div>
            </div>
          </div>
        </section>
      </motion.div>
    </div>
  );
}
