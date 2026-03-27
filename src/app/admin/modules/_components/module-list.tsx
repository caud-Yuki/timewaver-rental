'use client';

import { useState, useMemo } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DeviceModule } from '@/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, GripVertical } from 'lucide-react';

interface ModuleListProps {
  modules: DeviceModule[];
  onEdit: (module: DeviceModule) => void;
  onDelete: (id: string) => void;
  onReorder: (modules: DeviceModule[]) => void;
}

const SortableRow = ({ module, onEdit, onDelete }: { module: DeviceModule; onEdit: (module: DeviceModule) => void; onDelete: (id: string) => void; }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: module.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <TableRow ref={setNodeRef} style={style} {...attributes}>
      <TableCell className="pl-4 w-12 text-center">
        <div {...listeners} className="cursor-grab p-2">
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell className="font-medium">{module.name}</TableCell>
      <TableCell className="italic text-sm text-muted-foreground">{module.point}</TableCell>
      <TableCell className="text-right pr-4 space-x-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => onEdit(module)}>
          <Edit className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => onDelete(module.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
};

export const ModuleList = ({ modules, onEdit, onDelete, onReorder }: ModuleListProps) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const sortedModuleIds = useMemo(() => modules.map(m => m.id), [modules]);

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = modules.findIndex(m => m.id === active.id);
      const newIndex = modules.findIndex(m => m.id === over.id);
      const newModules = [...modules];
      const [removed] = newModules.splice(oldIndex, 1);
      newModules.splice(newIndex, 0, removed);
      onReorder(newModules);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortedModuleIds} strategy={verticalListSortingStrategy}>
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/10">
                <TableHead className="w-12"></TableHead>
                <TableHead>名称</TableHead>
                <TableHead>得点</TableHead>
                <TableHead className="text-right pr-4">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modules.length > 0 ? (
                modules.map(module => (
                    <SortableRow key={module.id} module={module} onEdit={onEdit} onDelete={onDelete} />
                ))
            ) : (
                <TableRow>
                    <TableCell colSpan={4} className="text-center h-48 text-muted-foreground">
                        モジュールが見つかりません。
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </SortableContext>
    </DndContext>
  );
};