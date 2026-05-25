"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";

const schema = z.object({
  tenantName: z.string().min(2, "Mínimo 2 caracteres").max(100),
  tenantSlug: z
    .string()
    .min(2, "Mínimo 2 caracteres")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Solo letras minúsculas, números y guiones"),
  ownerName: z.string().min(2, "Mínimo 2 caracteres").max(100),
  ownerEmail: z.string().email("Email inválido"),
  ownerPassword: z.string().min(8, "Mínimo 8 caracteres"),
  ownerPhone: z.string().max(20).optional(),
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: registerAuth } = useAuth();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function handleTenantNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value;
    register("tenantName").onChange(e);
    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setValue("tenantSlug", slug, { shouldValidate: true });
  }

  async function onSubmit(data: FormValues) {
    try {
      await registerAuth({
        tenantName: data.tenantName,
        tenantSlug: data.tenantSlug,
        ownerName: data.ownerName,
        ownerEmail: data.ownerEmail,
        ownerPassword: data.ownerPassword,
        ...(data.ownerPhone ? { ownerPhone: data.ownerPhone } : {}),
      });
      router.push("/dashboard");
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 409
          ? "Ya existe una empresa con ese slug. Elegí otro."
          : "Error al registrarse. Intentá de nuevo.";
      setError("root", { message });
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Mata Remitos</CardTitle>
        <CardDescription>Creá tu cuenta empresarial</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenantName">Nombre de la empresa</Label>
            <Input
              id="tenantName"
              placeholder="Mi Empresa S.A."
              {...register("tenantName")}
              onChange={handleTenantNameChange}
            />
            {errors.tenantName && (
              <p className="text-sm text-destructive">{errors.tenantName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenantSlug">
              Identificador único{" "}
              <span className="text-muted-foreground font-normal">(URL de tu empresa)</span>
            </Label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground shrink-0">remitos.app/</span>
              <Input
                id="tenantSlug"
                placeholder="mi-empresa"
                {...register("tenantSlug")}
              />
            </div>
            {errors.tenantSlug && (
              <p className="text-sm text-destructive">{errors.tenantSlug.message}</p>
            )}
          </div>

          <div className="border-t pt-4 space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Tu cuenta de acceso</p>

            <div className="space-y-2">
              <Label htmlFor="ownerName">Tu nombre</Label>
              <Input id="ownerName" placeholder="Juan Pérez" {...register("ownerName")} />
              {errors.ownerName && (
                <p className="text-sm text-destructive">{errors.ownerName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ownerEmail">Email</Label>
              <Input
                id="ownerEmail"
                type="email"
                placeholder="juan@miempresa.com"
                autoComplete="email"
                {...register("ownerEmail")}
              />
              {errors.ownerEmail && (
                <p className="text-sm text-destructive">{errors.ownerEmail.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ownerPassword">Contraseña</Label>
              <Input
                id="ownerPassword"
                type="password"
                autoComplete="new-password"
                {...register("ownerPassword")}
              />
              {errors.ownerPassword && (
                <p className="text-sm text-destructive">{errors.ownerPassword.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ownerPhone">
                Teléfono{" "}
                <span className="text-muted-foreground font-normal">(opcional, para alertas WhatsApp)</span>
              </Label>
              <Input
                id="ownerPhone"
                type="tel"
                placeholder="+54 11 1234-5678"
                {...register("ownerPhone")}
              />
            </div>
          </div>

          {errors.root && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
              {errors.root.message}
            </p>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creando cuenta..." : "Crear cuenta"}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline">
              Ingresá
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
