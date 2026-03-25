const childProcess = require("child_process");
const si = require("systeminformation");

function parseNumberMaybe(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const match = s.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function coalesceNumber(...values) {
  for (const v of values) {
    const n = parseNumberMaybe(v);
    if (n !== null) return n;
  }
  return null;
}

function pickCpuLoadPercent(loadResult) {
  if (!loadResult) return null;
  // systeminformation changed field names across major versions; support both.
  return (
    coalesceNumber(loadResult.currentLoad, loadResult.currentload) ??
    coalesceNumber(loadResult.currentLoadPercent, loadResult.currentload_percent)
  );
}

function formatGb(bytes) {
  if (bytes === null || bytes === undefined) return null;
  const n = Number(bytes);
  if (!Number.isFinite(n)) return null;
  return n / (1024 * 1024 * 1024);
}

function toCelsiusFromMaybeTemp(temp) {
  const n = parseNumberMaybe(temp);
  if (n === null) return null;
  return n;
}

function execFileAsync(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    childProcess.execFile(cmd, args, { timeout: timeoutMs || 2000 }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(stdout);
    });
  });
}

function tryJsonParse(maybeJson) {
  try {
    return JSON.parse(maybeJson);
  } catch (_e) {
    return null;
  }
}

function findFirstNumberByKeyName(obj, keyRegex, range) {
  const visited = new Set();

  function walk(node) {
    if (node === null || node === undefined) return null;
    if (typeof node !== "object") return null;

    if (visited.has(node)) return null;
    visited.add(node);

    for (const [k, v] of Object.entries(node)) {
      const keyMatch = keyRegex.test(k);
      if (keyMatch) {
        const n = parseNumberMaybe(v);
        if (n !== null) {
          if (!range || (n >= range.min && n <= range.max)) return n;
        }
      }
    }

    for (const v of Object.values(node)) {
      const res = walk(v);
      if (res !== null) return res;
    }

    return null;
  }

  return walk(obj);
}

async function gatherGpuByNvidia() {
  // Core metrics (widely supported). `voltage.gpu` is optional: some drivers/GPUs reject it and
  // would make the whole nvidia-smi call fail if combined in one query.
  const stdout = await execFileAsync(
    "nvidia-smi",
    [
      "--query-gpu=index,temperature.gpu,fan.speed,utilization.gpu",
      "--format=csv,noheader,nounits",
    ],
    2000
  );
  if (!stdout) return null;

  const voltStdout = await execFileAsync(
    "nvidia-smi",
    ["--query-gpu=index,voltage.gpu", "--format=csv,noheader,nounits"],
    2000
  );

  const voltageByIndex = new Map();
  if (voltStdout) {
    for (const line of voltStdout
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)) {
      const parts = line.split(",").map((p) => p.trim());
      const idx = parseNumberMaybe(parts[0]);
      const v = parseNumberMaybe(parts[1]);
      if (idx !== null) voltageByIndex.set(idx, v);
    }
  }

  const lines = stdout
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const gpus = [];
  for (const line of lines) {
    // Example: "0, 55, 30, 12"
    const parts = line.split(",").map((p) => p.trim());
    const [indexRaw, tempRaw, fanRaw, utilRaw] = parts;
    const index = parseNumberMaybe(indexRaw);
    const idx = index ?? 0;
    gpus.push({
      index: idx,
      temperatureC: toCelsiusFromMaybeTemp(tempRaw),
      utilizationPercent: parseNumberMaybe(utilRaw),
      // nvidia-smi's `fan.speed` is typically a percentage (units removed via `nounits`).
      fan: { value: parseNumberMaybe(fanRaw), unit: "%" },
      voltageMv: voltageByIndex.has(idx) ? voltageByIndex.get(idx) : null,
    });
  }
  return gpus;
}

async function gatherGpuByAmd() {
  const stdout = await execFileAsync(
    "rocm-smi",
    ["--showid", "--showtemp", "--showfan", "--showuse", "--showvoltage", "--json"],
    3000
  );
  if (!stdout) return null;

  const json = tryJsonParse(stdout);
  if (!json) return null;

  // Heuristic parsing: return a single “best available” GPU metrics entry for MVP.
  const temperatureC = findFirstNumberByKeyName(json, /temp/i, { min: -50, max: 250 });
  const utilizationPercent = findFirstNumberByKeyName(json, /(use|util)/i, { min: 0, max: 100 });
  const fanValue = findFirstNumberByKeyName(json, /fan/i, { min: 0, max: 100000 });
  const voltageMaybe = findFirstNumberByKeyName(json, /volt/i, { min: 0, max: 1000000 });

  let voltageMv = null;
  if (voltageMaybe !== null) {
    // If voltage looks like volts rather than mV, convert.
    voltageMv = voltageMaybe < 50 ? voltageMaybe * 1000 : voltageMaybe;
  }

  const fanUnit = fanValue === null ? null : fanValue <= 100 ? "%" : "RPM";

  return [
    {
      index: 0,
      temperatureC: temperatureC ?? null,
      utilizationPercent: utilizationPercent ?? null,
      fan: fanValue === null ? null : { value: fanValue, unit: fanUnit },
      voltageMv: voltageMv ?? null,
    },
  ];
}

