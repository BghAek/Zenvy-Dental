import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMe } from '../../lib/queries/session';
import {
  useStaffList,
  useInviteStaff,
  useRemoveStaff,
  useRevokeInvite,
} from '../../lib/queries/settings';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
} from '@zenvy/ui';
import { Mail, UserX, Trash2, ShieldAlert } from 'lucide-react';

interface InviteFormValues {
  email: string;
}

export function StaffSettings() {
  const { data: me } = useMe();
  const { data: staffData, isLoading: isStaffLoading, error: staffError } = useStaffList(
    me?.user.email,
    me?.user.name
  );
  
  const inviteStaff = useInviteStaff();
  const removeStaff = useRemoveStaff();
  const revokeInvite = useRevokeInvite();

  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteFormValues>({
    defaultValues: { email: '' },
  });

  const onInviteSubmit = async (data: InviteFormValues) => {
    setInviteSuccess(false);
    setInviteError(null);
    try {
      await inviteStaff.mutateAsync(data.email);
      setInviteSuccess(true);
      reset();
    } catch (err: any) {
      if (err.message === 'USER_ALREADY_IN_CLINIC') {
        setInviteError('Cet utilisateur appartient déjà à un cabinet.');
      } else if (err.message === 'INVITE_ALREADY_EXISTS') {
        setInviteError('Une invitation en attente existe déjà pour cette adresse.');
      } else {
        setInviteError("Impossible d'envoyer l'invitation. Veuillez réessayer.");
      }
    }
  };

  const handleRemoveMember = async (id: string, name: string) => {
    if (confirm(`Êtes-vous sûr de vouloir retirer ${name} de l'équipe ?`)) {
      try {
        await removeStaff.mutateAsync(id);
      } catch (err) {
        alert("Impossible de retirer ce membre.");
      }
    }
  };

  const handleRevokeInvite = async (id: string, email: string) => {
    if (confirm(`Êtes-vous sûr de vouloir annuler l'invitation envoyée à ${email} ?`)) {
      try {
        await revokeInvite.mutateAsync(id);
      } catch (err) {
        alert("Impossible d'annuler l'invitation.");
      }
    }
  };

  if (isStaffLoading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (staffError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Impossible de charger la liste des membres.
        </AlertDescription>
      </Alert>
    );
  }

  const isOwner = me?.user.role === 'CLINIC_OWNER';

  if (!isOwner) {
    return (
      <Card className="border-destructive/20 bg-destructive/5 text-destructive-foreground">
        <CardHeader className="flex flex-row items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-destructive" />
          <div>
            <CardTitle>Accès refusé</CardTitle>
            <CardDescription className="text-destructive-foreground/80">
              Seul le propriétaire du cabinet est autorisé à gérer l'équipe.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Invite Member form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Inviter un collaborateur
          </CardTitle>
          <CardDescription>
            Envoyez un e-mail d'invitation à un dentiste ou assistant pour qu'il rejoigne votre cabinet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onInviteSubmit)} className="space-y-4">
            {inviteSuccess && (
              <Alert className="border-green-500/20 bg-green-50 text-green-800">
                <AlertDescription>Invitation envoyée avec succès !</AlertDescription>
              </Alert>
            )}

            {inviteError && (
              <Alert variant="destructive">
                <AlertDescription>{inviteError}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center">
              <div className="flex-1 w-full space-y-2">
                <Label htmlFor="email">Adresse e-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="assistant@lumiere-dentaire.fr"
                  {...register('email', { required: 'L’adresse e-mail est requise.' })}
                  disabled={inviteStaff.isPending}
                />
                {errors.email && (
                  <p className="text-sm font-medium text-destructive">{errors.email.message}</p>
                )}
              </div>
              <Button type="submit" disabled={inviteStaff.isPending} className="w-full sm:w-auto mt-2 sm:mt-0 shrink-0">
                {inviteStaff.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
                Envoyer l'invitation
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Active Staff List */}
      <Card>
        <CardHeader>
          <CardTitle>Membres de l'équipe</CardTitle>
          <CardDescription>
            Liste des praticiens et assistants ayant accès à ce cabinet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Adresse e-mail</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Date d'inscription</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffData?.members.map((member) => {
                const isSelf = member.email.toLowerCase() === me?.user.email.toLowerCase();
                return (
                  <TableRow key={member.id}>
                    <TableCell className="font-semibold">{member.name} {isSelf && "(Vous)"}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      <Badge variant={member.role === 'CLINIC_OWNER' ? 'default' : 'secondary'}>
                        {member.role === 'CLINIC_OWNER' ? 'Propriétaire' : 'Collaborateur'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(member.createdAt).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell className="text-right">
                      {member.role !== 'CLINIC_OWNER' && !isSelf && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveMember(member.id, member.name)}
                          disabled={removeStaff.isPending}
                          title="Retirer de l'équipe"
                          className="hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pending Invites list */}
      {staffData?.invites && staffData.invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invitations en attente</CardTitle>
            <CardDescription>
              Invitations envoyées aux collaborateurs n'ayant pas encore créé leur compte.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destinataire</TableHead>
                  <TableHead>Expire le</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffData.invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium">{invite.email}</TableCell>
                    <TableCell>
                      {new Date(invite.expiresAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRevokeInvite(invite.id, invite.email)}
                        disabled={revokeInvite.isPending}
                        title="Annuler l'invitation"
                        className="hover:bg-slate-200 cursor-pointer"
                      >
                        <UserX className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
