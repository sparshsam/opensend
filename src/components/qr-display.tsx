"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface QRDisplayProps {
  /** Data to encode in the QR code */
  data: string;
  /** Size in pixels (default: 256) */
  size?: number;
  /** Optional CSS class override */
  className?: string;
}

/**
 * Server-rendered QR code using canvas-to-data-URL.
 * Generates the QR synchronously on the server so we don't flash a blank.
 */
export function QRDisplay({ data, size = 256, className = "" }: QRDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, data, {
      width: size,
      margin: 2,
      color: {
        dark: "#1a1a2e",
        light: "#ffffff",
      },
    });
  }, [data, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`rounded-2xl shadow-lg ${className}`}
      style={{ maxWidth: "100%", height: "auto" }}
    />
  );
}
