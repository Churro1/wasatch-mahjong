import React from "react";

export type CardProps = {
  children: React.ReactNode;
  className?: string;
};

export function Card({ children, className = "" }: CardProps) {
  return (
    <div className={`bg-[color:var(--wasatch-card)] rounded-2xl shadow-md p-6 ${className}`}>
      {children}
    </div>
  );
}
