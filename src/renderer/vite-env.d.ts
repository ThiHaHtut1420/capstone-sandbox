/// <reference types="vite/client" />

import type { HardwareMetrics } from "./lib/metricsTypes";

declare global {
  interface Window {
    api: {
      onMetrics: (callback: (metrics: HardwareMetrics) => void) => () => void;
      setOverlayEnabled: (enabled: boolean) => Promise<boolean>;
      getOverlayEnabled: () => Promise<boolean>;
    };
  }
}

export {};