async function gatherCpuRamAndTemps() {
  const [load, mem, cpuTemp] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.cpuTemperature().catch(() => null),
  ]);

  const loadPercent = pickCpuLoadPercent(load);
  const totalBytes = mem?.total ?? null;
  const availableBytes = mem?.available ?? mem?.free ?? null;
  const usedBytes = totalBytes !== null && availableBytes !== null ? totalBytes - availableBytes : mem?.used ?? null;

  const totalGb = formatGb(totalBytes);
  const usedGb = formatGb(usedBytes);
  const ramUsagePercent =
    totalBytes !== null && usedBytes !== null && totalBytes > 0 ? (usedBytes / totalBytes) * 100 : null;

  // systeminformation cpuTemperature() typically returns { main, cores, max }
  const cpuTempC = cpuTemp?.main ?? cpuTemp?.max ?? null;

  return {
    cpu: {
      loadPercent: loadPercent ?? null,
      tempC: toCelsiusFromMaybeTemp(cpuTempC),
    },
    ram: {
      usedGb: usedGb ?? null,
      totalGb: totalGb ?? null,
      usagePercent: ramUsagePercent ?? null,
    },
  };
}

async function gatherGpuGeneralFallback() {
  const graphics = await si.graphics().catch(() => null);
  if (!graphics || !Array.isArray(graphics.controllers)) return null;

  // systeminformation graphics() returns controllers array; each entry has model/vendor and potentially
  // temperatureGpu/utilizationGpu/fanSpeed if nvidia-smi is present.
  return graphics.controllers.map((c, idx) => ({
    index: idx,
    name: c?.model ?? c?.name ?? null,
    utilizationPercent: parseNumberMaybe(c?.utilizationGpu ?? c?.utilization?.[0]),
    temperatureC: parseNumberMaybe(c?.temperatureGpu),
    fan: c?.fanSpeed !== undefined ? { value: parseNumberMaybe(c?.fanSpeed), unit: "%" } : null,
    voltageMv: null,
  }));
}

async function gatherGpuAndMerge() {
  const [general, nvidia, amd] = await Promise.all([
    gatherGpuGeneralFallback(),
    // These calls are fast when tool is missing; we handle null.
    gatherGpuByNvidia().catch(() => null),
    gatherGpuByAmd().catch(() => null),
  ]);

  const merged = [];
  if (nvidia && nvidia.length) {
    for (const nv of nvidia) {
      const base = general?.find((g) => g.index === nv.index) ?? null;
      merged.push({
        index: nv.index,
        name: base?.name ?? null,
        utilizationPercent: nv.utilizationPercent ?? base?.utilizationPercent ?? null,
        temperatureC: nv.temperatureC ?? base?.temperatureC ?? null,
        fan: nv.fan ?? base?.fan ?? null,
        voltageMv: nv.voltageMv ?? null,
      });
    }
  } else if (amd && amd.length) {
    for (const av of amd) {
      const base = general?.[0] ?? null;
      merged.push({
        index: av.index ?? 0,
        name: base?.name ?? "AMD GPU",
        utilizationPercent: av.utilizationPercent ?? base?.utilizationPercent ?? null,
        temperatureC: av.temperatureC ?? base?.temperatureC ?? null,
        fan: av.fan ?? null,
        voltageMv: av.voltageMv ?? null,
      });
    }
  } else if (general && general.length) {
    for (const g of general) merged.push(g);
  }

  return merged;
}

function normalizeMetrics(metrics) {
  return {
    timestamp: metrics.timestamp,
    cpu: {
      loadPercent: metrics.cpu.loadPercent,
      tempC: metrics.cpu.tempC,
    },
    ram: {
      usedGb: metrics.ram.usedGb,
      totalGb: metrics.ram.totalGb,
      usagePercent: metrics.ram.usagePercent,
    },
    gpu: {
      cards: metrics.gpu.cards,
    },
  };
}

function startMetricsLoop(onUpdate) {
  let stopped = false;
  let running = false;

  const cpuIntervalMs = 1000;
  const gpuIntervalMs = 2000;

  let lastCpuAt = 0;
  let lastGpuAt = 0;

  let latestCpuRam = null;
  let latestGpu = null;

  const stop = () => {
    stopped = true;
  };

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const now = Date.now();

      const gatherTasks = [];
      if (!latestCpuRam || now - lastCpuAt >= cpuIntervalMs) {
        lastCpuAt = now;
        gatherTasks.push(
          gatherCpuRamAndTemps().then((res) => {
            latestCpuRam = res;
          })
        );
      }

      if (!latestGpu || now - lastGpuAt >= gpuIntervalMs) {
        lastGpuAt = now;
        gatherTasks.push(
          gatherGpuAndMerge().then((res) => {
            latestGpu = res;
          })
        );
      }

      await Promise.all(gatherTasks);

      if (latestCpuRam && latestGpu) {
        onUpdate(
          normalizeMetrics({
            timestamp: now,
            cpu: latestCpuRam.cpu,
            ram: latestCpuRam.ram,
            gpu: { cards: latestGpu },
          })
        );
      } else if (latestCpuRam) {
        onUpdate(
          normalizeMetrics({
            timestamp: now,
            cpu: latestCpuRam.cpu,
            ram: latestCpuRam.ram,
            gpu: { cards: latestGpu || [] },
          })
        );
      }
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, 250);

  // First tick quickly so UI populates.
  tick();

  return () => {
    clearInterval(timer);
    stop();
  };
}

module.exports = { startMetricsLoop };

