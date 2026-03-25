export type MetricValue = number | null;

export type GpuFan = {
  value: MetricValue;
  unit: string;
};

export type GpuCard = {
  index: number;
  name: string | null;
  utilizationPercent: MetricValue;
  temperatureC: MetricValue;
  fan: GpuFan | null;
  voltageMv: MetricValue;
};

export type HardwareMetrics = {
  timestamp: number;
  cpu: {
    loadPercent: MetricValue;
    tempC: MetricValue;
  };
  ram: {
    usedGb: MetricValue;
    totalGb: MetricValue;
    usagePercent: MetricValue;
  };
  gpu: {
    cards: GpuCard[];
  };
};

