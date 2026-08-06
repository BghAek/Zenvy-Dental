import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";

export function DemoCta({ className = "" }: { className?: string }) {
  // Replace these with the actual founder contact details when available
  const email = "contact@zenvydental.fr"; 
  const subject = encodeURIComponent("Demande de démonstration ZenvyDental");
  const body = encodeURIComponent(
    "Bonjour,\n\nJe souhaite réserver une démonstration de ZenvyDental pour mon cabinet.\n\nNom du cabinet :\nVille :\nCréneau souhaité :\n\nCordialement,"
  );
  const mailtoLink = `mailto:${email}?subject=${subject}&body=${body}`;

  const whatsappNumber = "33600000000"; // Placeholder for <<FOUNDER_WHATSAPP_E164_NO_PLUS>>
  const whatsappMessage = encodeURIComponent(
    "Bonjour, je souhaite réserver une démo de ZenvyDental pour mon cabinet."
  );
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

  return (
    <div className={`flex flex-col sm:flex-row gap-4 items-center justify-center ${className}`}>
      <Link
        href={mailtoLink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Mail className="h-4 w-4" />
        Par Email
      </Link>
      <Link
        href={whatsappLink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-md border border-input bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MessageCircle className="h-4 w-4" />
        Par WhatsApp
      </Link>
    </div>
  );
}
