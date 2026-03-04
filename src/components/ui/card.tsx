import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-white/70 bg-card/85 text-card-foreground shadow-[0_30px_80px_-45px_rgba(25,28,35,0.45)] backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
}
