import time
from typing import Dict, List, Any, Optional

class SREAnalyticsEngine:
    def __init__(self):
        # Active incident tracking
        self.active_incidents = {}
        self.incident_history = []
        # EWMA dynamic baselines for latency metrics (decay alpha = 0.15)
        self.ewma_latencies = {s: 35.0 for s in ["gateway", "auth-service", "payment-service", "inventory-service", "db-cluster"]}
        self.ewma_alpha = 0.15
        
    def analyze_logs(self, logs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        anomalies = []
        for log in logs:
            service = log["service"]
            latency = log["latency_ms"]
            status = log["status_code"]
            message = log["message"]
            payload_size = log["payload_size"]
            
            # Phase 2: Compute EWMA baseline
            old_ewma = self.ewma_latencies[service]
            self.ewma_latencies[service] = (self.ewma_alpha * latency) + ((1 - self.ewma_alpha) * old_ewma)
            ewma = self.ewma_latencies[service]
            
            is_anomaly = False
            anomaly_reason = ""
            
            # 1. Standard HTTP errors
            if status >= 500:
                is_anomaly = True
                anomaly_reason = f"HTTP Error Status {status}"
            # 2. EWMA Latency spikes
            elif latency > max(old_ewma * 3.5, 450):
                is_anomaly = True
                anomaly_reason = f"EWMA Latency Spike: {latency}ms (Baseline: {round(old_ewma, 1)}ms)"
            # 3. Phase 2: GraphQL Silent Failure Detection (200 OK + small payload + contains errors)
            elif status == 200 and "errors" in message.lower() and payload_size < 150:
                is_anomaly = True
                anomaly_reason = "Silent API Failure: GraphQL returned 'errors' block inside 200 OK"
                
            if is_anomaly:
                anomalies.append({
                    "log": log,
                    "reason": anomaly_reason,
                    "timestamp": log["timestamp"]
                })
                
        return anomalies

    def cluster_anomalies_to_incidents(self, anomalies: List[Dict[str, Any]], active_incident_type: str, deployments: List[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        if not anomalies or active_incident_type == "healthy":
            if self.active_incidents:
                for inc_id, incident in list(self.active_incidents.items()):
                    incident["status"] = "resolved"
                    incident["resolved_at"] = time.time()
                    self.incident_history.append(incident)
                    del self.active_incidents[inc_id]
            return None

        # Group anomalies by service
        primary_service = "gateway"
        affected_services = set()
        error_signatures = []
        total_latency = 0
        
        for anom in anomalies:
            log = anom["log"]
            affected_services.add(log["service"])
            total_latency += log["latency_ms"]
            
            if log["level"] in ["ERROR", "WARN"] and log["service"] != "gateway":
                primary_service = log["service"]
                
            sig = f"{log['service']}: {log['message'][:60]}"
            if sig not in error_signatures:
                error_signatures.append(sig)
                
        avg_latency = total_latency / len(anomalies)
        
        if active_incident_type in self.active_incidents:
            incident = self.active_incidents[active_incident_type]
            incident["anomaly_count"] += len(anomalies)
            incident["last_seen"] = time.time()
            incident["avg_latency"] = round(avg_latency, 1)
            return incident
            
        incident_id = f"INC-{int(time.time() * 1000) % 100000:05d}"
        
        title = "Degraded Latency and High Error Rate in Downstream Core APIs"
        if active_incident_type == "db_pool_exhaustion":
            title = "Database Connection Pool Exhaustion in Database Cluster"
        elif active_incident_type == "payment_gateway_timeout":
            title = "Stripe Payment Gateway socket timeout outage"
        elif active_incident_type == "auth_memory_leak":
            title = "Auth Service Memory Leak & JVM OutOfMemoryError"
        elif active_incident_type == "spike_traffic":
            title = "Traffic Spike: Resource exhaustion warning on microservices"
        elif active_incident_type == "silent_graphql_deadlock":
            title = "GraphQL Silent Failure: Cart checkout field resolver deadlocks"

        incident = {
            "id": incident_id,
            "title": title,
            "type": active_incident_type,
            "status": "active",
            "triggered_at": time.time(),
            "last_seen": time.time(),
            "primary_service": primary_service,
            "affected_services": list(affected_services),
            "anomaly_count": len(anomalies),
            "avg_latency": round(avg_latency, 1),
            "signatures": error_signatures,
            "rca": self.generate_rca_report(incident_id, active_incident_type, primary_service, list(affected_services), error_signatures, deployments)
        }
        
        self.active_incidents[active_incident_type] = incident
        return incident

    def generate_rca_report(self, incident_id: str, incident_type: str, primary_service: str, affected_services: List[str], signatures: List[str], deployments: List[Dict[str, Any]] = None) -> str:
        triggered_time = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
        
        # Phase 2: Find correlated deployment
        correlated_deploy_block = ""
        if deployments:
            # Match recent deployment based on failing service
            matching_deploy = None
            if incident_type == "db_pool_exhaustion":
                matching_deploy = next((d for d in deployments if "db" in d["message"].lower() or any("db" in f for f in d["files_changed"])), None)
            elif incident_type == "silent_graphql_deadlock":
                matching_deploy = next((d for d in deployments if "graphql" in d["message"].lower() or any("resolver" in f for f in d["files_changed"])), None)
            
            if not matching_deploy:
                matching_deploy = deployments[-1] # fallback to latest
                
            correlated_deploy_block = f"""
## 📦 Correlated Code Deployment
DebugPilot detected a code rollout shortly before the anomaly occurred:
* **Deploy ID:** `{matching_deploy["id"]}` | **Commit Hash:** `{matching_deploy["commit"]}`
* **Author:** `{matching_deploy["author"]}`
* **Description:** *"{matching_deploy["message"]}"*
* **Files Modified:** {", ".join([f"`{f}`" for f in matching_deploy["files_changed"]])}
* **Correlation Confidence:** `98% (High)`
"""

        if incident_type == "db_pool_exhaustion":
            return f"""# AI Incident Root Cause Analysis (RCA) - {incident_id}
**Triggered at:** `{triggered_time}` | **Severity:** `CRITICAL` | **Primary Service:** `db-cluster`

## 🚨 Incident Summary
A major latency degradation (~6500ms) has occurred across the **db-cluster** causing dynamic API timeout failures in downstream **inventory-service** and cascading to **gateway** with `504 Gateway Timeouts`.
{correlated_deploy_block}
## 📌 Event Incident Timeline
1. **T+0s**: Traffic increases normally, database driver attempts to acquire connections from the Hikari CP.
2. **T+12s**: Connection pool limit reached (`100/100` active connections maxed).
3. **T+15s**: `inventory-service` requests begin locking waiting for a free DB driver socket.
4. **T+30s**: `gateway` times out on `/api/v1/checkout` requests, returning HTTP `504` errors to end-users.

## 🧠 Probable Root Cause
An un-indexed full-table join holds connections open indefinitely under concurrent transaction loads. This causes thread locks in the pool, exhausting the HikariCP max pool configuration.

## 🛠️ Automated Code Remediation
Apply this patch to the database transaction wrapper to safely release connections:

```diff
diff --git a/services/inventory/db/config.py b/services/inventory/db/config.py
--- a/services/inventory/db/config.py
+++ b/services/inventory/db/config.py
@@ -10,4 +10,6 @@
-    pool_size=100,
-    timeout=30,
+    pool_size=200,          # Increased pool size for concurrent request volumes
+    timeout=5,              # Fail-fast timeout decreased from 30s to 5s to avoid thread starvation
+    max_overflow=50,        # Allow temporary overflow buffers under peak stress
+    pool_recycle=1800       # Recycle connections every 30 minutes to clean up stale threads
```

## 💻 Recommended CLI SRE Commands
```bash
# Temporarily scale down inventory pods to flush connection locks
kubectl scale deployment inventory-service --replicas=1 -n prod

# Clear active pg_stat_activity transactions in DB
kubectl exec -it db-cluster-0 -n prod -- psql -U postgres -d inventory_prod -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND age(clock_timestamp(), query_start) > interval '10 seconds';"
```
"""
        elif incident_type == "payment_gateway_timeout":
            return f"""# AI Incident Root Cause Analysis (RCA) - {incident_id}
**Triggered at:** `{triggered_time}` | **Severity:** `HIGH` | **Primary Service:** `payment-service`

## 🚨 Incident Summary
The **payment-service** is encountering connection timeout errors (`SocketTimeoutException`) when attempting to communicate with external vendor API `stripe.api.global`. This is translating to heavy request timeouts on the gateway.

## 🧠 Probable Root Cause
The external payment processor (Stripe) is experiencing regional DNS routing failures or a gateway outage.

## 🛠️ Automated Code Remediation
Apply this circuit breaker fallback code to route traffic to Braintree backup:

```diff
diff --git "a/services/payment/client.py" b/services/payment/client.py
--- a/services/payment/client.py
+++ b/services/payment/client.py
@@ -15,4 +15,10 @@
-        response = stripe_client.charge(amount, currency)
-        return response
+        try:
+            response = stripe_client.charge(amount, currency, timeout=4.0)
+            return response
+        except Exception as e:
+            logger.error("Stripe gateway outage, triggering backup provider Adyen...")
+            return adyen_client.charge(amount, currency)
```
"""
        elif incident_type == "auth_memory_leak":
            return f"""# AI Incident Root Cause Analysis (RCA) - {incident_id}
**Triggered at:** `{triggered_time}` | **Severity:** `CRITICAL` | **Primary Service:** `auth-service`

## 🚨 Incident Summary
A creeping memory leak in **auth-service** has culminated in JVM heap exhaustion and consecutive `OutOfMemoryError` failures, causing severe latency degradation.

## 🧠 Probable Root Cause
A memory leak in the token verification cache. The cache stores JWT payload configurations indefinitely without eviction policies.

## 🛠️ Automated Code Remediation
Add a maximum capacity limit and an eviction strategy:

```diff
diff --git a/services/auth/TokenCache.java b/services/auth/TokenCache.java
--- a/services/auth/TokenCache.java
+++ b/services/auth/TokenCache.java
@@ -8,3 +8,6 @@
         Caffeine.newBuilder()
-                .recordStats()
-                .build();
+                .recordStats()
+                .maximumSize(10000)          # Set rigid maximum cache capacity
+                .expireAfterWrite(1, Hours)  # Evict tokens after 1 hour of generation
+                .build();
```
"""
        elif incident_type == "silent_graphql_deadlock":
            return f"""# AI Incident Root Cause Analysis (RCA) - {incident_id}
**Triggered at:** `{triggered_time}` | **Severity:** `MEDIUM` | **Primary Service:** `inventory-service`

## 🚨 Incident Summary
DebugPilot detected a **Silent API Failure** on `inventory-service`. The GraphQL endpoint returned HTTP `200 OK` but embedded an `errors` object inside the response JSON payload, returning empty/null checkout values.
{correlated_deploy_block}
## 🧠 Probable Root Cause
A recently pushed schema update to the Cart Checkout Field resolver contains a locking thread that times out when verifying authentication sessions downstream. This causes queries to return a null cart array.

## 🛠️ Automated Code Remediation
Add an async non-blocking lookup wrapper with thread recovery:

```diff
diff --git a/services/inventory/resolver.py b/services/inventory/resolver.py
--- a/services/inventory/resolver.py
+++ b/services/inventory/resolver.py
@@ -14,4 +14,5 @@
     def resolve_checkout(self, info):
-        user = auth_client.get_current_user() # Synchronous call blocking thread pool
-        return inventory_db.get_checkout(user)
+        # Run as asynchronous future with 2s strict timeout fallback
+        user = await auth_client.get_current_user_async(timeout=2.0)
+        return await inventory_db.get_checkout_async(user)
```

## 💻 Recommended CLI SRE Commands
```bash
# Force rollout restart of inventory-service to clear thread deadlock
kubectl rollout restart deployment inventory-service -n prod
```
"""
        else: # Spike traffic
            return f"""# AI Incident Root Cause Analysis (RCA) - {incident_id}
**Triggered at:** `{triggered_time}` | **Severity:** `WARNING` | **Primary Service:** `gateway`

## 🚨 Incident Summary
A sudden influx in ingress traffic volume (RPS Spike) has triggered transient latencies and minor thread rejection warnings.
"""

    def get_copilot_response(self, question: str, incident_type: str) -> str:
        q_lower = question.lower()
        
        if incident_type == "db_pool_exhaustion":
            if "why" in q_lower or "cause" in q_lower:
                return "The database cluster is experiencing pool exhaustion. The primary cause is an un-indexed full-table join in a recent update in `inventory-service` which leaves HikariCP connection threads open for too long under concurrency."
            elif "fix" in q_lower or "remediat" in q_lower or "patch" in q_lower or "runbook" in q_lower:
                return "To resolve the DB pool exhaustion, you can click the '⚡ Execute Remediation Runbook' button directly in the Incident Panel! This will automatically scale the DB connection limits, clear Postgres deadlock queries, and recover the system instantly."
            else:
                return "I am currently monitoring active incident **db_pool_exhaustion** on `db-cluster`. Ask me 'what caused this' or check out the direct 'Execute Remediation Runbook' button to resolve it automatically."
                
        elif incident_type == "payment_gateway_timeout":
            if "why" in q_lower or "cause" in q_lower:
                return "The Payment Gateway Socket Timeout occurs because our connection calls to `stripe.api.global` on port 443 are dropping. This suggests a routing outage on the Stripe CDN end."
            elif "fix" in q_lower or "remediat" in q_lower or "patch" in q_lower or "runbook" in q_lower:
                return "To route transactions to our backup Braintree gateway, click the '⚡ Execute Remediation Runbook' button in the Incident Card. This overrides routing tables, restoring transactions to healthy statuses instantly."
            else:
                return "I am tracking active incident **payment_gateway_timeout** in `payment-service`. Ask me how to route transactions to fallback providers or click the Runbook button in the dashboard."
                
        elif incident_type == "auth_memory_leak":
            if "why" in q_lower or "cause" in q_lower:
                return "The Auth Service has suffered a JVM Heap OutOfMemoryException. A cache leak in caffeine token storage stores validation objects indefinitely because there is no eviction policy configured."
            elif "fix" in q_lower or "remediat" in q_lower or "patch" in q_lower or "runbook" in q_lower:
                return "To resolve this, click '⚡ Execute Remediation Runbook' in the dashboard. This scales the JVM memory limits to 2GB and rolling-reloads the auth pods, clearing heap congestion instantly."
            else:
                return "I am currently analyzing active incident **auth_memory_leak** on `auth-service`. I can assist with Java code reviews, GC profiling analysis, or run runbook actions."
                
        elif incident_type == "silent_graphql_deadlock":
            if "why" in q_lower or "cause" in q_lower:
                return "The Silent API Failure occurs because the GraphQL Cart Checkout Field resolver blocks the thread pool waiting for an auth verification response. Although it returns HTTP 200 OK, it packs an 'errors' block and returns null results."
            elif "fix" in q_lower or "remediat" in q_lower or "patch" in q_lower or "runbook" in q_lower:
                return "Click '⚡ Execute Remediation Runbook' in the Incident card to rollout a hotfix deployment. This triggers a thread pool reload and applies non-blocking asynchronous future wrappers to resolve the deadlock."
            else:
                return "I am tracking active incident **silent_graphql_deadlock** on `inventory-service`. Ask me to explain the resolver issue or trigger the auto-mitigation button to fix it."
                
        elif incident_type == "spike_traffic":
            return "We are experiencing a high traffic spike (120+ RPS) on `gateway`. You can mitigate thread contention by clicking '⚡ Execute Remediation Runbook' to increase replica counts dynamically."
            
        else: # Healthy
            if "status" in q_lower or "health" in q_lower:
                return "All services are operating normally. Ingress traffic is healthy (~15 RPS), latency is balanced (~35ms), and error rate is 0.0%. No active alerts."
            elif "inject" in q_lower or "test" in q_lower:
                return "To test my SRE capabilities, use the **Fault Injector Deck** on the left side of the dashboard. Trigger an outage, then use our 'One-Click Runbook' mitigation to see self-healing SRE in action!"
            else:
                return "Greetings! I am DebugPilot SRE Copilot. I analyze logs, detect anomalies, cluster failures, and provide instant root cause diagnosis. You can inject an anomaly in the Control Deck or ask me to check system health."
