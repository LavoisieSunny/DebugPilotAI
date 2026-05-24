import time
import random
import uuid
from typing import Dict, List, Any

# Define services in our microservice architecture
SERVICES = ["gateway", "auth-service", "payment-service", "inventory-service", "db-cluster"]

class TrafficSimulator:
    def __init__(self):
        # Current system mode: "healthy" or specific incident names
        self.current_incident = "healthy"
        self.incident_start_time = 0
        # Telemetry metrics tracking
        self.request_counts = {s: 0 for s in SERVICES}
        self.error_counts = {s: 0 for s in SERVICES}
        self.latencies = {s: [] for s in SERVICES}
        
        # Phase 2: Deployments tracker (Mock Git History)
        self.deployments = [
            {
                "id": "DEP-081",
                "commit": "a82f3b9",
                "timestamp": time.time() - 3600,
                "author": "sre-lead@company.com",
                "message": "Update database pooling parameters and HikariCP drivers",
                "files_changed": ["db/config.py"]
            },
            {
                "id": "DEP-082",
                "commit": "e93a4b7",
                "timestamp": time.time() - 1200,
                "author": "dev-checkout@company.com",
                "message": "GraphQL schema adjustments for shopping cart resolver queries",
                "files_changed": ["services/inventory/resolver.py"]
            }
        ]
        
    def inject_incident(self, incident_type: str):
        if incident_type in ["db_pool_exhaustion", "payment_gateway_timeout", "auth_memory_leak", "spike_traffic", "silent_graphql_deadlock", "healthy"]:
            self.current_incident = incident_type
            self.incident_start_time = time.time()
            return True
        return False
        
    # Phase 2: Create a mock deployment
    def create_deployment(self, message: str, author: str, files: List[str]) -> Dict[str, Any]:
        dep_id = f"DEP-{random.randint(100, 999)}"
        commit_hash = str(uuid.uuid4())[:7]
        new_dep = {
            "id": dep_id,
            "commit": commit_hash,
            "timestamp": time.time(),
            "author": author,
            "message": message,
            "files_changed": files
        }
        self.deployments.append(new_dep)
        # Force an incident to trigger if user rolls out a buggy schema!
        if "graphql" in message.lower() or "resolver" in message.lower():
            self.inject_incident("silent_graphql_deadlock")
        return new_dep

    # Phase 2: Mitigate current state back to healthy
    def mitigate_active_incident(self):
        self.current_incident = "healthy"
        self.incident_start_time = 0
        # Clear out current metric queues so alerts dissolve instantly
        for s in SERVICES:
            self.latencies[s] = [random.randint(10, 45) for _ in range(20)]
            self.request_counts[s] = 10
            self.error_counts[s] = 0

    def generate_logs(self, count: int = 10) -> List[Dict[str, Any]]:
        logs = []
        for _ in range(count):
            trace_id = str(uuid.uuid4())[:18].replace("-", "")
            client_ip = f"{random.randint(100, 250)}.{random.randint(1, 255)}.{random.randint(1, 255)}.{random.randint(1, 255)}"
            
            # Determine traffic density based on incident type
            if self.current_incident == "spike_traffic":
                requests_to_generate = random.choice([2, 3, 4])
            else:
                requests_to_generate = 1

            for _ in range(requests_to_generate):
                # Generate unique spans for distributed trace visualization
                span_gw = f"sp_{trace_id}_gw"
                span_auth = f"sp_{trace_id}_auth"
                span_db = f"sp_{trace_id}_db"
                span_inv = f"sp_{trace_id}_inv"
                span_pay = f"sp_{trace_id}_pay"

                # 1. Gateway
                gw_log = self._simulate_service_call("gateway", trace_id, span_gw, None, "GET /api/v1/checkout", client_ip)
                logs.append(gw_log)
                
                # 2. Auth Service
                auth_log = self._simulate_service_call("auth-service", trace_id, span_auth, span_gw, "POST /api/v1/auth/validate", client_ip)
                logs.append(auth_log)
                if auth_log["status_code"] >= 500:
                    continue # Halt cascade on critical auth failure
                
                # 3. DB Cluster
                db_log = self._simulate_service_call("db-cluster", trace_id, span_db, span_inv, "SELECT * FROM inventory WHERE id = ?", client_ip)
                logs.append(db_log)
                
                # 4. Inventory Service
                inv_log = self._simulate_service_call("inventory-service", trace_id, span_inv, span_gw, "GET /api/v1/inventory/stock", client_ip)
                logs.append(inv_log)
                
                # 5. Payment Service
                if random.random() < 0.4:
                    pay_log = self._simulate_service_call("payment-service", trace_id, span_pay, span_gw, "POST /api/v1/payments/charge", client_ip)
                    logs.append(pay_log)
                    
        return sorted(logs, key=lambda x: x["timestamp"])

    def _simulate_service_call(self, service: str, trace_id: str, span_id: str, parent_span_id: str, endpoint: str, client_ip: str) -> Dict[str, Any]:
        timestamp = time.time()
        status_code = 200
        latency = random.randint(10, 45) # baseline latency ms
        level = "INFO"
        message = f"Successfully completed request to {endpoint}"
        payload_size = random.randint(100, 2048)

        # Apply behavior overrides based on incident type
        if self.current_incident == "db_pool_exhaustion":
            if service == "db-cluster":
                latency = random.randint(4500, 8500)
                status_code = 500
                level = "ERROR"
                message = "FATAL: Connection pool exhausted. Active connections: 100/100. Timeout waiting for driver connection."
            elif service == "inventory-service":
                latency = random.randint(3000, 5000)
                status_code = 500
                level = "ERROR"
                message = "DBConnectionError: Failed to obtain connection after 3000ms. Cascading request cancellation."
            elif service == "gateway":
                latency = random.randint(3500, 6000)
                status_code = 504
                level = "WARN"
                message = "Gateway timed out waiting for downstream response from inventory-service"

        elif self.current_incident == "payment_gateway_timeout":
            if service == "payment-service":
                latency = random.randint(8000, 12000)
                status_code = 504
                level = "ERROR"
                message = "SocketTimeoutException: Read timed out connecting to external vendor stripe.api.global"
            elif service == "gateway":
                latency = random.randint(8000, 12000)
                status_code = 504
                level = "WARN"
                message = "Gateway timed out waiting for downstream response from payment-service"

        elif self.current_incident == "auth_memory_leak":
            elapsed = time.time() - self.incident_start_time
            if service == "auth-service":
                leak_factor = min(int(elapsed * 15), 5000)
                latency = random.randint(30, 80) + leak_factor
                if leak_factor > 3000:
                    status_code = 503
                    level = "ERROR"
                    message = f"OutOfMemoryError: Java heap space exhausted in Garbage Collection. Process RSS {2048 + int(elapsed * 2)}MB"
                elif leak_factor > 1000:
                    level = "WARN"
                    message = "High heap utilization detected. JVM GC running continuously (>95% CPU time in GC)"
            elif service == "gateway":
                leak_factor = min(int(elapsed * 15), 5000)
                latency = random.randint(40, 100) + leak_factor
                if leak_factor > 3000:
                    status_code = 504
                    level = "WARN"
                    message = "Gateway timeout: downstream auth-service did not respond within timeout window"

        elif self.current_incident == "spike_traffic":
            latency = random.randint(40, 180)
            if random.random() < 0.05:
                status_code = 500
                level = "ERROR"
                message = "ServiceUnavailable: Thread pool rejection limit hit under peak stress loads."

        # Phase 2: Silent GraphQL Failure Injection
        elif self.current_incident == "silent_graphql_deadlock":
            if service == "inventory-service":
                # Return status 200 OK, but payload size is very low and contains error JSON
                status_code = 200
                latency = random.randint(80, 140)
                level = "WARN" # Silent warning
                message = '{"errors": [{"message": "AccessDenied: Field resolver checkout failed due to auth token verification timeout."}], "data": {"checkout": null}}'
                payload_size = 124 # extremely small payload
            elif service == "gateway":
                # Returns 200 OK because the downstream returned 200 OK
                status_code = 200
                latency = random.randint(90, 150)
                level = "INFO"
                message = "GraphQL POST /graphql resolved checkout resolver with active anomalies."

        # Random noise for realistic logs
        if status_code == 200 and random.random() < 0.005:
            level = "WARN"
            message = "Slow database query detected: Query took 420ms (threshold: 300ms)"
            latency = random.randint(350, 500)
        
        # Track statistics
        self.request_counts[service] += 1
        # Silent errors are captured separately in analytics, but standard errors use standard counts
        if status_code >= 400:
            self.error_counts[service] += 1
        self.latencies[service].append(latency)
        
        if len(self.latencies[service]) > 100:
            self.latencies[service].pop(0)

        return {
            "timestamp": timestamp,
            "trace_id": trace_id,
            "span_id": span_id,
            "parent_span_id": parent_span_id,
            "service": service,
            "endpoint": endpoint,
            "status_code": status_code,
            "latency_ms": latency,
            "level": level,
            "message": message,
            "client_ip": client_ip,
            "payload_size": payload_size
        }

    def get_metrics(self) -> Dict[str, Any]:
        health_status = {}
        overall_health = "healthy"
        critical_count = 0
        
        for s in SERVICES:
            lats = self.latencies[s]
            avg_lat = sum(lats) / len(lats) if lats else 20.0
            error_rate = 0.0
            if self.request_counts[s] > 0:
                error_rate = self.error_counts[s] / self.request_counts[s]
            
            # Reset counters occasionally
            if self.request_counts[s] > 1000:
                self.request_counts[s] = int(self.request_counts[s] * 0.1)
                self.error_counts[s] = int(self.error_counts[s] * 0.1)
                
            status = "operational"
            # Special check for silent GraphQL outage
            if self.current_incident == "silent_graphql_deadlock" and s in ["inventory-service", "gateway"]:
                status = "degraded"
                
            if error_rate > 0.35 or avg_lat > 2000:
                status = "critical"
                critical_count += 1
            elif error_rate > 0.05 or avg_lat > 500:
                status = "degraded"
                
            health_status[s] = {
                "avg_latency": round(avg_lat, 2),
                "error_rate": round(error_rate * 100, 2),
                "status": status
            }

        if self.current_incident == "silent_graphql_deadlock":
            overall_health = "degraded"
        elif critical_count >= 2:
            overall_health = "outage"
        elif critical_count == 1 or any(x["status"] == "degraded" for x in health_status.values()):
            overall_health = "degraded"

        return {
            "overall_status": overall_health,
            "services": health_status,
            "active_incident": self.current_incident
        }
