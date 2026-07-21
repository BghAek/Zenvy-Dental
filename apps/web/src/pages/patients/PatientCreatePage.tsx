import { Link, useNavigate } from 'react-router-dom';
import { useCreatePatient } from '../../lib/queries/patients';
import { PatientForm } from './components/PatientForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@zenvy/ui';
import { ArrowLeft } from 'lucide-react';
import { CreatePatientRequest } from '@zenvy/shared/src/patients';

export function PatientCreatePage() {
  const navigate = useNavigate();
  const { mutateAsync: createPatient, isPending } = useCreatePatient();

  const handleSubmit = async (data: CreatePatientRequest) => {
    const newPatient = await createPatient(data);
    navigate(`/patients/${newPatient.id}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/patients" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux patients
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Nouveau patient</h1>
        <p className="text-muted-foreground">Ajoutez un patient manuellement à votre base de données.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations du patient</CardTitle>
          <CardDescription>
            Saisissez les coordonnées du patient. Le numéro de téléphone sera automatiquement formaté.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PatientForm onSubmit={handleSubmit} isLoading={isPending} />
        </CardContent>
      </Card>
    </div>
  );
}
