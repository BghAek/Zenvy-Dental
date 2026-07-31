import { Badge } from '@zenvy/ui';
import { AppointmentStatus } from '@zenvy/shared';

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  SCHEDULED: { label: 'Planifié', variant: 'secondary' },
  CONFIRMED: { label: 'Confirmé', variant: 'default' },
  CANCELLED: { label: 'Annulé', variant: 'destructive' },
  NO_SHOW: { label: 'Non présenté', variant: 'destructive' },
  DONE: { label: 'Terminé', variant: 'outline' },
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const config = STATUS_CONFIG[status] || { label: status, variant: 'outline' };
  
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
