import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { supportThreadListResponseSchema, supportThreadSchema, supportMessageSchema } from '@zenvy/shared/src/ops';
import { EmptyState, Badge, Button, Input, cn } from '@zenvy/ui';
import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Send, CheckCircle, RotateCcw, MessageCircle } from 'lucide-react';

export function SupportThreadsPage() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ops-support-threads'],
    queryFn: () => api.get('/ops/support-threads', supportThreadListResponseSchema),
  });

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* Master List */}
      <div className="w-80 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-foreground">Support</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse flex flex-col space-y-2">
                  <div className="h-4 bg-muted rounded w-1/2"></div>
                  <div className="h-3 bg-muted/50 rounded w-full"></div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 flex flex-col items-center text-center">
              <span className="text-muted-foreground text-sm mb-4">Impossible de charger les conversations.</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Réessayer</Button>
            </div>
          ) : !data?.items.length ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Aucune conversation
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.items.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => setSelectedThreadId(thread.id)}
                  className={cn(
                    "w-full text-left p-4 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selectedThreadId === thread.id && "bg-muted ring-1 ring-inset ring-primary/20"
                  )}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-medium text-sm text-foreground truncate">
                      {thread.clinic.name}
                    </span>
                    <Badge variant={thread.status === 'OPEN' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                      {thread.status}
                    </Badge>
                  </div>
                  <div className="text-xs font-medium text-muted-foreground truncate mb-1">
                    {thread.subject || 'Sans objet'}
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {thread.lastMessagePreview || '...'}
                  </div>
                  <div className="text-[10px] text-muted-foreground/50 mt-2">
                    {thread.lastMessageAt ? format(new Date(thread.lastMessageAt), 'dd MMM HH:mm', { locale: fr }) : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail View */}
      <div className="flex-1 bg-muted/30 flex flex-col min-w-0">
        {selectedThreadId ? (
          <SupportThreadDetail threadId={selectedThreadId} />
        ) : (
          <EmptyState icon={MessageCircle} title="Aucun thread sélectionné" description="Sélectionnez un thread pour afficher la conversation." />
        )}
      </div>
    </div>
  );
}

function SupportThreadDetail({ threadId }: { threadId: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ops-support-thread', threadId],
    queryFn: () => api.get(`/ops/support-threads/${threadId}`, supportThreadSchema),
  });

  const replyMutation = useMutation({
    mutationFn: (body: string) => api.post(`/ops/support-threads/${threadId}/messages`, supportMessageSchema, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-support-thread', threadId] });
      queryClient.invalidateQueries({ queryKey: ['ops-support-threads'] });
      setMessage('');
      setErrorMsg(null);
    },
    onError: () => {
      setErrorMsg('Message non envoyé. Réessayer.');
    }
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'OPEN' | 'CLOSED') => 
      api.patch(`/ops/support-threads/${threadId}`, supportThreadSchema, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-support-thread', threadId] });
      queryClient.invalidateQueries({ queryKey: ['ops-support-threads'] });
      setErrorMsg(null);
    },
    onError: () => {
      setErrorMsg('Statut non mis à jour. Réessayer.');
    }
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data?.messages]);

  if (isLoading) return <div className="flex-1 flex items-center justify-center text-muted-foreground">Chargement...</div>;
  if (isError) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <span className="text-muted-foreground">Impossible de charger la conversation.</span>
      <Button variant="outline" onClick={() => refetch()}>Réessayer</Button>
    </div>
  );
  if (!data) return <div className="flex-1 flex items-center justify-center text-muted-foreground">Conversation introuvable</div>;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    replyMutation.mutate(message);
  };

  return (
    <>
      {/* Header */}
      <div className="bg-card border-b border-border p-4 flex items-center justify-between z-10">
        <div>
          <h3 className="font-semibold text-foreground">{data.clinic.name}</h3>
          <p className="text-sm text-muted-foreground">{data.subject || 'Sans objet'}</p>
        </div>
        <div>
          {data.status === 'OPEN' ? (
            <Button size="sm" variant="outline" onClick={() => statusMutation.mutate('CLOSED')} disabled={statusMutation.isPending}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Marquer comme résolu
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => statusMutation.mutate('OPEN')} disabled={statusMutation.isPending}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Rouvrir
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {data.messages.map((msg) => {
          const isOwner = msg.authorRole === 'SUPER_ADMIN';
          return (
            <div key={msg.id} className={cn("flex flex-col max-w-[80%]", isOwner ? "ml-auto items-end" : "mr-auto items-start")}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {msg.authorName || 'Support ZenvyDental'}
                </span>
                <span className="text-[10px] text-muted-foreground/80">
                  {format(new Date(msg.createdAt), 'dd MMM HH:mm', { locale: fr })}
                </span>
              </div>
              <div className={cn(
                "px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap",
                isOwner ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-card border border-border text-foreground rounded-tl-sm"
              )}>
                {msg.body}
              </div>
            </div>
          );
        })}
      </div>
      {errorMsg && (
        <div className="px-4 pt-4">
          <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md border border-destructive/20 text-center">
            {errorMsg}
          </div>
        </div>
      )}

      {/* Reply box */}
      <div className="p-4 bg-card border-t border-border mt-auto">
        <form onSubmit={handleSend} className="flex gap-2">
          <Input 
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Répondre..." 
            className="flex-1"
            disabled={replyMutation.isPending}
          />
          <Button type="submit" disabled={!message.trim() || replyMutation.isPending}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </>
  );
}
