import { useParams, Link, useNavigate } from 'react-router-dom';
import { usePatient, useDeletePatient } from '../../lib/queries/patients';
import { Button, Badge, Spinner, Alert, AlertDescription, Card, CardHeader, CardTitle, CardContent } from '@zenvy/ui';
import { ArrowLeft, Edit, Trash, Calendar } from 'lucide-react';
import { ApiError, PATIENT_SOURCE_LABELS } from '@zenvy/shared';

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: patient, isLoading, error } = usePatient(id!);
  const { mutate: deletePatient, isPending: isDeleting } = useDeletePatient();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error) {
    const isNotFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="space-y-6">
        <Link to="/patients" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux patients
        </Link>
        <Alert variant="destructive">
          <AlertDescription>
            {isNotFound ? 'Patient introuvable.' : "Une erreur s'est produite lors du chargement du patient."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!patient) return null;

  const handleDelete = () => {
    if (window.confirm('Voulez-vous vraiment supprimer ce patient ?')) {
      deletePatient(patient.id, {
        onSuccess: () => {
          navigate('/patients');
        },
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/patients" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-10 w-10">
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Retour</span>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {patient.firstName} {patient.lastName}
          </h1>
          <p className="text-muted-foreground">{patient.phone}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/patients/${patient.id}/edit`}>
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              Modifier
            </Button>
          </Link>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? <Spinner className="mr-2 h-4 w-4" /> : <Trash className="mr-2 h-4 w-4" />}
            Supprimer
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informations générales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Source</p>
              <p>{PATIENT_SOURCE_LABELS[patient.source] || patient.source}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Désabonnement WhatsApp</p>
              <p>{patient.optOut ? 'Oui' : 'Non'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Étiquettes</p>
              {patient.tags.length > 0 ? (
                <div className="flex gap-1 flex-wrap mt-1">
                  {patient.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Aucune étiquette</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {patient.notes ? (
              <p className="whitespace-pre-wrap">{patient.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Aucune note enregistrée.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Derniers rendez-vous</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Calendar className="mb-4 h-8 w-8 text-muted-foreground" />
            <Link to="/appointments" className="text-primary hover:underline font-medium">
              Voir les rendez-vous de ce patient
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
