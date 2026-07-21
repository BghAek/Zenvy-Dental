import { useParams, Link, useNavigate } from 'react-router-dom';
import { usePatient, useUpdatePatient } from '../../lib/queries/patients';
import { PatientForm } from './components/PatientForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Spinner, Alert, AlertDescription } from '@zenvy/ui';
import { ArrowLeft } from 'lucide-react';
import { UpdatePatientRequest } from '@zenvy/shared/src/patients';
import { ApiError } from '@zenvy/shared/src/errors';

export function PatientEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: patient, isLoading, error } = usePatient(id!);
  const { mutateAsync: updatePatient, isPending } = useUpdatePatient(id!);

  const handleSubmit = async (data: UpdatePatientRequest) => {
    // Only send the fields that we want to update. PatientForm sends CreatePatientRequest structure.
    await updatePatient(data);
    navigate(`/patients/${id}`);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error || !patient) {
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

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/patients/${id}`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour au profil
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Modifier le patient</h1>
        <p className="text-muted-foreground">Mettez à jour les informations de {patient.firstName} {patient.lastName}.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations du patient</CardTitle>
          <CardDescription>
            Modifiez les coordonnées du patient.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PatientForm initialData={patient} onSubmit={handleSubmit} isLoading={isPending} />
        </CardContent>
      </Card>
    </div>
  );
}
