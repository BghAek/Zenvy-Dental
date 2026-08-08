import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { opsErrorListResponseSchema, opsErrorSchema } from '@zenvy/shared/src/ops';
import { EmptyState, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge, Input, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Spinner } from '@zenvy/ui';
import { Search, AlertCircle, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';


const SEVERITY_LABELS: Record<string, string> = {
  INFO: 'Info',
  WARN: 'Avertissement',
  ERROR: 'Erreur',
  FATAL: 'Critique',
};

export function ErrorsPage() {
  const [correlationId, setCorrelationId] = useState('');
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ops-errors', correlationId],
    queryFn: () => api.get('/ops/errors', opsErrorListResponseSchema, { correlationId: correlationId || undefined }),
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Journal des erreurs</h1>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Filtrer par Correlation ID..." 
            className="pl-9" 
            value={correlationId}
            onChange={(e) => setCorrelationId(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse flex flex-col space-y-4">
          <div className="h-10 bg-muted rounded"></div>
          <div className="h-32 bg-muted/50 rounded"></div>
        </div>
      ) : isError ? (
        <EmptyState 
          icon={AlertCircle} 
          title="Erreur" 
          description="Impossible de charger les erreurs." 
          action={<Button variant="outline" size="sm" onClick={() => refetch()}>Réessayer</Button>} 
        />
      ) : !data?.items.length ? (
        <EmptyState icon={AlertTriangle} title="Aucune erreur" description="La liste est vide." />
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Clinique</TableHead>
                <TableHead>Sévérité</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Correlation ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((error) => (
                <TableRow 
                  key={error.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedErrorId(error.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedErrorId(error.id);
                    }
                  }}
                >
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {format(new Date(error.createdAt), 'dd MMM yyyy HH:mm', { locale: fr })}
                  </TableCell>
                  <TableCell>
                    {error.clinic ? (
                      <div className="font-medium">{error.clinic.name}</div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={error.severity === 'FATAL' || error.severity === 'ERROR' ? 'destructive' : 'secondary'}>
                      {SEVERITY_LABELS[error.severity] || error.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{error.module}</TableCell>
                  <TableCell className="text-sm max-w-xs truncate" title={error.message}>
                    {error.message}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {error.correlationId || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedErrorId && (
        <ErrorDetailModal errorId={selectedErrorId} onClose={() => setSelectedErrorId(null)} />
      )}
    </div>
  );
}

function ErrorDetailModal({ errorId, onClose }: { errorId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['ops-error', errorId],
    queryFn: () => api.get(`/ops/errors/${errorId}`, opsErrorSchema),
  });

  return (
    <Dialog open={true} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle>Détail de l'erreur</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-6 overflow-y-auto flex-1 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Spinner className="h-6 w-6" />
            </div>
          ) : data ? (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block">ID</span>
                  <span className="font-mono">{data.id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Correlation ID</span>
                  <span className="font-mono">{data.correlationId || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Module</span>
                  <span>{data.module}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Date</span>
                  <span>{format(new Date(data.createdAt), 'dd MMM yyyy HH:mm:ss', { locale: fr })}</span>
                </div>
              </div>
              
              <div>
                <h3 className="font-medium text-foreground mb-2">Message</h3>
                <div className="p-3 bg-destructive/10 text-destructive rounded-md border border-destructive/20 font-mono text-sm">
                  {data.message}
                </div>
              </div>

              {data.context && (
                <div>
                  <h3 className="font-medium text-foreground mb-2">Contexte</h3>
                  <pre className="p-3 bg-muted rounded-md border border-border overflow-x-auto text-xs font-mono">
                    {JSON.stringify(data.context, null, 2)}
                  </pre>
                </div>
              )}

              {data.stack && (
                <div>
                  <h3 className="font-medium text-foreground mb-2">Trace d'appels</h3>
                  <pre className="p-3 bg-slate-900 text-slate-50 rounded-md overflow-x-auto text-xs font-mono">
                    {data.stack}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <div className="text-center p-8 text-muted-foreground">Erreur introuvable.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
