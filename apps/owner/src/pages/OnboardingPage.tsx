import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { opsOnboardingRequestListResponseSchema, OpsOnboardingRequest, UpdateOpsOnboardingRequest, opsOnboardingRequestSchema } from '@zenvy/shared/src/ops';
import { EmptyState, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge, Button, Input, Label } from '@zenvy/ui';
import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { X, AlertCircle, Users } from 'lucide-react';

export function OnboardingPage() {
  const [selectedRequest, setSelectedRequest] = useState<OpsOnboardingRequest | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ops-onboarding'],
    queryFn: () => api.get('/ops/onboarding-requests', opsOnboardingRequestListResponseSchema),
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">File d'attente d'onboarding</h1>
      </div>

      {isLoading ? (
        <div className="animate-pulse flex flex-col space-y-4">
          <div className="h-10 bg-slate-200 rounded"></div>
          <div className="h-32 bg-slate-100 rounded"></div>
        </div>
      ) : isError ? (
        <EmptyState icon={AlertCircle} title="Erreur" description="Impossible de charger la file d'attente." />
      ) : !data?.items.length ? (
        <EmptyState icon={Users} title="Aucune demande" description="La file d'attente est vide." />
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clinique</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date d'inscription</TableHead>
                <TableHead>Appel programmé</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>
                    <div className="font-medium text-slate-900">{req.clinic.name}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={req.status === 'PENDING' ? 'default' : req.status === 'DONE' ? 'secondary' : 'outline'}>
                      {req.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {format(new Date(req.createdAt), 'dd MMM yyyy', { locale: fr })}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {req.scheduledCallAt ? format(new Date(req.scheduledCallAt), 'dd MMM yyyy HH:mm', { locale: fr }) : '-'}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500 max-w-xs truncate">
                    {req.notes || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setSelectedRequest(req)}>
                      Gérer
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedRequest && (
        <OnboardingDetailModal request={selectedRequest} onClose={() => setSelectedRequest(null)} />
      )}
    </div>
  );
}

function OnboardingDetailModal({ request, onClose }: { request: OpsOnboardingRequest; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(request.status);
  const [notes, setNotes] = useState(request.notes || '');
  
  // Format for datetime-local input: YYYY-MM-DDThh:mm
  const [scheduledDate, setScheduledDate] = useState(
    request.scheduledCallAt ? new Date(request.scheduledCallAt).toISOString().slice(0, 16) : ''
  );

  const mutation = useMutation({
    mutationFn: (data: UpdateOpsOnboardingRequest) => 
      api.patch(`/ops/onboarding-requests/${request.id}`, opsOnboardingRequestSchema, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-onboarding'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      status,
      notes: notes || null,
      scheduledCallAt: scheduledDate ? new Date(scheduledDate).toISOString() : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Gérer l'onboarding : {request.clinic.name}</h2>
          <Button variant="outline" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <Label>Statut</Label>
            <select 
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={status} 
              onChange={(e) => setStatus(e.target.value as OpsOnboardingRequest['status'])}
            >
              <option value="PENDING">PENDING</option>
              <option value="CALL_SCHEDULED">CALL_SCHEDULED</option>
              <option value="DONE">DONE</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Appel programmé</Label>
            <Input 
              type="datetime-local" 
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <textarea 
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes d'onboarding..."
            />
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
