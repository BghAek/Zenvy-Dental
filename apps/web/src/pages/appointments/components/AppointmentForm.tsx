import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@zenvy/ui';
import { CreateAppointmentRequest, createAppointmentRequestSchema, APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABELS } from '@zenvy/shared';
import { z } from 'zod';
import { usePatients } from '../../../lib/queries/patients';
import { format } from 'date-fns';

// `datetime-local` yields `yyyy-MM-ddTHH:mm` in the clinic's local time, which
// the wire schema (ISO-8601 UTC) rejects — validating the form against it left
// the submit button doing nothing. The form validates what the input produces;
// onSubmit converts to the contract shape.
const appointmentFormSchema = createAppointmentRequestSchema.extend({
  startsAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Date et heure invalides.'),
});

type FormValues = z.input<typeof appointmentFormSchema>;

interface AppointmentFormProps {
  initialData?: Partial<CreateAppointmentRequest>;
  onSubmit: (data: CreateAppointmentRequest) => void;
  isLoading: boolean;
  isEdit?: boolean;
}

export function AppointmentForm({ initialData, onSubmit, isLoading, isEdit = false }: AppointmentFormProps) {
  // A simple way to get patients for the dropdown. 
  // In a real app, this might be a searchable combobox.
  const { data: patientsData } = usePatients({ limit: 100 });
  const patients = patientsData?.pages.flatMap((page) => page.items) || [];

  const form = useForm<FormValues>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      patientId: initialData?.patientId || '',
      startsAt: initialData?.startsAt ? format(new Date(initialData.startsAt), "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'10:00"),
      durationMin: initialData?.durationMin || 30,
      type: initialData?.type || '',
      status: initialData?.status || 'SCHEDULED',
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => {
        // Zod date format needs to be valid ISO-8601 UTC or similar.
        // We ensure we send an ISO string.
        const isoString = new Date(data.startsAt as string).toISOString();
        onSubmit({ ...data, startsAt: isoString } as CreateAppointmentRequest);
      })} className="space-y-4">
        
        <FormField
          control={form.control}
          name="patientId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Patient</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                  disabled={isEdit}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionnez un patient" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="startsAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date et heure</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="durationMin"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Durée (minutes)</FormLabel>
              <FormControl>
                <Input 
                  type="number" 
                  {...field} 
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type d'acte</FormLabel>
              <FormControl>
                <Input placeholder="Détartrage, Contrôle..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {isEdit && (
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Statut</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Statut" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {APPOINTMENT_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>{APPOINTMENT_STATUS_LABELS[status] || status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="pt-4 flex justify-end gap-3">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
