import { useState } from 'react';
import { usePatients } from '../../lib/queries/patients';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
  Input,
  Badge,
  Spinner,
} from '@zenvy/ui';
import { Search, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export function PatientListPage() {
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const navigate = useNavigate();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = usePatients({
    limit: 20,
    search: search || undefined,
    tag: tag || undefined,
  });

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const patients = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Patients</h1>
          <p className="text-muted-foreground">Gérez votre base de patients.</p>
        </div>
        <Link to="/patients/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nouveau patient
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Rechercher par nom ou numéro..."
            className="pl-8"
            value={search}
            onChange={handleSearch}
          />
        </div>
        <Input
          placeholder="Filtrer par étiquette..."
          className="max-w-[200px]"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Étiquettes</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Spinner className="mx-auto h-6 w-6" />
                </TableCell>
              </TableRow>
            ) : patients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Aucun patient trouvé.
                </TableCell>
              </TableRow>
            ) : (
              patients.map((patient) => (
                <TableRow key={patient.id} className="cursor-pointer" onClick={() => navigate(`/patients/${patient.id}`)}>
                  <TableCell className="font-medium">
                    {patient.firstName} {patient.lastName}
                  </TableCell>
                  <TableCell>{patient.phone}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {patient.tags.map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{patient.source === 'MANUAL' ? 'Manuel' : 'Système'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/patients/${patient.id}/edit`); }}>
                      Modifier
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? <Spinner className="mr-2 h-4 w-4" /> : null}
            Charger plus
          </Button>
        </div>
      )}
    </div>
  );
}
