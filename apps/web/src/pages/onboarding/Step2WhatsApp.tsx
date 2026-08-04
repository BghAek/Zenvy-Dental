import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
} from '@zenvy/ui';
import { MessageSquare, ArrowRight, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useUpdateClinic } from '../../lib/queries/settings';

export function Step2WhatsApp() {
  const navigate = useNavigate();
  const updateClinic = useUpdateClinic();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      // Simulate "We connect it for you" request
      // In the future this might hit a POST /onboarding-requests endpoint
      await updateClinic.mutateAsync({
        onboardingStatus: 'IN_PROGRESS',
      });
      
      // Proceed to the next step
      navigate('/onboarding/ai-config');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="mb-2 text-sm font-medium text-muted-foreground">
          Étape 2 sur 3
        </div>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <MessageSquare className="h-6 w-6 text-green-500" />
          Connexion WhatsApp
        </CardTitle>
        <CardDescription>
          Pour que l'assistant IA puisse communiquer avec vos patients, nous devons l'associer à votre numéro WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border bg-muted/50 p-6">
          <h3 className="mb-3 font-semibold">Comment ça marche ?</h3>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="font-bold text-foreground">1.</span>
              <p>Cliquez sur "Demander la connexion" ci-dessous.</p>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-foreground">2.</span>
              <p>Notre équipe technique (ZenvyDental Ops) recevra votre demande.</p>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-foreground">3.</span>
              <p>Nous vous contacterons rapidement pour valider l'association de votre numéro auprès de Meta (WhatsApp Business API).</p>
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button 
            variant="outline" 
            asChild
          >
            <a href="mailto:founder@zenvydental.fr?subject=Demande%20d'onboarding%20manuel" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Réserver un appel d'onboarding
            </a>
          </Button>

          <Button 
            size="lg" 
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            Demander la connexion
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
        
        <p className="text-center text-xs text-muted-foreground">
          Vous préférez que l'on s'occupe de tout avec vous de vive voix ? Réservez un appel avec notre équipe.
        </p>
      </CardContent>
    </Card>
  );
}
