import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CreatePatientRequest,
  createPatientRequestSchema,
  Patient,
  ApiError,
} from '@zenvy/shared';
import { Button, Input, Alert, AlertDescription, Spinner, Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@zenvy/ui';
import { useState } from 'react';

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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prénom</FormLabel>
                <FormControl>
                  <Input {...field} disabled={isLoading} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nom</FormLabel>
                <FormControl>
                  <Input {...field} disabled={isLoading} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Téléphone</FormLabel>
              <FormControl>
                <Input type="tel" placeholder="06 12 34 56 78" {...field} disabled={isLoading} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tags"
          render={({ field: { value, onChange, ...field } }) => (
            <FormItem>
              <FormLabel>Étiquettes (séparées par des virgules)</FormLabel>
              <FormControl>
                <Input
                  placeholder="ex: Urgence, Nouveau"
                  {...field}
                  value={Array.isArray(value) ? value.join(', ') : value}
                  onChange={(e) => {
                    const val = e.target.value;
                    const parsed = val.split(',').map((t) => t.trim()).filter(Boolean);
                    onChange(parsed);
                  }}
                  disabled={isLoading}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} disabled={isLoading} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {initialData ? 'Enregistrer les modifications' : 'Ajouter le patient'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
