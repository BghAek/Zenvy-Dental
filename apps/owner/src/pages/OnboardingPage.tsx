import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ONBOARDING_REQUEST_STATUS_LABELS, opsOnboardingRequestListResponseSchema, OpsOnboardingRequest, UpdateOpsOnboardingRequest, opsOnboardingRequestSchema } from '@zenvy/shared';
import { EmptyState, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge, Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Alert, AlertDescription } from '@zenvy/ui';
import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AlertCircle, Users } from 'lucide-react';

export function OnboardingPage() {
  const [selectedRequest, setSelectedRequest] = useState<OpsOnboardingRequest | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ops-onboarding'],
    // ponytail: first page at the API max (100), no cursor UI — add load-more
    // when a list actually crosses 100 rows.
    queryFn: () =>
      api.get('/ops/onboarding-requests', opsOnboardingRequestListResponseSchema, { limit: 100 }),
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">File d'attente d'onboarding</h1>
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
          description="Impossible de charger la file d'attente." 
          action={<Button variant="outline" size="sm" onClick={() => refetch()}>Réessayer</Button>} 
        />
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
                    <div className="font-medium text-foreground">{req.clinic.name}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={req.status === 'PENDING' ? 'default' : req.status === 'DONE' ? 'secondary' : 'outline'}>
                      {ONBOARDING_REQUEST_STATUS_LABELS[req.status] || req.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(req.createdAt), 'dd MMM yyyy', { locale: fr })}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {req.scheduledCallAt ? format(new Date(req.scheduledCallAt), 'dd MMM yyyy HH:mm', { locale: fr }) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {req.notes || '—'}
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

function formatForDatetimeLocal(dateStr: string) {
  // Same idiom as apps/web's AppointmentForm datetime-local prefill.
  return format(new Date(dateStr), "yyyy-MM-dd'T'HH:mm");
}

function OnboardingDetailModal({ request, onClose }: { request: OpsOnboardingRequest; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(request.status);
  const [notes, setNotes] = useState(request.notes || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [scheduledDate, setScheduledDate] = useState(
    request.scheduledCallAt ? formatForDatetimeLocal(request.scheduledCallAt) : ''
  );

  const mutation = useMutation({
    mutationFn: (data: UpdateOpsOnboardingRequest) => 
      api.patch(`/ops/onboarding-requests/${request.id}`, opsOnboardingRequestSchema, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-onboarding'] });
      onClose();
    },
    onError: () => {
      setErrorMsg("Impossible d'enregistrer. Veuillez réessayer.");
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    let finalDate = null;
    if (scheduledDate) {
      const d = new Date(scheduledDate);
      finalDate = d.toISOString();
    }
    mutation.mutate({
      status,
      notes: notes || null,
      scheduledCallAt: finalDate,
    });
  };

  return (
    <Dialog open={true} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-lg flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle>Gérer l'onboarding : {request.clinic.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <Alert variant="destructive">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="status">Statut</Label>
            <Select value={status} onValueChange={(val: string) => setStatus(val as OpsOnboardingRequest['status'])}>
              <SelectTrigger id="status">
                <SelectValue placeholder="Sélectionner le statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">En attente</SelectItem>
                <SelectItem value="CALL_SCHEDULED">Appel programmé</SelectItem>
                <SelectItem value="DONE">Terminé</SelectItem>
                <SelectItem value="CANCELLED">Annulé</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="scheduledDate">Appel programmé</Label>
            <Input 
              id="scheduledDate"
              type="datetime-local" 
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea 
              id="notes"
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
      </DialogContent>
    </Dialog>
  );
}
