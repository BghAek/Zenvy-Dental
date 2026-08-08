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
      title: "J-1 : rappel",
      description: "WhatsApp envoyé pour rappeler le rendez-vous de demain.",
      icon: <CalendarDays className="h-5 w-5 text-info" />,
      time: "09:00",
    },
    {
      id: 2,
      title: "J : rappel 2 h avant",
      description: "Le patient est invité à confirmer par un simple « Oui ».",
      icon: <Clock className="h-5 w-5 text-warning" />,
      time: "10:30",
    },
    {
      id: 3,
      title: "J+1 : suivi",
      description: "Message de suivi envoyé pour recueillir les avis et assurer un suivi post-soin.",
      icon: <CheckCircle2 className="h-5 w-5 text-success" />,
      time: "14:15",
    },
  ];

  return (
    <div className="w-full max-w-md mx-auto bg-card border border-border rounded-xl p-6">
      <h3 className="text-lg font-semibold text-primary mb-6">Séquence de rappels</h3>
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
            <div className="absolute -left-[13px] top-1 h-6 w-6 rounded-full bg-card border-2 border-muted flex items-center justify-center">
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
