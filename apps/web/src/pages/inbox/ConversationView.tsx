import { Button, Badge, Spinner } from '@zenvy/ui';
import { Archive, Bot, User, AlertCircle } from 'lucide-react';
import {
  useConversation,
  useTakeoverConversation,
  useReleaseConversation,
  useCloseConversation,
} from '../../lib/queries/conversations';
import { MessageList } from './MessageList';
import { SendBox } from './SendBox';

interface ConversationViewProps {
  conversationId: string;
}

export function ConversationView({ conversationId }: ConversationViewProps) {
  const { data: conversation, isLoading, isError } = useConversation(conversationId);
  const takeover = useTakeoverConversation(conversationId);
  const release = useReleaseConversation(conversationId);
  const close = useCloseConversation(conversationId);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (isError || !conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground p-8 text-center gap-2">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p>Impossible de charger la conversation.</p>
        <p className="text-sm">Elle a peut-être été supprimée ou vous n'y avez pas accès.</p>
      </div>
    );
  }

  const patientName = conversation.patient
    ? `${conversation.patient.firstName} ${conversation.patient.lastName}`
    : 'Contact inconnu';

  return (
    <div className="flex-1 flex flex-col bg-background h-full">
      {/* Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-4 bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="font-semibold">{patientName}</h2>
            <div className="text-sm text-muted-foreground">{conversation.waContactPhone}</div>
          </div>
          {conversation.urgentFlag && (
            <Badge variant="destructive" className="ml-2">
              Urgent
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {conversation.status === 'AI' && (
            <Button
              variant="default"
              size="sm"
              onClick={() => takeover.mutate()}
              disabled={takeover.isPending}
            >
              <User className="mr-2 h-4 w-4" />
              Prendre la main
            </Button>
          )}
          {conversation.status === 'HUMAN' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => release.mutate()}
              disabled={release.isPending}
            >
              <Bot className="mr-2 h-4 w-4" />
              Rendre la main à l'IA
            </Button>
          )}
          {conversation.status !== 'CLOSED' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => close.mutate()}
              disabled={close.isPending}
              title="Archiver"
            >
              <Archive className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <MessageList conversationId={conversationId} />

      {/* Send Box */}
      {conversation.status !== 'CLOSED' && <SendBox conversation={conversation} />}
    </div>
  );
}
