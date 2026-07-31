import { Link, useNavigate } from 'react-router-dom';
import { useCreateAppointment } from '../../lib/queries/appointments';
import { AppointmentForm } from './components/AppointmentForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@zenvy/ui';
import { ArrowLeft } from 'lucide-react';
import { CreateAppointmentRequest } from '@zenvy/shared';

export function AppointmentCreatePage() {
  const navigate = useNavigate();
  const { mutateAsync: createAppointment, isPending } = useCreateAppointment();

  const handleSubmit = async (data: CreateAppointmentRequest) => {
    const newAppointment = await createAppointment(data);
    navigate(`/appointments/${newAppointment.id}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/appointments" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux rendez-vous
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Nouveau rendez-vous</h1>
        <p className="text-muted-foreground">Planifiez un rendez-vous pour un patient existant.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations du rendez-vous</CardTitle>
          <CardDescription>
            Saisissez les détails de l'acte et la date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AppointmentForm onSubmit={handleSubmit} isLoading={isPending} />
        </CardContent>
      </Card>
    </div>
  );
}
