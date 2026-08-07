import { useEffect, useRef } from 'react';
import { useMessages } from '../../lib/queries/conversations';
import { Spinner, Button } from '@zenvy/ui';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  conversationId: string;
}

export function MessageList({ conversationId }: MessageListProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useMessages(conversationId);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only scroll to bottom on initial load or when new messages arrive at the bottom
    // We shouldn't scroll to bottom if the user is loading historical messages
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.pages[0]?.items]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 flex items-center justify-center text-destructive">
        Une erreur est survenue lors du chargement des messages.
      </div>
    );
  }

  // Flatten and reverse to show oldest at the top, newest at the bottom
  const allMessages = data?.pages.flatMap((page) => page.items) ?? [];
  const reversedMessages = [...allMessages].reverse();

  return (
    <div data-testid="message-list" className="flex-1 overflow-y-auto p-4 flex flex-col">
      {hasNextPage && (
        <div className="flex justify-center mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? <Spinner className="mr-2 h-4 w-4" /> : null}
            Charger les messages précédents
          </Button>
        </div>
      )}

      {reversedMessages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Aucun message dans cette conversation.
        </div>
      ) : (
        reversedMessages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
