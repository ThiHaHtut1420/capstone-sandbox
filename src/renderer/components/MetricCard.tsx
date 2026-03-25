import React from "react";

export default function MetricCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="cardTitle">{title}</div>
      <div className="cardBody">{children}</div>
    </section>
  );
}

