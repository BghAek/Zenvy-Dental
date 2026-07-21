import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CreatePatientRequest,
  createPatientRequestSchema,
  Patient,
} from '@zenvy/shared/src/patients';
import { Button, Input, Label, Alert, AlertDescription, Spinner } from '@zenvy/ui';
import { useState } from 'react';
import { ApiError } from '@zenvy/shared/src/errors';

type FormValues = z.input<typeof createPatientRequestSchema>;

interface PatientFormProps {
  initialData?: Patient;
  onSubmit: (data: CreatePatientRequest) => Promise<void>;
  isLoading?: boolean;
}

export function PatientForm({ initialData, onSubmit, isLoading }: PatientFormProps) {
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(createPatientRequestSchema),
    defaultValues: {
      firstName: initialData?.firstName ?? '',
      lastName: initialData?.lastName ?? '',
      phone: initialData?.phone ?? '',
      tags: initialData?.tags ?? [],
      notes: initialData?.notes ?? '',
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const handleFormSubmit = async (data: FormValues) => {
    setError(null);
    try {
      await onSubmit(data as CreatePatientRequest);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PATIENT_PHONE_EXISTS') {
        setError('Un patient avec ce numéro de téléphone existe déjà.');
      } else {
        setError("Une erreur s'est produite. Veuillez réessayer.");
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">Prénom</Label>
          <Input id="firstName" {...register('firstName')} disabled={isLoading} />
          {errors.firstName && (
            <p className="text-sm font-medium text-destructive">{errors.firstName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastName">Nom</Label>
          <Input id="lastName" {...register('lastName')} disabled={isLoading} />
          {errors.lastName && (
            <p className="text-sm font-medium text-destructive">{errors.lastName.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Téléphone</Label>
        <Input
          id="phone"
          type="tel"
          placeholder="06 12 34 56 78"
          {...register('phone')}
          disabled={isLoading}
        />
        {errors.phone && (
          <p className="text-sm font-medium text-destructive">{errors.phone.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">Étiquettes (séparées par des virgules)</Label>
        <Input
          id="tags"
          placeholder="ex: Urgence, Nouveau"
          disabled={isLoading}
          {...register('tags', {
            setValueAs: (value: string) =>
              value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
          })}
        />
        {errors.tags && (
          <p className="text-sm font-medium text-destructive">{errors.tags.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" {...register('notes')} disabled={isLoading} />
        {errors.notes && (
          <p className="text-sm font-medium text-destructive">{errors.notes.message}</p>
        )}
      </div>

      <div className="flex justify-end gap-4">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
