import React from "react";
import Dashboard from "./Dashboard";
import Overlay from "./Overlay";

export default function App({ mode }: { mode: "dashboard" | "overlay" }) {
  return mode === "overlay" ? <Overlay /> : <Dashboard />;
}

