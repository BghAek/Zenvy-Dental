import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button, Spinner, EmptyState } from '@zenvy/ui';
import { ArrowLeft, Edit, Calendar, User, Clock, CheckCircle, Trash2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAppointment, useDeleteAppointment } from '../../lib/queries/appointments';
import { AppointmentStatusBadge } from './components/AppointmentStatusBadge';
import { AppointmentReminderList } from './components/AppointmentReminderList';

export function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const { data: appointment, isLoading, error } = useAppointment(id!);
  const { mutate: deleteAppt, isPending: isDeleting } = useDeleteAppointment();

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner /></div>;
  }

  if (error || !appointment) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Rendez-vous introuvable"
        description="Le rendez-vous que vous cherchez n'existe pas ou a été supprimé."
        action={<Button asChild><Link to="/appointments">Retour</Link></Button>}
      />
    );
  }

  const handleDelete = () => {
    if (confirm('Voulez-vous vraiment supprimer ce rendez-vous ? Cette action est irréversible.')) {
      deleteAppt(appointment.id, {
        onSuccess: () => {
          navigate('/appointments');
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link to="/appointments">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Détails du rendez-vous</h1>
          <AppointmentStatusBadge status={appointment.status} />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleDelete} disabled={isDeleting} className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20">
            <Trash2 className="w-4 h-4 mr-2" />
            Supprimer
          </Button>
          <Button asChild>
            <Link to={`/appointments/${appointment.id}/edit`}>
              <Edit className="w-4 h-4 mr-2" />
              Modifier
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-card rounded-lg border p-6 space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Informations générales
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Date et heure</p>
                <p className="font-medium mt-1">
                  {format(new Date(appointment.startsAt), "EEEE d MMMM yyyy", { locale: fr })}
                </p>
                <p className="text-muted-foreground">
                  {format(new Date(appointment.startsAt), "HH:mm", { locale: fr })}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Durée
                </p>
                <p className="font-medium mt-1">{appointment.durationMin} minutes</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Type d'acte
                </p>
                <p className="font-medium mt-1">{appointment.type}</p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-6 space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Patient
            </h2>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-lg">
                  {appointment.patient.firstName} {appointment.patient.lastName}
                </p>
                {appointment.patient.phone && (
                  <p className="text-muted-foreground">{appointment.patient.phone}</p>
                )}
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/patients/${appointment.patient.id}`}>Voir le dossier</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Suivi et Rappels
          </h2>
          <div className="pt-2">
            <AppointmentReminderList reminders={appointment.reminders} />
          </div>
        </div>
      </div>
    </div>
  );
}
