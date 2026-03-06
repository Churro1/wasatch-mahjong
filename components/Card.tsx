import React from "react";

export type CardProps = {
  children: React.ReactNode;
  className?: string;
};

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-2xl shadow-md p-6 ${className}`}
      style={{ background: "#f5f5f5" }}
    >
      {children}
    </div>
  );
}
