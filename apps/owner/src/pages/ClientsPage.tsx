import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  CLINIC_ONBOARDING_STATUS_LABELS,
  PLAN_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  opsClientListResponseSchema,
} from '@zenvy/shared';
import { EmptyState, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge, Input } from '@zenvy/ui';
import { Search, AlertCircle, Users } from 'lucide-react';
import { useState } from 'react';
import { useDebouncedValue } from '../lib/useDebouncedValue';

export function ClientsPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ops-clients', debouncedSearch],
    // ponytail: first page at the API max (100), no cursor UI — add load-more
    // when a list actually crosses 100 rows.
    queryFn: () =>
      api.get('/ops/clients', opsClientListResponseSchema, {
        search: debouncedSearch || undefined,
        limit: 100,
      }),
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Clients</h1>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Rechercher..." 
            className="pl-9" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse flex flex-col space-y-4">
          <div className="h-10 bg-muted rounded"></div>
          <div className="h-32 bg-muted/50 rounded"></div>
        </div>
      ) : isError ? (
        <EmptyState icon={AlertCircle} title="Erreur" description="Impossible de charger les clients." />
      ) : !data?.items.length ? (
        <EmptyState icon={Users} title="Aucun client" description="Aucun client trouvé pour cette recherche." />
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clinique</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Onboarding</TableHead>
                <TableHead>Abonnement</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead className="text-right">Patients</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{client.name}</div>
                    <div className="text-xs text-muted-foreground">{client.slug}</div>
                  </TableCell>
                  <TableCell>{client.phone || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {CLINIC_ONBOARDING_STATUS_LABELS[client.onboardingStatus] || client.onboardingStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {client.subscription ? (
                      <div className="flex flex-col gap-1">
                        <Badge>
                          {SUBSCRIPTION_STATUS_LABELS[client.subscription.status] || client.subscription.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {PLAN_LABELS[client.subscription.plan] || client.subscription.plan}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {client.whatsappConnected ? (
                      <Badge variant="default" className="bg-success text-success-foreground hover:bg-success/80">Connecté</Badge>
                    ) : (
                      <Badge variant="secondary">Non connecté</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {client.counts.patients}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
