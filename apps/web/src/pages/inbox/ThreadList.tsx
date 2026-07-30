import { useConversations } from '../../lib/queries/conversations';
import { Spinner, Badge, Button } from '@zenvy/ui';
import { cn } from '@zenvy/ui';
import { Bot, User, AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface ThreadListProps {
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function ThreadList({ activeId, onSelect }: ThreadListProps) {
  const [statusFilter, setStatusFilter] = useState<'AI' | 'HUMAN' | 'CLOSED' | ''>('');

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useConversations({
      limit: 20,
      status: statusFilter || undefined,
    });

  const threads = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      <div className="p-4 border-b border-border space-y-4">
        <h2 className="font-semibold text-lg">Boîte de réception</h2>
        
        <div className="flex gap-2 text-sm">
          <Button
            variant={statusFilter === '' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter('')}
            className="flex-1"
          >
            Actifs
          </Button>
          <Button
            variant={statusFilter === 'CLOSED' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter('CLOSED')}
            className="flex-1"
          >
            Archives
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 flex justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : isError ? (
          <div className="p-4 text-center text-sm text-destructive">
            Erreur de chargement
          </div>
        ) : threads.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Aucune conversation trouvée.
          </div>
        ) : (
          <div className="flex flex-col">
            {threads.map((thread) => {
              const patientName = thread.patient
                ? `${thread.patient.firstName} ${thread.patient.lastName}`
                : 'Contact inconnu';

              const timeString = thread.lastMessageAt
                ? new Date(thread.lastMessageAt).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '';

              return (
                <button
                  key={thread.id}
                  onClick={() => onSelect(thread.id)}
                  className={cn(
                    'w-full text-left p-4 border-b border-border hover:bg-muted/50 transition-colors',
                    activeId === thread.id && 'bg-muted'
                  )}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="font-medium truncate pr-2 flex-1">
                      {patientName}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeString}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground mb-2">
                    {thread.waContactPhone}
                  </div>

                  <div className="text-sm text-muted-foreground truncate mb-2">
                    {thread.lastMessagePreview || 'Nouvelle conversation'}
                  </div>

                  <div className="flex items-center gap-2">
                    {thread.status === 'AI' && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Bot className="h-3 w-3" /> IA
                      </Badge>
                    )}
                    {thread.status === 'HUMAN' && (
                      <Badge variant="default" className="text-[10px] gap-1">
                        <User className="h-3 w-3" /> Humain
                      </Badge>
                    )}
                    {thread.status === 'CLOSED' && (
                      <Badge variant="outline" className="text-[10px]">
                        Archivé
                      </Badge>
                    )}
                    {thread.urgentFlag && (
                      <Badge variant="destructive" className="text-[10px] gap-1">
                        <AlertCircle className="h-3 w-3" /> Urgent
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
            
            {hasNextPage && (
              <div className="p-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  Charger plus
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
