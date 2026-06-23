import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "default" | "sm" | "lg";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "default", disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "rounded-full font-semibold transition cursor-pointer inline-flex items-center justify-center gap-2",
          size === "sm" && "px-5 py-2.5 text-xs",
          size === "default" && "px-7 py-3.5 text-sm",
          size === "lg" && "px-10 py-4 text-base",
          variant === "primary" && "bg-accent text-white hover:brightness-110",
          variant === "secondary" && "bg-bg-surface-muted text-text-primary hover:bg-[#252525]",
          variant === "danger" && "bg-error/10 text-error border border-error/20 hover:bg-error/20",
          variant === "ghost" && "text-text-secondary hover:text-text-primary",
          disabled && "opacity-40 cursor-not-allowed",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, type ButtonProps };
