import { AppointmentReminder } from '@zenvy/shared';
import { Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

function getKindLabel(kind: string) {
  switch (kind) {
    case 'REMINDER_24H': return 'Rappel 24h';
    case 'REMINDER_2H': return 'Rappel 2h';
    case 'FOLLOWUP': return 'Suivi J+1';
    case 'CUSTOM': return 'Message personnalisé';
    default: return kind;
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'PENDING': return <Clock className="w-4 h-4 text-muted-foreground" />;
    case 'SENT': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'CANCELLED': return <XCircle className="w-4 h-4 text-muted-foreground" />;
    case 'FAILED': return <AlertCircle className="w-4 h-4 text-destructive" />;
    default: return null;
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'PENDING': return 'En attente';
    case 'SENT': return 'Envoyé';
    case 'CANCELLED': return 'Annulé';
    case 'FAILED': return 'Échec';
    default: return status;
  }
}

export function AppointmentReminderList({ reminders }: { reminders: AppointmentReminder[] }) {
  if (!reminders || reminders.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun rappel programmé.</p>;
  }

  // Sort by sendAt asc
  const sorted = [...reminders].sort((a, b) => new Date(a.sendAt).getTime() - new Date(b.sendAt).getTime());

  return (
    <ul className="space-y-3">
      {sorted.map((reminder) => (
        <li key={reminder.id} className="flex items-start gap-3 text-sm">
          <div className="mt-0.5">{getStatusIcon(reminder.status)}</div>
          <div>
            <p className="font-medium">{getKindLabel(reminder.kind)}</p>
            <p className="text-muted-foreground">
              {format(new Date(reminder.sendAt), "EEEE d MMMM 'à' HH'h'mm", { locale: fr })} — {getStatusLabel(reminder.status)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
