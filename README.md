# DebugPilot AI - SRE Copilot & Failure Detection Platform

DebugPilot AI is an autonomous, high-fidelity Site Reliability Engineering (SRE) Copilot and real-time failure detection system. The platform ingests real-time API logs, executes Dynamic Seasonality-Aware anomaly detection algorithms, clusters downstream cascading failures, correlates anomalies with Git commit deployments, and provides One-Click Self-Healing runbooks alongside an interactive AI SRE Copilot chat terminal.

Resting over a beautiful, light frosted glassmorphic Obsidian dashboard, the interface gives operators an immediate command center to diagnose, trace, and heal complex microservice deadlocks.

---

## 🚀 Phase 2 Upgraded Features

1. **Dynamic IST Timezone Clock & Glowing Robot Logo**:
   - The dashboard features a premium, bouncing **SRE Robot brand logo** that glows and pulses.
   - The header displays a real-time dynamic clock calibrated to **Indian Standard Time (IST)** (`Asia/Kolkata`) for synchronized operations.
2. **Silent GraphQL 200 OK Failure Detection**:
   - Detects hidden API anomalies that return successful `200 OK` HTTP status codes but carry inner `errors` arrays and heavily contracted payload sizes (e.g. 124 bytes).
3. **Seasonality-Aware EWMA Baselining**:
   - Uses **Exponentially Weighted Moving Average (EWMA)** ($\alpha=0.15$) to dynamically calculate expected transaction latency baselines. It alerts only when response times surge past $3.5\times$ the time-of-day smoothed standard deviations, eliminating static alert fatigue.
4. **Git Deployment Outage Correlation**:
   - Simulated integrations correlate outages with recent code rollouts, isolation-scanning commits, file changes, and author emails, displaying correlation confidence (e.g., 98% DB thread pool correlation with config schema rollouts).
5. **Jaeger-Style Span Trace Trees**:
   - Parses unique trace headers (`span_id` and `parent_span_id`). Clicking **any log line** in the console opens a nested, horizontal span tree showing precise microservice timing breakdowns and origin failure exceptions.
6. **One-Click Playbook Self-Healing**:
   - An active incident exposes a glowing **Execute Remediation Runbook** button. Clicking it triggers backend connections resets, increases thread pools, applies circuit-breaker fallbacks, and restores system health in under ten seconds.
7. **SRE Notification Hub**:
   - Streams alerts to Slack (rendered as dynamic **Slack Block Kit** slide-in toasts) and dispatches PagerDuty alarms.

---

## ⚡ Quick Start & Launch

To install dependencies, construct the virtual environment (`venv`), and launch the SRE Dashboard, execute:

```powershell
# 1. Move into the project directory
cd "C:\Users\lavoi\.gemini\antigravity\scratch\debugpilot-ai"

# 2. Boot the orchestrator
python run.py
```

* The launcher will configure the Python sandboxed environment, compile required SRE libraries, start the FastAPI webserver on `http://127.0.0.1:8000`, and automatically open your default browser.
* *Note: Perform a hard reload (`Ctrl + F5`) upon first loading to flush browser memory and display the upgraded robot logo and IST clock widget.*

---

## 🔍 Sandbox Compile Verification

To verify that the entire platform builds, installs packages, and compiles local analytics modules cleanly without starting any active web servers, execute:
```powershell
python run.py --test-only
```
**Expected Output**: `[VERIFICATION SUCCESSFUL]: SRE platform is compiled and ready to run.`

---

## 🛠️ Testing Outages (Chaos Injector Deck)

Click any button in the sidebar's **Fault Injector Deck** to verify SRE monitoring latencies:
* **Rollout Buggy Schema**: Triggers a simulated Git checkout deployment that rolls out an un-indexed resolver, triggering a silent GraphQL 200 OK anomaly.
* **DB Pool Exhaustion**: Exhausts Database thread connections, causing downstream inventory exceptions and 504 timeouts.
* **Stripe Timeout**: Hangs connections to external Stripe payment routers.
* **Auth Memory Leak**: Creeps memory allocation in the authentication service, simulating JVM OutOfMemoryErrors.
* **Flush & Recover System**: Manually resets service pools, clears fault states, and self-heals back to green.

---

## 📝 Video Presentation Playbook

A professionally formatted video presentation script is saved in the workspace to help you record a highly impressive 4-minute hackathon demo:
* **Playbook PDF**: [DebugPilot_AI_Presentation_Script.pdf](file:///C:/Users/lavoi/.gemini/antigravity/scratch/debugpilot-ai/DebugPilot_AI_Presentation_Script.pdf)
* Open the PDF using PowerShell: `ii DebugPilot_AI_Presentation_Script.pdf`

---

## 🏗️ Technical Architecture

```
API Ingestion Stream
       │
       ▼
Telemetry Log Ingestion (FastAPI WebSockets / simulator.py)
       │
       ▼
Anomaly Diagnostics (Seasonality-Aware EWMA & Entropy Filters / analytics.py)
       │
       ▼
Incident Clustering (Correlating cascading microservice issues / analytics.py)
       │
       ▼
SRE AI Root Cause Analyzer (Markdown RCAs, Git Commits & Diffs / analytics.py)
       ├───► Notification Hub (Slack Block Kit & PagerDuty Toasts / app.js)
       └───► Obsidian Frosted Glassmorphism Cockpit (index.html, styles.css, app.js)
```
