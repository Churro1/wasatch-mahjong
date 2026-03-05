import React from "react";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline";
  children: React.ReactNode;
};

const base =
  "rounded-full px-6 py-2 font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed";

const variants = {
  primary:
    "bg-[color:var(--wasatch-red)] text-white hover:bg-[#7a0000] focus:ring-[color:var(--wasatch-red)]",
  secondary:
    "bg-[color:var(--wasatch-blue)] text-white hover:bg-[#2a3573] focus:ring-[color:var(--wasatch-blue)]",
  outline:
    "border-2 border-[color:var(--wasatch-red)] text-[color:var(--wasatch-red)] bg-transparent hover:bg-[color:var(--wasatch-bg2)] focus:ring-[color:var(--wasatch-red)]",
};

export function Button({ variant = "primary", children, className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
