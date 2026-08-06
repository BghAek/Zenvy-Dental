import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { supportThreadListResponseSchema, SupportThread } from '@zenvy/shared/src/ops';
import { EmptyState, Badge, Button, Input, cn } from '@zenvy/ui';
import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Send, CheckCircle, RotateCcw, MessageCircle } from 'lucide-react';

export function SupportThreadsPage() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['ops-support-threads'],
    queryFn: () => api.get('/ops/support-threads', supportThreadListResponseSchema),
  });

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* Master List */}
      <div className="w-80 border-r border-border bg-white flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-slate-900">Support</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse flex flex-col space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                  <div className="h-3 bg-slate-100 rounded w-full"></div>
                </div>
              ))}
            </div>
          ) : !data?.items.length ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              Aucun thread
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.items.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => setSelectedThreadId(thread.id)}
                  className={cn(
                    "w-full text-left p-4 hover:bg-slate-50 transition-colors focus:outline-none",
                    selectedThreadId === thread.id && "bg-slate-50 ring-1 ring-inset ring-primary/20"
                  )}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-medium text-sm text-slate-900 truncate">
                      {thread.clinic.name}
                    </span>
                    <Badge variant={thread.status === 'OPEN' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                      {thread.status}
                    </Badge>
                  </div>
                  <div className="text-xs font-medium text-slate-700 truncate mb-1">
                    {thread.subject || 'Sans objet'}
                  </div>
                  <div className="text-xs text-slate-500 line-clamp-2">
                    {thread.lastMessagePreview || '...'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-2">
                    {thread.lastMessageAt ? format(new Date(thread.lastMessageAt), 'dd MMM HH:mm', { locale: fr }) : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail View */}
      <div className="flex-1 bg-slate-50 flex flex-col min-w-0">
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['ops-support-thread', threadId],
    queryFn: () => api.get(`/ops/support-threads/${threadId}`, undefined as any) as Promise<SupportThread>,
  });

  const replyMutation = useMutation({
    mutationFn: (body: string) => api.post(`/ops/support-threads/${threadId}/messages`, undefined as any, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-support-thread', threadId] });
      queryClient.invalidateQueries({ queryKey: ['ops-support-threads'] });
      setMessage('');
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'OPEN' | 'CLOSED') => 
      api.patch(`/ops/support-threads/${threadId}`, undefined as any, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-support-thread', threadId] });
      queryClient.invalidateQueries({ queryKey: ['ops-support-threads'] });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data?.messages]);

  if (isLoading) return <div className="flex-1 flex items-center justify-center">Chargement...</div>;
  if (!data) return <div className="flex-1 flex items-center justify-center">Thread introuvable</div>;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    replyMutation.mutate(message);
  };

  return (
    <>
      {/* Header */}
      <div className="bg-white border-b border-border p-4 flex items-center justify-between shadow-sm z-10">
        <div>
          <h3 className="font-semibold text-slate-900">{data.clinic.name}</h3>
          <p className="text-sm text-slate-500">{data.subject || 'Sans objet'}</p>
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
                <span className="text-xs font-medium text-slate-700">
                  {msg.authorName || 'Support ZenvyDental'}
                </span>
                <span className="text-[10px] text-slate-500">
                  {format(new Date(msg.createdAt), 'dd MMM HH:mm', { locale: fr })}
                </span>
              </div>
              <div className={cn(
                "px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap",
                isOwner ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-white border border-border text-slate-900 rounded-tl-sm"
              )}>
                {msg.body}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply box */}
      <div className="p-4 bg-white border-t border-border">
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
