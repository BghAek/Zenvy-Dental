import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
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
import { Sparkles, X, CheckCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { sessionKeys } from '../../lib/queries/session';

interface AiFormValues {
  tone: string;
  hours: string;
  prices: string;
  faq: string;
}

const TONE_PRESETS = [
  'chaleureux et professionnel',
  'direct, efficace et concis',
  'rassurant, doux et empathique',
];

export function Step3AiConfig() {
  const navigate = useNavigate();
  const updateClinic = useUpdateClinic();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const [services, setServices] = useState<string[]>([
    'Détartrage',
    'Carie',
    'Blanchiment',
    'Urgence dentaire',
  ]);
  const [newService, setNewService] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AiFormValues>({
    defaultValues: {
      tone: 'chaleureux et professionnel',
      hours: 'Lun–Ven 9h–19h',
      prices: 'Consultation : 30 €\nDétartrage : 80 €\nBlanchiment : 390 €',
      faq: "Q: Que faire en cas d'urgence ?\nR: Contactez-nous par téléphone ou présentez-vous aux urgences dentaires les plus proches.",
    },
  });

  const handleAddService = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newService.trim();
    if (trimmed && !services.includes(trimmed)) {
      setServices([...services, trimmed]);
      setNewService('');
    }
  };

  const handleRemoveService = (service: string) => {
    setServices(services.filter((s) => s !== service));
  };

  const onSubmit = async (data: AiFormValues) => {
    setError(null);
    try {
      await updateClinic.mutateAsync({
        onboardingStatus: 'COMPLETED',
        aiConfig: {
          tone: data.tone,
          hours: data.hours,
          prices: data.prices,
          faq: data.faq,
          services,
        },
      });
      
      // Invalidate the session so RequireAuth picks up the completed status 
      // and redirect to the dashboard
      await queryClient.invalidateQueries({ queryKey: sessionKeys.me });
      navigate('/');
    } catch {
      setError("Une erreur est survenue lors de l'enregistrement.");
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="mb-2 text-sm font-medium text-muted-foreground">
          Étape 3 sur 3
        </div>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Sparkles className="h-6 w-6 text-indigo-500 fill-indigo-100" />
          Configuration de l'Assistant IA
        </CardTitle>
        <CardDescription>
          Dernière étape ! Donnez à votre assistant IA son comportement et ses connaissances initiales.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Tone Configuration */}
          <div className="space-y-3">
            <Label htmlFor="tone">Ton de l'assistant</Label>
            <Input
              id="tone"
              placeholder="ex: chaleureux et professionnel"
              {...register('tone', { required: 'Le ton de l’assistant est requis.' })}
              disabled={updateClinic.isPending}
            />
            {errors.tone && (
              <p className="text-sm font-medium text-destructive">{errors.tone.message}</p>
            )}
            
            <div className="flex flex-wrap gap-2 mt-2">
              {TONE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setValue('tone', preset, { shouldDirty: true })}
                  className="text-xs px-2.5 py-1 rounded bg-muted hover:bg-slate-200 text-muted-foreground transition-colors cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Opening Hours */}
          <div className="space-y-2">
            <Label htmlFor="hours">Horaires d'ouverture</Label>
            <Input
              id="hours"
              placeholder="ex: Lun–Ven 9h–19h"
              {...register('hours')}
              disabled={updateClinic.isPending}
            />
          </div>

          {/* Services */}
          <div className="space-y-2">
            <Label>Services proposés</Label>
            <div className="flex flex-wrap gap-2 mb-3 min-h-10 p-2 border border-input rounded-md bg-background">
              {services.length === 0 ? (
                <span className="text-sm text-muted-foreground self-center px-1">
                  Aucun service configuré.
                </span>
              ) : (
                services.map((service) => (
                  <div
                    key={service}
                    className="flex items-center gap-1.5 text-sm font-semibold bg-secondary text-secondary-foreground pl-3 pr-1.5 py-1 rounded-full border border-border"
                  >
                    <span>{service}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveService(service)}
                      className="rounded-full hover:bg-slate-300 p-0.5 transition-colors cursor-pointer"
                      disabled={updateClinic.isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
            
            <div className="flex gap-2">
              <Input
                placeholder="Ajouter un service (ex: Détartrage)"
                value={newService}
                onChange={(e) => setNewService(e.target.value)}
                disabled={updateClinic.isPending}
              />
              <Button type="button" variant="outline" onClick={handleAddService}>
                Ajouter
              </Button>
            </div>
          </div>

          {/* Prices */}
          <div className="space-y-2">
            <Label htmlFor="prices">Grille tarifaire (indicative)</Label>
            <textarea
              id="prices"
              rows={4}
              placeholder="ex: Consultation standard : 30 €"
              {...register('prices')}
              disabled={updateClinic.isPending}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* FAQ Base Knowledge */}
          <div className="space-y-2">
            <Label htmlFor="faq">Foire aux questions (FAQ)</Label>
            <textarea
              id="faq"
              rows={4}
              placeholder="Q: Quel est l'accès handicapé ?\nR: Oui, rampe d'accès disponible."
              {...register('faq')}
              disabled={updateClinic.isPending}
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" size="lg" disabled={updateClinic.isPending}>
              {updateClinic.isPending ? <Spinner className="mr-2 h-4 w-4" /> : <CheckCircle className="mr-2 h-5 w-5" />}
              Terminer la configuration
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
