import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMe } from '../../lib/queries/session';
import { useBillingCheckout, useBillingPortal } from '../../lib/queries/settings';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Alert,
  AlertDescription,
  Spinner,
  Badge,
} from '@zenvy/ui';
import { CreditCard, CheckCircle2, AlertTriangle, Calendar, Star } from 'lucide-react';

export function SubscriptionSettings() {
  const { data: me, refetch: refetchMe } = useMe();
  const [searchParams, setSearchParams] = useSearchParams();
  const checkoutMutation = useBillingCheckout();
  const portalMutation = useBillingPortal();
  
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const subscription = me?.subscription;
  
  // Handle return parameters from Checkout
  useEffect(() => {
    const checkoutResult = searchParams.get('checkout');
    if (checkoutResult === 'success') {
      // Simulate Stripe webhook update locally for the mock state
      const mockSub = {
        ...subscription,
        status: 'ACTIVE',
        trialEndsAt: null,
      };
      localStorage.setItem('zenvy_mock_subscription', JSON.stringify(mockSub));
      
      setSuccessMessage('Félicitations ! Votre abonnement Premium est désormais actif.');
      refetchMe();
      
      // Clean query parameters
      searchParams.delete('checkout');
      setSearchParams(searchParams);
    } else if (checkoutResult === 'cancelled') {
      setErrorMessage("L'abonnement a été annulé. Vous pouvez réessayer à tout moment.");
      searchParams.delete('checkout');
      setSearchParams(searchParams);
    }
  }, [searchParams, subscription, setSearchParams, refetchMe]);

  const handleCheckout = async () => {
    setErrorMessage(null);
    try {
      const res = await checkoutMutation.mutateAsync();
      if (res?.url) {
        window.location.href = res.url;
      } else {
        throw new Error('No redirection URL returned');
      }
    } catch {
      setErrorMessage("Impossible de démarrer la session de paiement. Veuillez réessayer.");
    }
  };

  const handlePortal = async () => {
    setErrorMessage(null);
    try {
      const res = await portalMutation.mutateAsync();
      if (res?.url) {
        window.location.href = res.url;
      } else {
        throw new Error('No portal URL returned');
      }
    } catch {
      setErrorMessage("Impossible d'ouvrir le portail de facturation. Veuillez réessayer.");
    }
  };

  if (!subscription) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Aucun abonnement trouvé pour ce cabinet.</AlertDescription>
      </Alert>
    );
  }

  // Calculate remaining trial days
  const getTrialDaysLeft = () => {
    if (!subscription.trialEndsAt) return 0;
    const diffTime = new Date(subscription.trialEndsAt).getTime() - Date.now();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const trialDaysLeft = getTrialDaysLeft();

  return (
    <div className="space-y-6">
      {successMessage && (
        <Alert className="border-green-500/20 bg-green-50 text-green-800">
          <AlertDescription className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            {successMessage}
          </AlertDescription>
        </Alert>
      )}

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {errorMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* Subscription Card Status */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Détails de l'abonnement
              </CardTitle>
              <CardDescription>
                Consultez le statut de facturation de votre cabinet dentaire.
              </CardDescription>
            </div>
            <div>
              {subscription.status === 'ACTIVE' && (
                <Badge className="bg-green-100 text-green-800 border-green-200 font-semibold px-3 py-1 text-sm">
                  Actif
                </Badge>
              )}
              {subscription.status === 'TRIALING' && (
                <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-semibold px-3 py-1 text-sm">
                  Période d'essai
                </Badge>
              )}
              {subscription.status === 'PAST_DUE' && (
                <Badge className="bg-red-100 text-red-800 border-red-200 font-semibold px-3 py-1 text-sm">
                  Paiement en attente
                </Badge>
              )}
              {subscription.status === 'CANCELED' && (
                <Badge className="bg-slate-100 text-slate-800 border-slate-200 font-semibold px-3 py-1 text-sm">
                  Résilié
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Plan Info */}
          <div className="p-6 border border-border rounded-lg bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-bold text-lg text-slate-800">
                <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                Plan Premium Zenvy
              </div>
              <p className="text-sm text-muted-foreground">
                Accès illimité à l'assistant IA WhatsApp, gestion des patients et des rendez-vous.
              </p>
            </div>
            <div className="text-left md:text-right shrink-0">
              <div className="text-3xl font-extrabold text-slate-800">399 €</div>
              <div className="text-xs text-muted-foreground">par mois / cabinet (TVA non incluse)</div>
            </div>
          </div>

          {/* Conditional trial alert */}
          {subscription.status === 'TRIALING' && (
            <div className="p-4 border border-blue-200/50 bg-blue-50/50 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex gap-3">
                <Calendar className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-blue-900">
                    Il vous reste {trialDaysLeft} jour{trialDaysLeft > 1 ? 's' : ''} d'essai gratuit
                  </div>
                  <p className="text-xs text-blue-800/80">
                    Votre période d'essai prendra fin le{' '}
                    {subscription.trialEndsAt
                      ? new Date(subscription.trialEndsAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })
                      : ''}
                    .
                  </p>
                </div>
              </div>
              <Button
                onClick={handleCheckout}
                disabled={checkoutMutation.isPending}
                className="shrink-0 font-semibold"
              >
                {checkoutMutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
                Activer l'abonnement
              </Button>
            </div>
          )}

          {/* Conditional past due alert */}
          {subscription.status === 'PAST_DUE' && (
            <div className="p-4 border border-red-200/50 bg-red-50/50 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-red-900">Échec du paiement récent</div>
                  <p className="text-xs text-red-800/80">
                    Veuillez mettre à jour votre carte bancaire sur Stripe pour rétablir les services.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={handlePortal}
                disabled={portalMutation.isPending}
                className="shrink-0 font-semibold"
              >
                {portalMutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
                Mettre à jour ma carte
              </Button>
            </div>
          )}

          {/* Active Billing details */}
          {subscription.status === 'ACTIVE' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-border pt-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Votre abonnement est géré en toute sécurité via Stripe.
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Consultez vos factures, modifiez vos coordonnées bancaires ou résiliez à tout moment.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handlePortal}
                disabled={portalMutation.isPending}
                className="shrink-0 font-semibold cursor-pointer"
              >
                {portalMutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
                Gérer l'abonnement sur Stripe
              </Button>
            </div>
          )}

          {/* Canceled Subscription Info */}
          {subscription.status === 'CANCELED' && (
            <div className="p-4 border border-slate-200 bg-slate-50 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-slate-800">Abonnement résilié</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Votre accès à l'assistant IA est suspendu. Réactivez votre compte pour reprendre l'activité.
                </p>
              </div>
              <Button
                onClick={handleCheckout}
                disabled={checkoutMutation.isPending}
                className="shrink-0 font-semibold cursor-pointer"
              >
                {checkoutMutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
                Réactiver mon compte
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
