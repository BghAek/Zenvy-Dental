import { useForm } from 'react-hook-form';
import { useMe } from '../../lib/queries/session';
import { useUpdateClinic } from '../../lib/queries/settings';
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
import { useState } from 'react';

const TIMEZONES = [
  { value: 'Europe/Paris', label: 'Paris (Europe/Paris)' },
  { value: 'Europe/Brussels', label: 'Bruxelles (Europe/Brussels)' },
  { value: 'Europe/London', label: 'Londres (Europe/London)' },
  { value: 'America/New_York', label: 'New York (America/New_York)' },
];

interface ProfileFormValues {
  name: string;
  phone: string;
  address: string;
  timezone: string;
}

export function ProfileSettings() {
  const { data: me } = useMe();
  const updateClinic = useUpdateClinic();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clinic = me?.clinic;

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    defaultValues: {
      name: clinic?.name ?? '',
      phone: clinic?.phone ?? '',
      address: clinic?.address ?? '',
      timezone: clinic?.timezone ?? 'Europe/Paris',
    },
  });

  const onSubmit = async (data: ProfileFormValues) => {
    setSuccess(false);
    setError(null);
    try {
      await updateClinic.mutateAsync({
        name: data.name,
        phone: data.phone || null,
        address: data.address || null,
        timezone: data.timezone,
      });
      setSuccess(true);
    } catch (err) {
      setError("Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    }
  };

  const isOwner = me?.user.role === 'CLINIC_OWNER';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profil du cabinet</CardTitle>
        <CardDescription>
          Mettez à jour les coordonnées publiques et les paramètres de localisation de votre cabinet dentaire.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {success && (
            <Alert className="border-green-500/20 bg-green-50 text-green-800">
              <AlertDescription>Profil mis à jour avec succès !</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Nom du cabinet</Label>
            <Input
              id="name"
              {...register('name', { required: 'Le nom du cabinet est requis.' })}
              disabled={!isOwner || updateClinic.isPending}
            />
            {errors.name && (
              <p className="text-sm font-medium text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone du cabinet</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+33 1 45 88 77 66"
                {...register('phone')}
                disabled={!isOwner || updateClinic.isPending}
              />
              {errors.phone && (
                <p className="text-sm font-medium text-destructive">{errors.phone.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Fuseau horaire</Label>
              <select
                id="timezone"
                {...register('timezone')}
                disabled={!isOwner || updateClinic.isPending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              {errors.timezone && (
                <p className="text-sm font-medium text-destructive">{errors.timezone.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Adresse physique</Label>
            <Input
              id="address"
              placeholder="12 rue de la Paix, 75002 Paris"
              {...register('address')}
              disabled={!isOwner || updateClinic.isPending}
            />
            {errors.address && (
              <p className="text-sm font-medium text-destructive">{errors.address.message}</p>
            )}
          </div>

          {isOwner && (
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={!isDirty || updateClinic.isPending}>
                {updateClinic.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
                Enregistrer les modifications
              </Button>
            </div>
          )}

          {!isOwner && (
            <p className="text-xs text-muted-foreground mt-4 italic">
              * Seul le propriétaire du cabinet (CLINIC_OWNER) est autorisé à modifier ces informations.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
