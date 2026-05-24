import asyncio
import os
import logging
from typing import Set, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from simulator import TrafficSimulator
from analytics import SREAnalyticsEngine

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("debugpilot-backend")

app = FastAPI(title="DebugPilot AI SRE Server")

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instantiate core engines
simulator = TrafficSimulator()
analytics = SREAnalyticsEngine()

# Active connections
active_connections: Set[WebSocket] = set()

# Rolling buffer
rolling_log_history = []
MAX_HISTORY = 150

class IncidentInjection(BaseModel):
    incident_type: str

class ChatMessage(BaseModel):
    message: str

class CodeDeployment(BaseModel):
    message: str
    author: str
    files_changed: List[str]

@app.on_event("startup")
def startup_event():
    asyncio.create_task(run_log_simulation_loop())

async def run_log_simulation_loop():
    logger.info("Starting real-time log ingestion and anomaly detection thread...")
    while True:
        try:
            count = 10
            if simulator.current_incident == "spike_traffic":
                count = 25
            elif simulator.current_incident != "healthy":
                count = 15
                
            new_logs = simulator.generate_logs(count)
            
            global rolling_log_history
            rolling_log_history.extend(new_logs)
            if len(rolling_log_history) > MAX_HISTORY:
                rolling_log_history = rolling_log_history[-MAX_HISTORY:]
                
            # Perform Anomaly Detection
            anomalies = analytics.analyze_logs(new_logs)
            
            # Cluster anomalies into Incidents (Phase 2: Pass deployments)
            active_incident = analytics.cluster_anomalies_to_incidents(anomalies, simulator.current_incident, simulator.deployments)
            
            # Collect current system health metrics
            metrics = simulator.get_metrics()
            
            payload = {
                "type": "telemetry",
                "logs": new_logs,
                "anomalies": anomalies,
                "metrics": metrics,
                "active_incident": active_incident,
                "deployments": simulator.deployments
            }
            
            # Broadcast to WebSockets
            if active_connections:
                await asyncio.gather(
                    *[send_safe(ws, payload) for ws in active_connections],
                    return_exceptions=True
                )
                
        except Exception as e:
            logger.error(f"Error in simulation loop: {e}", exc_info=True)
            
        await asyncio.sleep(1.0)

async def send_safe(ws: WebSocket, data: dict):
    try:
        await ws.send_json(data)
    except Exception:
        pass

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)
    logger.info(f"Frontend connection accepted. Active subscribers: {len(active_connections)}")
    
    try:
        metrics = simulator.get_metrics()
        active_inc = list(analytics.active_incidents.values())[0] if analytics.active_incidents else None
        
        bootstrap_payload = {
            "type": "bootstrap",
            "history": rolling_log_history,
            "metrics": metrics,
            "active_incident": active_inc,
            "deployments": simulator.deployments
        }
        await websocket.send_json(bootstrap_payload)
        
        while True:
            await websocket.receive_text()
            
    except WebSocketDisconnect:
        logger.info("Frontend subscriber disconnected.")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        active_connections.discard(websocket)

@app.post("/api/inject-anomaly")
def inject_anomaly(data: IncidentInjection):
    success = simulator.inject_incident(data.incident_type)
    if not success:
        raise HTTPException(status_code=400, detail="Invalid anomaly type specified")
        
    logger.info(f"Manually injected incident: {data.incident_type}")
    return trigger_immediate_broadcast()

# Phase 2: Add REST endpoint for One-Click Mitigation
@app.post("/api/mitigate")
def execute_mitigation():
    logger.info("⚡ Remediation action triggered: flushing active faults and restoring telemetry...")
    simulator.mitigate_active_incident()
    analytics.active_incidents.clear()
    return trigger_immediate_broadcast()

# Phase 2: Add REST endpoint for mock deployments
@app.post("/api/deploy")
def trigger_deployment(data: CodeDeployment):
    logger.info(f"📦 Deploying code: '{data.message}' by {data.author}")
    new_dep = simulator.create_deployment(data.message, data.author, data.files_changed)
    trigger_immediate_broadcast()
    return {"status": "success", "deployment": new_dep}

def trigger_immediate_broadcast():
    new_logs = simulator.generate_logs(5)
    anomalies = analytics.analyze_logs(new_logs)
    active_incident = analytics.cluster_anomalies_to_incidents(anomalies, simulator.current_incident, simulator.deployments)
    metrics = simulator.get_metrics()
    
    payload = {
        "type": "telemetry",
        "logs": new_logs,
        "anomalies": anomalies,
        "metrics": metrics,
        "active_incident": active_incident,
        "deployments": simulator.deployments
    }
    
    for ws in list(active_connections):
        asyncio.create_task(send_safe(ws, payload))
        
    return {"status": "success", "current_incident": simulator.current_incident}

@app.post("/api/copilot/chat")
def copilot_chat(data: ChatMessage):
    response = analytics.get_copilot_response(data.message, simulator.current_incident)
    return {"reply": response}

@app.get("/api/incidents")
def get_incidents():
    all_incidents = list(analytics.active_incidents.values()) + analytics.incident_history
    return sorted(all_incidents, key=lambda x: x["triggered_at"], reverse=True)

# Phase 2: Add REST fallback telemetry endpoint for environments blocking WebSockets
@app.get("/api/telemetry")
def get_telemetry_fallback():
    metrics = simulator.get_metrics()
    active_inc = list(analytics.active_incidents.values())[0] if analytics.active_incidents else None
    
    # Return last 20 logs for visual continuity in HTTP polling
    fallback_logs = rolling_log_history[-20:] if rolling_log_history else []
    
    return {
        "metrics": metrics,
        "active_incident": active_inc,
        "logs": fallback_logs,
        "deployments": simulator.deployments
    }


# Mount the static frontend assets
frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

@app.get("/styles.css")
def get_css():
    styles_file = os.path.join(frontend_path, "styles.css")
    if os.path.exists(styles_file):
        return FileResponse(styles_file)
    raise HTTPException(status_code=404, detail="styles.css not found")

@app.get("/app.js")
def get_js():
    app_js_file = os.path.join(frontend_path, "app.js")
    if os.path.exists(app_js_file):
        return FileResponse(app_js_file)
    raise HTTPException(status_code=404, detail="app.js not found")

@app.get("/")
def read_root():
    index_file = os.path.join(frontend_path, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "DebugPilot API running. Frontend folder is missing or empty."}
