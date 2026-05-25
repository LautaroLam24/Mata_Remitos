"use client";

import { useRef, useState } from "react";
import { Camera, Upload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DocumentCaptureProps {
  onFileSelected: (file: File) => void;
  isUploading?: boolean;
  uploadProgress?: number;
}

export function DocumentCapture({
  onFileSelected,
  isUploading = false,
  uploadProgress = 0,
}: DocumentCaptureProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  }

  function handleRetake() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setSelectedFile(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  function handleConfirm() {
    if (selectedFile) onFileSelected(selectedFile);
  }

  if (preview) {
    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border bg-black">
          <img
            src={preview}
            alt="Preview del remito"
            className="max-h-[60vh] w-full object-contain"
          />
        </div>

        {isUploading ? (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subiendo imagen...</span>
              <span className="font-medium">{uploadProgress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleRetake}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Otra foto
            </Button>
            <Button className="flex-1" onClick={handleConfirm}>
              Procesar remito
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Camera capture — opens rear camera on mobile */}
      <label htmlFor="remito-capture" className="block cursor-pointer">
        <input
          ref={cameraInputRef}
          id="remito-capture"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="sr-only"
        />
        <div
          className={cn(
            "flex min-h-[280px] flex-col items-center justify-center rounded-xl",
            "border-2 border-dashed border-primary/40 bg-primary/5 p-8 text-center",
            "transition-colors hover:bg-primary/10 active:bg-primary/15"
          )}
        >
          <div className="mb-4 rounded-full bg-primary/10 p-5">
            <Camera className="h-10 w-10 text-primary" />
          </div>
          <p className="text-lg font-semibold leading-tight">
            Sacar foto al remito
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Tocá para abrir la cámara
          </p>
        </div>
      </label>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            o subir desde galería
          </span>
        </div>
      </div>

      {/* Gallery / file picker */}
      <label htmlFor="remito-gallery" className="block cursor-pointer">
        <input
          ref={galleryInputRef}
          id="remito-gallery"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="sr-only"
        />
        <div
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border px-4 py-3",
            "text-sm text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <Upload className="h-4 w-4" />
          Seleccionar imagen del dispositivo
        </div>
      </label>
    </div>
  );
}
