import { Appointment } from '@zenvy/shared';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AppointmentStatusBadge } from './AppointmentStatusBadge';
import { Link } from 'react-router-dom';

interface AppointmentCalendarLiteProps {
  appointments: Appointment[];
  currentDate: Date;
}

export function AppointmentCalendarLite({ appointments, currentDate }: AppointmentCalendarLiteProps) {
  // Get start of the week (Monday)
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  
  // Generate 7 days
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  return (
    <div className="grid grid-cols-7 gap-4">
      {days.map((day) => {
        const dayAppointments = appointments.filter((app) => isSameDay(new Date(app.startsAt), day));
        const isToday = isSameDay(day, new Date());
        
        return (
          <div key={day.toISOString()} className="flex flex-col min-h-[400px] border rounded-lg bg-card overflow-hidden">
            <div className={`p-3 text-center border-b ${isToday ? 'bg-primary/10 text-primary font-semibold' : 'bg-muted/50'}`}>
              <div className="text-sm uppercase tracking-wider">{format(day, 'EEEE', { locale: fr })}</div>
              <div className="text-xl mt-1">{format(day, 'd', { locale: fr })}</div>
            </div>
            
            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
              {dayAppointments.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center pt-4">Libre</div>
              ) : (
                dayAppointments.map((app) => (
                  <Link 
                    key={app.id} 
                    to={`/appointments/${app.id}`}
                    className="block p-2 rounded-md border bg-background hover:border-primary/50 transition-colors text-left"
                  >
                    <div className="text-xs font-semibold mb-1 text-primary">
                      {format(new Date(app.startsAt), 'HH:mm')} ({app.durationMin} min)
                    </div>
                    <div className="text-xs font-medium truncate mb-1">
                      {app.patient.firstName} {app.patient.lastName}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mb-1" title={app.type}>
                      {app.type}
                    </div>
                    <AppointmentStatusBadge status={app.status} />
                  </Link>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
