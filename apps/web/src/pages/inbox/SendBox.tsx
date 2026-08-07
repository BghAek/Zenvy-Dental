import { useState } from 'react';
import { Button, Input } from '@zenvy/ui';
import { Send, AlertTriangle } from 'lucide-react';
import { useSendMessage } from '../../lib/queries/conversations';
import { Conversation } from '@zenvy/shared';

interface SendBoxProps {
  conversation: Conversation;
}

export function SendBox({ conversation }: SendBoxProps) {
  const [body, setBody] = useState('');
  const sendMessage = useSendMessage(conversation.id);

  const isHuman = conversation.status === 'HUMAN';
  const now = new Date();
  const expiresAt = conversation.windowExpiresAt ? new Date(conversation.windowExpiresAt) : null;
  const isWindowOpen = expiresAt ? expiresAt > now : false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || !isHuman || !isWindowOpen || sendMessage.isPending) return;

    sendMessage.mutate(
      { body: body.trim() },
      {
        onSuccess: () => setBody(''),
      }
    );
  };

  if (!isHuman) {
    return (
      <div className="p-4 border-t border-border bg-muted/30 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
        <span>L'assistant IA gère cette conversation. Prenez la main pour répondre.</span>
      </div>
    );
  }

  if (!isWindowOpen) {
    return (
      <div className="p-4 border-t border-border bg-destructive/10 text-destructive text-center text-sm flex flex-col items-center justify-center gap-1">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4" />
          <span>La fenêtre de 24h est fermée</span>
        </div>
        <p className="opacity-90">
          Vous ne pouvez plus envoyer de messages libres à ce patient jusqu'à ce qu'il vous réponde.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t border-border flex gap-2 bg-background">
      <Input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Écrivez votre message..."
        disabled={sendMessage.isPending}
        className="flex-1"
      />
      <Button
        type="submit"
        aria-label="Envoyer"
        disabled={!body.trim() || sendMessage.isPending}
        size="icon"
      >
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}
