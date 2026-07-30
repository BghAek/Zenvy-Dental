import { useState } from 'react';
import { ThreadList } from './ThreadList';
import { ConversationView } from './ConversationView';
import { MessageSquare } from 'lucide-react';

export function InboxPage() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  return (
    <div className="flex h-[calc(100vh-theme(spacing.16))] -m-4 md:-m-6 bg-background rounded-lg border border-border overflow-hidden">
      {/* Sidebar - hidden on mobile when a conversation is active */}
      <div 
        className={`w-full md:w-80 shrink-0 ${
          activeConversationId ? 'hidden md:block' : 'block'
        }`}
      >
        <ThreadList 
          activeId={activeConversationId} 
          onSelect={setActiveConversationId} 
        />
      </div>

      {/* Main Content */}
      <div 
        className={`flex-1 flex flex-col min-w-0 ${
          !activeConversationId ? 'hidden md:flex' : 'flex'
        }`}
      >
        {activeConversationId ? (
          <ConversationView conversationId={activeConversationId} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center gap-4 bg-muted/10">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-2">
              <MessageSquare className="h-8 w-8 text-muted-foreground/60" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Vos conversations</h2>
            <p className="max-w-md text-sm">
              Sélectionnez une conversation dans la liste pour lire les messages ou prendre la main sur l'assistant IA.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
