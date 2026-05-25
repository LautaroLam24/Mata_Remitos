'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Proveedor } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const schema = z.object({
  name: z.string().min(1, 'Requerido'),
  cuit: z.string().min(11, 'CUIT inválido (11 dígitos)').max(13),
  email: z.string().email('Email inválido').or(z.literal('')).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface ProveedorFormProps {
  open: boolean;
  onClose: () => void;
  editing?: Proveedor | null;
}

export function ProveedorForm({ open, onClose, editing }: ProveedorFormProps) {
  const qc = useQueryClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? { name: editing.name, cuit: editing.cuit, email: editing.email ?? '', phone: editing.phone ?? '', address: editing.address ?? '' }
      : {},
  });

  const createMutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.proveedores.create({
        name: data.name,
        cuit: data.cuit,
        ...(data.email ? { email: data.email } : {}),
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.address ? { address: data.address } : {}),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); reset(); onClose(); },
  });

  const updateMutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.proveedores.update(editing!.id, {
        name: data.name,
        cuit: data.cuit,
        ...(data.email ? { email: data.email } : {}),
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.address ? { address: data.address } : {}),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); onClose(); },
  });

  const mutation = editing ? updateMutation : createMutation;
  const onSubmit = handleSubmit((data) => mutation.mutate(data));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Razón social *</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="cuit">CUIT *</Label>
            <Input id="cuit" {...register('cuit')} placeholder="20-12345678-9" />
            {errors.cuit && <p className="text-xs text-destructive">{errors.cuit.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" {...register('phone')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="address">Dirección</Label>
              <Input id="address" {...register('address')} />
            </div>
          </div>
          {mutation.error && (
            <p className="text-sm text-destructive">
              {mutation.error instanceof Error ? mutation.error.message : 'Error inesperado'}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
