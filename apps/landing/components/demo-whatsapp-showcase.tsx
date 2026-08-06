"use client";

import { motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 1.5,
    },
  },
};

const messageVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
};

export function DemoWhatsappShowcase() {
  const shouldReduceMotion = useReducedMotion();

  const messages = [
    {
      id: 1,
      sender: "patient",
      text: "Bonjour, avez-vous des disponibilités pour un détartrage la semaine prochaine ?",
      time: "10:14",
    },
    {
      id: 2,
      sender: "ai",
      text: "Bonjour ! Oui, le Dr Martin a une disponibilité le mardi 14 à 14h30 ou le jeudi 16 à 10h00. Lequel préférez-vous ?",
      time: "10:14",
    },
    {
      id: 3,
      sender: "patient",
      text: "Mardi 14h30 ce serait parfait.",
      time: "10:16",
    },
    {
      id: 4,
      sender: "ai",
      text: "C'est noté ! Votre rendez-vous pour un détartrage avec le Dr Martin est confirmé pour le mardi 14 à 14h30. Un rappel vous sera envoyé quelques jours avant. Bonne journée !",
      time: "10:16",
    },
  ];

  return (
    <div className="w-full max-w-sm mx-auto bg-slate-50 border border-border rounded-3xl shadow-sm overflow-hidden flex flex-col h-[500px]">
      {/* Header */}
      <div className="bg-primary px-4 py-3 flex items-center gap-3 shrink-0">
        <div className="h-10 w-10 rounded-full bg-slate-300 flex items-center justify-center text-primary font-bold overflow-hidden">
          <img src="https://ui-avatars.com/api/?name=Cabinet+Dentaire&background=e2e8f0&color=1e293b" alt="Cabinet" />
        </div>
        <div className="flex flex-col">
          <span className="text-primary-foreground font-semibold text-sm">Cabinet Dentaire</span>
          <span className="text-primary-foreground/80 text-xs">Assistant en ligne</span>
        </div>
      </div>
      
      {/* Chat Body */}
      <div className="flex-1 p-4 overflow-y-auto bg-[#efeae2]">
        <motion.div
          variants={shouldReduceMotion ? {} : containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="flex flex-col space-y-4"
        >
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              variants={shouldReduceMotion ? { hidden: { opacity: 1, y: 0, scale: 1 }, visible: { opacity: 1, y: 0, scale: 1 } } : messageVariants}
              className={`flex ${msg.sender === "patient" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                  msg.sender === "patient"
                    ? "bg-[#d9fdd3] text-foreground rounded-tr-sm"
                    : "bg-white text-foreground rounded-tl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
                <span className="text-[10px] text-muted-foreground float-right mt-1 ml-2">
                  {msg.time}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
