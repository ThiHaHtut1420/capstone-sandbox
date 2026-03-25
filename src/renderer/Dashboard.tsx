import React, { useEffect, useMemo, useState } from "react";
import type { HardwareMetrics, GpuCard } from "./lib/metricsTypes";
import MetricCard from "./components/MetricCard";

function formatPercent(v: number | null) {
  return v === null ? "N/A" : `${v.toFixed(0)}%`;
}

function formatTemp(v: number | null) {
  return v === null ? "N/A" : `${v.toFixed(0)}°C`;
}

function formatGb(v: number | null) {
  return v === null ? "N/A" : `${v.toFixed(1)} GB`;
}

function formatVoltageMv(mv: number | null) {
  if (mv === null) return "N/A";
  // Heuristic: most reports are in mV.
  if (mv >= 100) return `${(mv / 1000).toFixed(3)} V`;
  return `${mv.toFixed(0)} mV`;
}

function formatFan(fan: GpuCard["fan"]) {
  if (!fan || fan.value === null) return "N/A";
  return `${fan.value.toFixed(0)} ${fan.unit}`;
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<HardwareMetrics | null>(null);
  const [overlayEnabled, setOverlayEnabled] = useState(false);

  useEffect(() => {
    const unsub = window.api?.onMetrics((m) => setMetrics(m));
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  useEffect(() => {
    if (!window.api?.getOverlayEnabled) return;
    window.api
      .getOverlayEnabled()
      .then((v) => setOverlayEnabled(!!v))
      .catch(() => setOverlayEnabled(false));
  }, []);

  const gpuCards = useMemo(() => metrics?.gpu.cards ?? [], [metrics]);

  async function toggleOverlay(next: boolean) {
    if (!window.api?.setOverlayEnabled) return;
    setOverlayEnabled(next);
    try {
      await window.api.setOverlayEnabled(next);
    } catch (_e) {
      // revert on failure
      setOverlayEnabled((prev) => !prev);
    }
  }

  return (
    <div className="appRoot">
      <header className="header">
        <div className="title">Hardware Dashboard</div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={overlayEnabled}
            onChange={(e) => toggleOverlay(e.target.checked)}
          />
          <span className="toggleTrack" />
          <span className="toggleLabel">Overlay</span>
        </label>
      </header>

      <main className="grid">
        <MetricCard title="CPU">
          <div className="metricRow">
            <div className="metricValue">{metrics ? formatPercent(metrics.cpu.loadPercent) : "..."}</div>
            <div className="metricSub">Load</div>
          </div>
          <div className="metricRow">
            <div className="metricValue">{metrics ? formatTemp(metrics.cpu.tempC) : "..."}</div>
            <div className="metricSub">Temp</div>
          </div>
        </MetricCard>

        <MetricCard title="RAM">
          <div className="metricRow">
            <div className="metricValue">{metrics ? formatGb(metrics.ram.usedGb) : "..."}</div>
            <div className="metricSub">
              Used / {metrics ? formatGb(metrics.ram.totalGb) : "Total"}
            </div>
          </div>
          <div className="metricRow">
            <div className="metricValue">{metrics ? formatPercent(metrics.ram.usagePercent) : "..."}</div>
            <div className="metricSub">Usage</div>
          </div>
        </MetricCard>

        <section className="card">
          <div className="cardTitle">GPU</div>
          <div className="cardBody">
            {gpuCards.length === 0 ? (
              <div className="emptyState">{metrics ? "No GPU info yet (tools not available?)" : "..."}</div>
            ) : (
              <div className="gpuList">
                {gpuCards.slice(0, 3).map((g: GpuCard) => (
                  <div key={g.index} className="gpuCard">
                    <div className="gpuName">{g.name ?? `GPU #${g.index}`}</div>
                    <div className="gpuMetrics">
                      <div className="gpuMetric">
                        <div className="gpuMetricKey">Load</div>
                        <div className="gpuMetricVal">{formatPercent(g.utilizationPercent)}</div>
                      </div>
                      <div className="gpuMetric">
                        <div className="gpuMetricKey">Temp</div>
                        <div className="gpuMetricVal">{formatTemp(g.temperatureC)}</div>
                      </div>
                      <div className="gpuMetric">
                        <div className="gpuMetricKey">Fan</div>
                        <div className="gpuMetricVal">{formatFan(g.fan)}</div>
                      </div>
                      <div className="gpuMetric">
                        <div className="gpuMetricKey">Voltage</div>
                        <div className="gpuMetricVal">{formatVoltageMv(g.voltageMv)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

