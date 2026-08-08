import { Badge } from '@zenvy/ui';
import { AppointmentStatus, APPOINTMENT_STATUS_LABELS } from '@zenvy/shared';

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  SCHEDULED: { label: APPOINTMENT_STATUS_LABELS.SCHEDULED, variant: 'secondary' },
  CONFIRMED: { label: APPOINTMENT_STATUS_LABELS.CONFIRMED, variant: 'default' },
  CANCELLED: { label: APPOINTMENT_STATUS_LABELS.CANCELLED, variant: 'destructive' },
  NO_SHOW: { label: APPOINTMENT_STATUS_LABELS.NO_SHOW, variant: 'destructive' },
  DONE: { label: APPOINTMENT_STATUS_LABELS.DONE, variant: 'outline' },
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const config = STATUS_CONFIG[status] || { label: status, variant: 'outline' };
  
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
