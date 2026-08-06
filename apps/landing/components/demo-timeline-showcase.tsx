"use client";

import { motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import { Clock, CalendarDays, CheckCircle2 } from "lucide-react";

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 1.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export function DemoTimelineShowcase() {
  const shouldReduceMotion = useReducedMotion();

  const events = [
    {
      id: 1,
      title: "J-7 : Rappel Doux",
      description: "WhatsApp envoyé pour rappeler le rendez-vous de la semaine prochaine.",
      icon: <CalendarDays className="h-5 w-5 text-blue-500" />,
      time: "09:00",
    },
    {
      id: 2,
      title: "J-2 : Demande de Confirmation",
      description: "Le patient est invité à confirmer par un simple \"Oui\".",
      icon: <Clock className="h-5 w-5 text-amber-500" />,
      time: "10:30",
    },
    {
      id: 3,
      title: "J-1 : Confirmé",
      description: "Le patient a confirmé. Le statut est mis à jour dans votre tableau de bord.",
      icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
      time: "14:15",
    },
  ];

  return (
    <div className="w-full max-w-md mx-auto bg-white border border-border rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-primary mb-6">Séquence de Rappels</h3>
      <motion.div
        variants={shouldReduceMotion ? {} : containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
        className="relative border-l-2 border-muted ml-3 space-y-8"
      >
        {events.map((event) => (
          <motion.div
            key={event.id}
            variants={shouldReduceMotion ? { hidden: { opacity: 1, x: 0 }, visible: { opacity: 1, x: 0 } } : itemVariants}
            className="relative pl-6"
          >
            <div className="absolute -left-[13px] top-1 h-6 w-6 rounded-full bg-white border-2 border-muted flex items-center justify-center">
              {event.icon}
            </div>
            <div className="flex flex-col space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-foreground">{event.title}</span>
                <span className="text-xs text-muted-foreground">{event.time}</span>
              </div>
              <p className="text-sm text-muted-foreground">{event.description}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
