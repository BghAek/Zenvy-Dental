import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Calendar as CalendarIcon, List as ListIcon, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { Button, EmptyState, Spinner, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@zenvy/ui';
import { useAppointments } from '../../lib/queries/appointments';
import { AppointmentStatusBadge } from './components/AppointmentStatusBadge';
import { AppointmentCalendarLite } from './components/AppointmentCalendarLite';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';

export function AppointmentListPage() {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [currentWeek, setCurrentWeek] = useState(new Date());

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });

  // If in list view, we just fetch without bounding by week (or we could, but let's just fetch all paginated)
  // If in calendar view, we pass from/to
  const queryFilters = view === 'calendar' ? {
    limit: 50,
    from: weekStart.toISOString(),
    to: weekEnd.toISOString()
  } : { limit: 20 };

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useAppointments(queryFilters);

  const handlePrevWeek = () => setCurrentWeek((prev) => subWeeks(prev, 1));
  const handleNextWeek = () => setCurrentWeek((prev) => addWeeks(prev, 1));
  const handleToday = () => setCurrentWeek(new Date());

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Erreur"
        description="Impossible de charger les rendez-vous."
        action={<Button onClick={() => window.location.reload()}>Réessayer</Button>}
      />
    );
  }

  const appointments = data?.pages.flatMap((page) => page.items) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Rendez-vous</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center border rounded-md overflow-hidden bg-background">
            <button
              onClick={() => setView('list')}
              className={`p-2 ${view === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <ListIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`p-2 ${view === 'calendar' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <CalendarIcon className="w-4 h-4" />
            </button>
          </div>
          <Button asChild>
            <Link to="/appointments/new">
              <Plus className="w-4 h-4 mr-2" />
              Nouveau rendez-vous
            </Link>
          </Button>
        </div>
      </div>

      {view === 'calendar' && (
        <div className="flex items-center justify-between bg-card p-4 rounded-lg border">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevWeek}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleNextWeek}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={handleToday}>
              Aujourd'hui
            </Button>
          </div>
          <h2 className="text-lg font-medium">
            Semaine du {format(weekStart, 'd MMMM yyyy', { locale: fr })}
          </h2>
        </div>
      )}

      {appointments.length === 0 ? (
        <EmptyState
          icon={CalendarIcon}
          title="Aucun rendez-vous"
          description={view === 'calendar' ? "Il n'y a pas de rendez-vous pour cette semaine." : "Vous n'avez pas encore de rendez-vous."}
          action={
            <Button asChild>
              <Link to="/appointments/new">Planifier un rendez-vous</Link>
            </Button>
          }
        />
      ) : view === 'calendar' ? (
        <AppointmentCalendarLite appointments={appointments} currentDate={currentWeek} />
      ) : (
        <div className="bg-card rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date et heure</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Durée</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="font-medium">
                    {format(new Date(app.startsAt), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                  </TableCell>
                  <TableCell>
                    {app.patient.firstName} {app.patient.lastName}
                  </TableCell>
                  <TableCell>{app.type}</TableCell>
                  <TableCell>{app.durationMin} min</TableCell>
                  <TableCell>
                    <AppointmentStatusBadge status={app.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/appointments/${app.id}`}>Détails</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {hasNextPage && (
            <div className="p-4 border-t flex justify-center">
              <Button 
                variant="outline" 
                onClick={() => fetchNextPage()} 
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? <Spinner className="mr-2 h-4 w-4" /> : null}
                Charger plus
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
