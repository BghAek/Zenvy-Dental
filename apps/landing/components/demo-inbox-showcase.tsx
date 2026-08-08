"use client";

import { motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import { Bot, User, ArrowRight } from "lucide-react";

export function DemoInboxShowcase() {
  const shouldReduceMotion = useReducedMotion();

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
  };

  const handoffVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1, transition: { delay: 0.8, duration: 0.4 } },
  };

  return (
    <motion.div
      variants={shouldReduceMotion ? {} : containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      className="w-full max-w-2xl mx-auto bg-card border border-border rounded-xl overflow-hidden"
    >
      {/* Dashboard Header Fake */}
      <div className="bg-muted border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-muted-foreground/20" />
          <div className="space-y-1">
            <div className="h-3 w-24 bg-muted-foreground/20 rounded-full" />
            <div className="h-2 w-16 bg-muted-foreground/10 rounded-full" />
          </div>
        </div>
        <div className="h-6 w-20 bg-success/20 text-success text-[10px] font-bold uppercase flex items-center justify-center rounded-full">
          Géré par l'IA
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Bot className="h-4 w-4" />
            </div>
            <div className="bg-muted p-3 rounded-2xl rounded-tl-none text-sm text-foreground max-w-[80%]">
              Je ne suis pas sûr de comprendre. Pouvez-vous m'en dire plus sur la douleur ?
            </div>
          </div>
          
          <div className="flex items-start gap-3 justify-end">
            <div className="bg-info/20 p-3 rounded-2xl rounded-tr-none text-sm text-foreground max-w-[80%]">
              J'ai très mal depuis hier, je pense que c'est une urgence.
            </div>
            <div className="h-8 w-8 rounded-full bg-info/30 shrink-0" />
          </div>
        </div>

        {/* Handoff Animation */}
        <motion.div
          variants={shouldReduceMotion ? { hidden: { opacity: 1, scale: 1 }, visible: { opacity: 1, scale: 1 } } : handoffVariants}
          className="flex flex-col items-center justify-center py-4 space-y-3 relative"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-warning to-transparent" />
          </div>
          <div className="bg-warning/10 text-warning border border-warning/20 text-xs font-semibold px-4 py-1.5 rounded-full z-10 flex items-center gap-2">
            <span>IA</span>
            <ArrowRight className="h-3 w-3" />
            <span>Humain</span>
          </div>
          <p className="text-xs text-muted-foreground z-10 bg-card px-2">
            L'IA a détecté une urgence et a passé le relais à votre équipe.
          </p>
        </motion.div>
        
        {/* New Status */}
        <div className="flex items-center justify-between bg-muted border border-border p-3 rounded-lg">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <User className="h-4 w-4 text-primary" />
            Reprise manuelle par Dr Martin
          </div>
          <span className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md transition-colors inline-block" aria-hidden="true">
            Répondre
          </span>
        </div>
      </div>
    </motion.div>
  );
}
