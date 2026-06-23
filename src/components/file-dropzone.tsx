"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";

interface FileDropzoneProps {
  onFileSelected: (file: File) => void;
  maxSize?: number; // bytes
  disabled?: boolean;
}

export function FileDropzone({ onFileSelected, maxSize = 50 * 1024 * 1024, disabled }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback(
    (file: File) => {
      setError(null);
      if (file.size > maxSize) {
        setError(`File too large (${formatBytes(file.size)}). Max: ${formatBytes(maxSize)}`);
        return false;
      }
      if (file.size === 0) {
        setError("Empty file. Select a file with content.");
        return false;
      }
      return true;
    },
    [maxSize],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file && validateFile(file)) onFileSelected(file);
    },
    [disabled, validateFile, onFileSelected],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && validateFile(file)) onFileSelected(file);
    },
    [validateFile, onFileSelected],
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "rounded-2xl p-10 sm:p-16 bg-bg-surface-muted cursor-pointer transition text-center",
        isDragging && "bg-accent/10 ring-2 ring-accent",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
      <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-accent/10">
        <Upload className="size-6 text-accent" />
      </div>
      <p className="text-xl font-bold text-text-primary">
        {isDragging ? "Drop it here" : "Drop a file to send"}
      </p>
      <p className="mt-2 text-sm text-text-muted">
        or click to browse &mdash; up to {formatBytes(maxSize)}
      </p>
      {error && (
        <p className="mt-4 text-xs font-bold tracking-wider uppercase text-error">
          {error}
        </p>
      )}
    </div>
  );
}
