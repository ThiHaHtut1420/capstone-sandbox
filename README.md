# Mordam-style Real-time Hardware Dashboard

An Electron desktop app that monitors CPU/RAM/GPU usage and temps, with an optional transparent always-on-top overlay (inspired by tools like MSI Afterburner).

## Features (MVP)
- Real-time dashboard window
- Transparent overlay mode (click-through best-effort)
- CPU load + CPU temperature (best-effort)
- RAM usage
- GPU temperature + GPU load
- NVIDIA GPU fan speed + GPU voltage via `nvidia-smi` (if available)
- AMD GPU fan speed + GPU voltage via `rocm-smi` (best-effort; depends on parsing and ROCm tools)

## Setup
1. Install dependencies:
   - `npm install`
2. Start the dev app:
   - `npm run dev`

## Overlay
- Open the dashboard and toggle `Overlay` in the top-right.

## Notes on sensors/tools
- CPU temperature and GPU thermal data depend on OS support in `systeminformation`.
- On macOS, you may need the extra temperature sensor dependency that `systeminformation` uses (ex: `macos-temperature-sensor`).
- NVIDIA metrics require `nvidia-smi` to be available in your PATH.
- AMD metrics require `rocm-smi` (ROCm installed).
