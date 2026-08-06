import { Play } from "lucide-react";

interface VideoPlaceholderProps {
  title: string;
}

export function VideoPlaceholder({ title }: VideoPlaceholderProps) {
  return (
    <div 
      className="relative w-full aspect-video rounded-xl bg-muted border border-border shadow-sm overflow-hidden group cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={`Lire la vidéo : ${title}`}
    >
      <div className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
        <div className="h-16 w-16 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center shadow-lg backdrop-blur-sm transition-transform duration-200 group-active:scale-95">
          <Play className="h-8 w-8 ml-1" />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent">
        <p className="text-white font-medium text-sm sm:text-base truncate">
          {title}
        </p>
      </div>
    </div>
  );
}
