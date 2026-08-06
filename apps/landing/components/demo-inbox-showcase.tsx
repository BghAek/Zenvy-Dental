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
      className="w-full max-w-2xl mx-auto bg-white border border-border rounded-xl shadow-md overflow-hidden"
    >
      {/* Dashboard Header Fake */}
      <div className="bg-slate-50 border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-slate-200" />
          <div className="space-y-1">
            <div className="h-3 w-24 bg-slate-200 rounded-full" />
            <div className="h-2 w-16 bg-slate-100 rounded-full" />
          </div>
        </div>
        <div className="h-6 w-20 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase flex items-center justify-center rounded-full">
          Géré par l'IA
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Bot className="h-4 w-4" />
            </div>
            <div className="bg-slate-100 p-3 rounded-2xl rounded-tl-none text-sm text-foreground max-w-[80%]">
              Je ne suis pas sûr de comprendre. Pouvez-vous m'en dire plus sur la douleur ?
            </div>
          </div>
          
          <div className="flex items-start gap-3 justify-end">
            <div className="bg-blue-100 p-3 rounded-2xl rounded-tr-none text-sm text-foreground max-w-[80%]">
              J'ai très mal depuis hier, je pense que c'est une urgence.
            </div>
            <div className="h-8 w-8 rounded-full bg-blue-200 shrink-0" />
          </div>
        </div>

        {/* Handoff Animation */}
        <motion.div
          variants={shouldReduceMotion ? { hidden: { opacity: 1, scale: 1 }, visible: { opacity: 1, scale: 1 } } : handoffVariants}
          className="flex flex-col items-center justify-center py-4 space-y-3 relative"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-amber-200 to-transparent" />
          </div>
          <div className="bg-amber-50 text-amber-600 border border-amber-200 text-xs font-semibold px-4 py-1.5 rounded-full z-10 flex items-center gap-2 shadow-sm">
            <span>IA</span>
            <ArrowRight className="h-3 w-3" />
            <span>Humain</span>
          </div>
          <p className="text-xs text-muted-foreground z-10 bg-white px-2">
            L'IA a détecté une urgence et a passé le relais à votre équipe.
          </p>
        </motion.div>
        
        {/* New Status */}
        <div className="flex items-center justify-between bg-slate-50 border border-border p-3 rounded-lg">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <User className="h-4 w-4 text-primary" />
            Reprise manuelle par Dr. Martin
          </div>
          <button className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors">
            Répondre
          </button>
        </div>
      </div>
    </motion.div>
  );
}
