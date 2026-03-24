'use client';

import { DeviceModule } from '@/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Edit, Trash2 } from 'lucide-react';

interface ModuleListProps {
  modules: DeviceModule[];
  onEdit: (module: DeviceModule) => void;
  onDelete: (id: string) => void;
}

export const ModuleList = ({ modules, onEdit, onDelete }: ModuleListProps) => {
  const sortedModules = [...modules].sort((a, b) => (a.order || 999) - (b.order || 999));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Key Feature</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedModules.map((module) => (
          <TableRow key={module.id}>
            <TableCell>{module.order}</TableCell>
            <TableCell className="font-medium">{module.name}</TableCell>
            <TableCell>{module.description}</TableCell>
            <TableCell className="italic text-sm text-muted-foreground">{module.point}</TableCell>
            <TableCell className="text-right space-x-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => onEdit(module)}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => onDelete(module.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};