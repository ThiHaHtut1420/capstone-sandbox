import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const params = new URLSearchParams(window.location.search);
const mode = params.get("window") === "overlay" ? "overlay" : "dashboard";

createRoot(document.getElementById("root")!).render(<App mode={mode} />);

