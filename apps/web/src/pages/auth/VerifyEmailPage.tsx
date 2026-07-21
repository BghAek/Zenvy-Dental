import { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Alert,
  AlertDescription,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@zenvy/ui';
import { Mail, CheckCircle2, XCircle } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const resendSchema = z.object({
  email: z.string().email('Adresse e-mail invalide.'),
});

type ResendFormValues = z.infer<typeof resendSchema>;

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);

  const form = useForm<ResendFormValues>({
    resolver: zodResolver(resendSchema),
    defaultValues: {
      email: '',
    },
  });

  useEffect(() => {
    if (!token) return;

    const verify = async () => {
      setVerificationStatus('loading');
      try {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        const res = await fetch(`${apiUrl}/api/v1/auth/verify-email?token=${token}`);
        if (!res.ok) {
          throw new Error('Jeton de vérification invalide ou expiré.');
        }
        setVerificationStatus('success');
      } catch (err: unknown) {
        setVerificationStatus('error');
        if (err instanceof Error) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage('Erreur de vérification.');
        }
      }
    };

    verify();
  }, [token]);

  const resendMutation = useMutation({
    mutationFn: async (values: ResendFormValues) => {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/v1/auth/send-verification-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: values.email,
        }),
      });

      if (!res.ok) {
        throw new Error('Impossible de renvoyer l\'e-mail.');
      }
    },
    onSuccess: () => {
      setResendSuccess(true);
    },
  });

  function onResendSubmit(values: ResendFormValues) {
    setResendSuccess(false);
    resendMutation.mutate(values);
  }

  // State 1: Verifying token
  if (verificationStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md text-center py-12">
          <CardContent className="space-y-4">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground">Vérification en cours...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // State 2: Verification success
  if (verificationStatus === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md text-center py-8">
          <CardHeader>
            <div className="mx-auto bg-green-100 p-3 rounded-full mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold">E-mail vérifié</CardTitle>
            <CardDescription>
              Votre adresse e-mail a été vérifiée avec succès. Vous pouvez maintenant poursuivre la configuration de votre cabinet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/')}>
              Continuer
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // State 3: Verification error or No token (Need to check email or resend)
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto bg-muted p-4 rounded-full w-fit">
            <Mail className="w-8 h-8 text-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Vérifiez vos e-mails</CardTitle>
          <CardDescription>
            Nous vous avons envoyé un lien pour vérifier votre adresse e-mail. Veuillez cliquer sur ce lien pour continuer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {verificationStatus === 'error' && (
            <Alert variant="destructive">
              <XCircle className="w-4 h-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {resendSuccess ? (
            <Alert>
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <AlertDescription className="text-green-700">
                E-mail de vérification renvoyé avec succès.
              </AlertDescription>
            </Alert>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onResendSubmit)} className="space-y-4">
                <div className="text-sm text-center font-medium">
                  Vous n'avez rien reçu ?
                </div>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Saisissez votre e-mail pour renvoyer le lien</FormLabel>
                      <FormControl>
                        <Input placeholder="contact@cabinet.fr" type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full"
                  disabled={resendMutation.isPending}
                >
                  {resendMutation.isPending ? 'Envoi en cours...' : 'Renvoyer le lien'}
                </Button>
              </form>
            </Form>
          )}

          <div className="text-center">
            <Link to="/login" className="text-sm text-primary hover:underline">
              Retour à la connexion
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
