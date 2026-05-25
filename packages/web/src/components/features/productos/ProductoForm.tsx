'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Producto } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const schema = z.object({
  code: z.string().min(1, 'Requerido'),
  name: z.string().min(1, 'Requerido'),
  unit: z.string().min(1, 'Requerido'),
  minStock: z.coerce.number().nonnegative().nullable(),
  stockOnHand: z.coerce.number().nonnegative(),
  aliases: z.string(),
});

type FormValues = z.infer<typeof schema>;

interface ProductoFormProps {
  open: boolean;
  onClose: () => void;
  editing?: Producto | null;
}

export function ProductoForm({ open, onClose, editing }: ProductoFormProps) {
  const qc = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? {
          code: editing.code,
          name: editing.name,
          unit: editing.unit,
          minStock: editing.minStock ?? null,
          stockOnHand: editing.stockOnHand,
          aliases: editing.aliases.join(', '),
        }
      : { stockOnHand: 0, aliases: '' },
  });

  const createMutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.productos.create({
        code: data.code,
        name: data.name,
        unit: data.unit,
        minStock: data.minStock,
        stockOnHand: data.stockOnHand,
        aliases: data.aliases ? data.aliases.split(',').map((a) => a.trim()).filter(Boolean) : [],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      reset();
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.productos.update(editing!.id, {
        code: data.code,
        name: data.name,
        unit: data.unit,
        minStock: data.minStock,
        aliases: data.aliases ? data.aliases.split(',').map((a) => a.trim()).filter(Boolean) : [],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      onClose();
    },
  });

  const mutation = editing ? updateMutation : createMutation;

  const onSubmit = handleSubmit((data) => mutation.mutate(data));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="code">Código *</Label>
              <Input id="code" {...register('code')} disabled={!!editing} />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="unit">Unidad *</Label>
              <Input id="unit" {...register('unit')} placeholder="kg, un, lt" />
              {errors.unit && <p className="text-xs text-destructive">{errors.unit.message}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="name">Nombre *</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="minStock">Stock mínimo</Label>
              <Input id="minStock" type="number" step="0.001" {...register('minStock')} />
            </div>
            {!editing && (
              <div className="space-y-1">
                <Label htmlFor="stockOnHand">Stock inicial</Label>
                <Input id="stockOnHand" type="number" step="0.001" {...register('stockOnHand')} />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="aliases">Alias (separados por coma)</Label>
            <Input id="aliases" {...register('aliases')} placeholder="coca cola, coca, gaseosa" />
          </div>
          {mutation.error && (
            <p className="text-sm text-destructive">
              {mutation.error instanceof Error ? mutation.error.message : 'Error inesperado'}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
