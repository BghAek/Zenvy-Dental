import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppointment, useUpdateAppointment } from '../../lib/queries/appointments';
import { AppointmentForm } from './components/AppointmentForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Spinner, EmptyState, Button } from '@zenvy/ui';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { CreateAppointmentRequest } from '@zenvy/shared';
import { AppointmentReminderList } from './components/AppointmentReminderList';

export function AppointmentEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const { data: appointment, isLoading, error } = useAppointment(id!);
  const { mutateAsync: updateAppointment, isPending: isUpdating } = useUpdateAppointment(id!);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner /></div>;
  }

  if (error || !appointment) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Rendez-vous introuvable"
        description="Le rendez-vous que vous cherchez n'existe pas."
        action={<Button asChild><Link to="/appointments">Retour</Link></Button>}
      />
    );
  }

  const handleSubmit = async (data: CreateAppointmentRequest) => {
    // Only send allowed update fields
    const { patientId: _, ...updateData } = data;
    await updateAppointment(updateData);
    navigate(`/appointments/${id}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/appointments/${id}`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux détails
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Modifier le rendez-vous</h1>
        <p className="text-muted-foreground">Mettez à jour les détails du rendez-vous pour {appointment.patient.firstName} {appointment.patient.lastName}.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Détails</CardTitle>
              <CardDescription>
                Modifiez la date, l'heure ou le statut. Le patient ne peut pas être modifié.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AppointmentForm 
                initialData={{
                  patientId: appointment.patient.id,
                  startsAt: appointment.startsAt,
                  durationMin: appointment.durationMin,
                  type: appointment.type,
                  status: appointment.status,
                }} 
                onSubmit={handleSubmit} 
                isLoading={isUpdating} 
                isEdit 
              />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Suivi des rappels</CardTitle>
              <CardDescription>
                État actuel des rappels programmés. Toute modification de date recalculera les rappels.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AppointmentReminderList reminders={appointment.reminders} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
