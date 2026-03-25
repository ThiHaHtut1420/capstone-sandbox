import React, { useEffect, useMemo, useState } from "react";
import type { HardwareMetrics } from "./lib/metricsTypes";

function formatPercent(v: number | null) {
  return v === null ? "N/A" : `${v.toFixed(0)}%`;
}

function formatTemp(v: number | null) {
  return v === null ? "N/A" : `${v.toFixed(0)}°C`;
}

function formatVoltage(v: number | null) {
  if (v === null) return "N/A";
  if (v >= 100) return `${(v / 1000).toFixed(3)} V`;
  return `${v.toFixed(0)} mV`;
}

export default function Overlay() {
  const [metrics, setMetrics] = useState<HardwareMetrics | null>(null);

  useEffect(() => {
    const unsub = window.api?.onMetrics((m) => setMetrics(m));
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const gpu0 = useMemo(() => metrics?.gpu.cards?.[0] ?? null, [metrics]);

  return (
    <div className="overlayRoot" aria-hidden="true">
      <div className="overlayBlock">
        <div className="overlayLine">
          <span className="overlayLabel">CPU</span>
          <span className="overlayValue">{metrics ? formatPercent(metrics.cpu.loadPercent) : "..."}</span>
          <span className="overlaySub">{metrics ? formatTemp(metrics.cpu.tempC) : "..."}</span>
        </div>
        <div className="overlayLine">
          <span className="overlayLabel">RAM</span>
          <span className="overlayValue">
            {metrics ? formatPercent(metrics.ram.usagePercent) : "..."}
          </span>
          <span className="overlaySub">
            {metrics && metrics.ram.totalGb !== null && metrics.ram.usedGb !== null
              ? `${metrics.ram.usedGb.toFixed(1)} / ${metrics.ram.totalGb.toFixed(1)} GB`
              : ""}
          </span>
        </div>
      </div>

      <div className="overlayBlock">
        <div className="overlayLine">
          <span className="overlayLabel">GPU</span>
          <span className="overlayValue">{gpu0?.name ?? ""}</span>
        </div>
        <div className="overlayLine">
          <span className="overlayLabel">Load</span>
          <span className="overlayValue">{gpu0 ? formatPercent(gpu0.utilizationPercent) : "N/A"}</span>
          <span className="overlaySub">{gpu0 ? formatTemp(gpu0.temperatureC) : ""}</span>
        </div>
        <div className="overlayLine">
          <span className="overlayLabel">Fan</span>
          <span className="overlayValue">
            {gpu0?.fan?.value === null || gpu0?.fan?.value === undefined
              ? "N/A"
              : `${gpu0.fan?.value.toFixed(0)} ${gpu0.fan?.unit}`}
          </span>
          <span className="overlaySub">{gpu0 ? formatVoltage(gpu0.voltageMv) : ""}</span>
        </div>
      </div>
    </div>
  );
}

