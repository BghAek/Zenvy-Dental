import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useCreateClinic } from '../../lib/queries/onboarding';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Alert,
  AlertDescription,
  Spinner,
} from '@zenvy/ui';
import { Building2 } from 'lucide-react';

interface ClinicFormValues {
  name: string;
  phone: string;
  address: string;
  timezone: string;
}

export function Step1ClinicInfo() {
  const navigate = useNavigate();
  const createClinic = useCreateClinic();
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClinicFormValues>({
    defaultValues: {
      name: '',
      phone: '',
      address: '',
      timezone: 'Europe/Paris',
    },
  });

  const onSubmit = async (data: ClinicFormValues) => {
    try {
      await createClinic.mutateAsync({
        name: data.name,
        phone: data.phone || undefined,
        address: data.address || undefined,
        timezone: data.timezone || 'Europe/Paris',
      });
      // Proceed to the next step
      navigate('/onboarding/whatsapp');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="mb-2 text-sm font-medium text-muted-foreground">
          Étape 1 sur 3
        </div>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Building2 className="h-6 w-6 text-primary" />
          Votre cabinet
        </CardTitle>
        <CardDescription>
          Commençons par les informations de base de votre cabinet dentaire. 
          Celles-ci seront utilisées pour configurer votre compte.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {createClinic.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                Une erreur est survenue lors de la création du cabinet. Veuillez vérifier les informations et réessayer.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Nom du cabinet *</Label>
            <Input
              id="name"
              placeholder="ex: Cabinet Dentaire Lumière"
              {...register('name', { required: 'Le nom du cabinet est requis.' })}
              disabled={createClinic.isPending}
            />
            {errors.name && (
              <p className="text-sm font-medium text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Numéro de téléphone</Label>
            <Input
              id="phone"
              placeholder="ex: +33 1 45 88 77 66"
              {...register('phone')}
              disabled={createClinic.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Le numéro que vos patients utilisent pour vous contacter.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Adresse</Label>
            <Input
              id="address"
              placeholder="ex: 12 rue de la Paix, 75002 Paris"
              {...register('address')}
              disabled={createClinic.isPending}
            />
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" size="lg" disabled={createClinic.isPending}>
              {createClinic.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
              Continuer
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
