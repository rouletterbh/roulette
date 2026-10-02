"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes, type AnchorHTMLAttributes } from "react";

type Variant = "primary" | "accent" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "xl";

const base =
  "group/btn relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-[0.01em] transition-[transform,background-color,color,border-color,box-shadow] duration-200 ease-[var(--ease-out-expo)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 select-none";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-canvas hover:bg-ink-2 dark:bg-ink dark:text-canvas dark:hover:bg-[#ffffff]",
  accent: "bg-accent text-accent-ink hover:bg-accent-2 shadow-[0_0_0_1px_rgba(8,10,8,0.08)_inset]",
  outline: "border border-border-strong text-ink hover:border-ink hover:bg-surface/60 dark:hover:bg-elevated",
  ghost: "text-ink hover:bg-sunken dark:hover:bg-elevated",
  danger: "bg-casino-red text-white hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[13px]",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-6 text-[15px]",
  xl: "h-14 px-8 text-base",
};

type CommonProps = { variant?: Variant; size?: Size; className?: string; children: React.ReactNode };
type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type LinkProps = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps | LinkProps>(
  function Button({ variant = "primary", size = "md", className, children, ...rest }, ref) {
    const cls = cn(base, variants[variant], sizes[size], className);
    if ("href" in rest && typeof rest.href === "string") {
      const { href, ...a } = rest as LinkProps;
      return (
        <Link href={href} className={cls} ref={ref as React.Ref<HTMLAnchorElement>} {...a}>
          {children}
        </Link>
      );
    }
    return (
      <button className={cls} ref={ref as React.Ref<HTMLButtonElement>} {...(rest as ButtonProps)}>
        {children}
      </button>
    );
  },
);
