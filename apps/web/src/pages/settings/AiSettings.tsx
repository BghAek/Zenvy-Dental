import { useState } from 'react';
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
import { X, Sparkles } from 'lucide-react';

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

export function AiSettings() {
  const { data: me } = useMe();
  const updateClinic = useUpdateClinic();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clinic = me?.clinic;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiConfig = (clinic as any)?.aiConfig || {};

  const [services, setServices] = useState<string[]>(
    aiConfig.services || ['Détartrage', 'Carie', 'Blanchiment', 'Urgence dentaire']
  );
  const [newService, setNewService] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AiFormValues>({
    defaultValues: {
      tone: aiConfig.tone ?? 'chaleureux et professionnel',
      hours: aiConfig.hours ?? 'Lun–Ven 9h–19h',
      prices:
        aiConfig.prices ??
        'Consultation : 30 €\nDétartrage : 80 €\nBlanchiment : 390 €',
      faq:
        aiConfig.faq ??
        "Q: Que faire en cas d'urgence ?\nR: Contactez-nous par téléphone ou présentez-vous aux urgences dentaires les plus proches.",
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
    setSuccess(false);
    setError(null);
    try {
      await updateClinic.mutateAsync({
        aiConfig: {
          tone: data.tone,
          hours: data.hours,
          prices: data.prices,
          faq: data.faq,
          services,
        },
      });
      setSuccess(true);
    } catch {
      setError("Une erreur est survenue lors de l'enregistrement de la configuration IA.");
    }
  };

  const isOwner = me?.user.role === 'CLINIC_OWNER';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-500 fill-indigo-100" />
          Configuration de l'Assistant IA
        </CardTitle>
        <CardDescription>
          Personnalisez la personnalité, les réponses types et les connaissances cliniques de votre assistant WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {success && (
            <Alert className="border-green-500/20 bg-green-50 text-green-800">
              <AlertDescription>Configuration IA enregistrée avec succès !</AlertDescription>
            </Alert>
          )}

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
              disabled={!isOwner || updateClinic.isPending}
            />
            {errors.tone && (
              <p className="text-sm font-medium text-destructive">{errors.tone.message}</p>
            )}
            
            {/* Tone Presets */}
            {isOwner && (
              <div className="flex flex-wrap gap-2 mt-2">
                {TONE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setValue('tone', preset, { shouldDirty: true });
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-muted hover:bg-slate-200 text-muted-foreground transition-colors cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Opening Hours */}
          <div className="space-y-2">
            <Label htmlFor="hours">Horaires d'ouverture communiqués</Label>
            <Input
              id="hours"
              placeholder="ex: Lun–Ven 9h–19h"
              {...register('hours')}
              disabled={!isOwner || updateClinic.isPending}
            />
            {errors.hours && (
              <p className="text-sm font-medium text-destructive">{errors.hours.message}</p>
            )}
          </div>

          {/* Services Tag Input */}
          <div className="space-y-2">
            <Label>Services proposés</Label>
            <div className="flex flex-wrap gap-2 mb-3 min-h-10 p-2 border border-input rounded-md bg-background">
              {services.length === 0 ? (
                <span className="text-sm text-muted-foreground self-center px-1">
                  Aucun service configuré. L'IA ne pourra pas proposer de soins.
                </span>
              ) : (
                services.map((service) => (
                  <div
                    key={service}
                    className="flex items-center gap-1.5 text-sm font-semibold bg-secondary text-secondary-foreground pl-3 pr-1.5 py-1 rounded-full border border-border"
                  >
                    <span>{service}</span>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => handleRemoveService(service)}
                        className="rounded-full hover:bg-slate-300 p-0.5 transition-colors cursor-pointer"
                        disabled={updateClinic.isPending}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
            
            {isOwner && (
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
            )}
          </div>

          {/* Tariffs / Prices */}
          <div className="space-y-2">
            <Label htmlFor="prices">Grille tarifaire (communiquée par l'IA)</Label>
            <textarea
              id="prices"
              rows={4}
              placeholder="ex: Consultation standard : 30 €"
              {...register('prices')}
              disabled={!isOwner || updateClinic.isPending}
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              Les tarifs ci-dessus seront transmis à l'IA comme référence unique de prix.
            </p>
          </div>

          {/* FAQ Base Knowledge */}
          <div className="space-y-2">
            <Label htmlFor="faq">Foire aux questions (FAQ) clinique</Label>
            <textarea
              id="faq"
              rows={6}
              placeholder="Q: Quel est l'accès handicapé ?\nR: Oui, rampe d'accès disponible."
              {...register('faq')}
              disabled={!isOwner || updateClinic.isPending}
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              Fournissez des informations cliniques courantes (urgences, accès, documents à apporter) sous forme de questions-réponses.
            </p>
          </div>

          {isOwner && (
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={updateClinic.isPending}>
                {updateClinic.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
                Enregistrer la configuration
              </Button>
            </div>
          )}

          {!isOwner && (
            <p className="text-xs text-muted-foreground mt-4 italic">
              * Seul le propriétaire du cabinet (CLINIC_OWNER) est autorisé à modifier la configuration IA.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
