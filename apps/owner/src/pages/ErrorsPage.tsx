import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { opsErrorListResponseSchema, opsErrorSchema } from '@zenvy/shared/src/ops';
import { EmptyState, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge, Input, Button } from '@zenvy/ui';
import { Search, X, AlertCircle, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export function ErrorsPage() {
  const [correlationId, setCorrelationId] = useState('');
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ops-errors', correlationId],
    queryFn: () => api.get('/ops/errors', opsErrorListResponseSchema, { correlationId: correlationId || undefined }),
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Journal des erreurs</h1>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
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
          <div className="h-10 bg-slate-200 rounded"></div>
          <div className="h-32 bg-slate-100 rounded"></div>
        </div>
      ) : isError ? (
        <EmptyState icon={AlertCircle} title="Erreur" description="Impossible de charger les erreurs." />
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
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setSelectedErrorId(error.id)}
                >
                  <TableCell className="whitespace-nowrap text-sm text-slate-500">
                    {format(new Date(error.createdAt), 'dd MMM yyyy HH:mm', { locale: fr })}
                  </TableCell>
                  <TableCell>
                    {error.clinic ? (
                      <div className="font-medium">{error.clinic.name}</div>
                    ) : (
                      <span className="text-slate-400">N/A</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={error.severity === 'FATAL' || error.severity === 'ERROR' ? 'destructive' : 'secondary'}>
                      {error.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{error.module}</TableCell>
                  <TableCell className="text-sm max-w-xs truncate" title={error.message}>
                    {error.message}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-slate-500">
                    {error.correlationId || '-'}
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
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Détail de l'erreur</h2>
          <Button variant="outline" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <div className="p-6 overflow-auto flex-1 space-y-6">
          {isLoading ? (
            <div>Chargement...</div>
          ) : data ? (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 block">ID</span>
                  <span className="font-mono">{data.id}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Correlation ID</span>
                  <span className="font-mono">{data.correlationId || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Module</span>
                  <span>{data.module}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Date</span>
                  <span>{format(new Date(data.createdAt), 'dd MMM yyyy HH:mm:ss')}</span>
                </div>
              </div>
              
              <div>
                <h3 className="font-medium text-slate-900 mb-2">Message</h3>
                <div className="p-3 bg-red-50 text-red-900 rounded border border-red-100 font-mono text-sm">
                  {data.message}
                </div>
              </div>

              {data.context && (
                <div>
                  <h3 className="font-medium text-slate-900 mb-2">Contexte</h3>
                  <pre className="p-3 bg-slate-50 rounded border border-slate-200 overflow-x-auto text-xs font-mono">
                    {JSON.stringify(data.context, null, 2)}
                  </pre>
                </div>
              )}

              {data.stack && (
                <div>
                  <h3 className="font-medium text-slate-900 mb-2">Stack Trace</h3>
                  <pre className="p-3 bg-slate-900 text-slate-50 rounded overflow-x-auto text-xs font-mono">
                    {data.stack}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <div>Erreur introuvable.</div>
          )}
        </div>
      </div>
    </div>
  );
}
