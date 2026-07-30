import { Message } from '@zenvy/shared';
import { cn } from '@zenvy/ui';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === 'OUT';

  const timeString = new Date(message.createdAt).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={cn(
        'flex w-full mb-4',
        isOutbound ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2 relative group',
          isOutbound
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'bg-muted text-foreground rounded-tl-sm'
        )}
      >
        {!isOutbound && message.author === 'AI' && (
          <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">
            Assistant IA
          </div>
        )}
        {!isOutbound && message.author === 'PATIENT' && (
          <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">
            Patient
          </div>
        )}

        <div className="text-sm whitespace-pre-wrap break-words">{message.body}</div>

        <div
          className={cn(
            'flex items-center justify-end gap-1 mt-1 text-[10px]',
            isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          <span>{timeString}</span>
          {isOutbound && (
            <span className="flex items-center">
              {message.deliveryStatus === 'PENDING' && <Clock className="h-3 w-3" />}
              {message.deliveryStatus === 'SENT' && <Check className="h-3 w-3" />}
              {message.deliveryStatus === 'DELIVERED' && <CheckCheck className="h-3 w-3" />}
              {message.deliveryStatus === 'READ' && <CheckCheck className="h-3 w-3 text-blue-400" />}
              {message.deliveryStatus === 'FAILED' && <AlertCircle className="h-3 w-3 text-destructive" />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
