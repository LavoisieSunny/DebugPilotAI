// ==========================================
// DebugPilot AI - Upgraded SRE Dashboard Core JS
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    // State management variables
    let isLogStreamPaused = false;
    let soundEnabled = true;
    let activeIncidentId = null;
    let ws = null;
    let logBuffer = [];
    let currentDeployments = [];
    const MAX_DISPLAYED_LOGS = 200;
    
    // Telemetry chart variables
    let telemetryChart = null;
    const chartTimeLabels = [];
    const chartRpsData = [];
    const chartLatencyData = [];
    const chartErrorData = [];
    const maxChartDataPoints = 30;

    // Cache DOM Elements
    const logConsole = document.getElementById("log-console-feed");
    const logSearchInput = document.getElementById("log-search");
    const logServiceFilter = document.getElementById("log-service-filter");
    const logCounter = document.getElementById("log-counter");
    
    const btnLogPause = document.getElementById("btn-log-pause");
    const btnLogClear = document.getElementById("btn-log-clear");
    const btnSoundToggle = document.getElementById("btn-sound-toggle");
    
    const currentUtcTimeEl = document.getElementById("current-utc-time");
    const subValueEl = document.getElementById("sub-value");
    const systemHealthVal = document.getElementById("health-value");
    const systemHealthPill = document.getElementById("system-status-pill");
    
    const aiRcaCard = document.getElementById("ai-rca-card");
    const incBadge = document.getElementById("inc-badge");
    const incTitle = document.getElementById("inc-title");
    const incBody = document.getElementById("inc-body");
    
    // Phase 2 mitigation & deployment elements
    const mitigationBtnContainer = document.getElementById("mitigation-btn-container");
    const btnExecuteRunbook = document.getElementById("btn-execute-runbook");
    const btnTriggerDeploy = document.getElementById("btn-trigger-deploy");
    
    // Phase 2 Trace Modal elements
    const traceModal = document.getElementById("trace-modal");
    const traceMetaId = document.getElementById("trace-meta-id");
    const traceMetaIp = document.getElementById("trace-meta-ip");
    const traceTreeContainer = document.getElementById("trace-tree-container");
    const btnCloseModal = document.getElementById("btn-close-modal");
    
    const chatInput = document.getElementById("chat-input");
    const chatSubmit = document.getElementById("chat-submit");
    const chatMessages = document.getElementById("chat-messages");
    const btnMinimizeTerminal = document.getElementById("btn-minimize-terminal");
    const sreChatbot = document.getElementById("sre-chatbot");
    
    const alertSfx = document.getElementById("alert-sfx");
    
    // Initialize IST Clock (Dynamic SRE metric)
    setInterval(() => {
        const now = new Date();
        const options = { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" };
        const istTimeStr = now.toLocaleTimeString("en-US", options);
        currentUtcTimeEl.textContent = istTimeStr + " IST";
    }, 1000);


    // Sound Toggle
    btnSoundToggle.addEventListener("click", () => {
        soundEnabled = !soundEnabled;
        const icon = btnSoundToggle.querySelector("i");
        if (soundEnabled) {
            icon.className = "fa-solid fa-volume-high";
            btnSoundToggle.classList.remove("muted");
            alertSfx.volume = 0.2;
            alertSfx.play().catch(() => {});
        } else {
            icon.className = "fa-solid fa-volume-xmark";
            btnSoundToggle.classList.add("muted");
        }
    });

    // SRE Terminal Minimize
    btnMinimizeTerminal.addEventListener("click", () => {
        sreChatbot.classList.toggle("minimized");
        const icon = btnMinimizeTerminal.querySelector("i");
        if (sreChatbot.classList.contains("minimized")) {
            icon.className = "fa-solid fa-chevron-up";
            sreChatbot.style.height = "42px";
        } else {
            icon.className = "fa-solid fa-chevron-down";
            sreChatbot.style.height = "280px";
        }
    });

    // Create Ingestion Metrics Chart (Fully robust with try-catch and offline fallback)
    function initTelemetryChart() {
        try {
            const canvas = document.getElementById("telemetry-chart");
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            
            for (let i = 0; i < maxChartDataPoints; i++) {
                chartTimeLabels.push("");
                chartRpsData.push(0);
                chartLatencyData.push(0);
                chartErrorData.push(0);
            }

            if (typeof Chart === "undefined") {
                console.warn("Chart.js CDN is currently offline or blocked. Rendering beautiful SRE grid fallback.");
                // Draw a premium light grid fallback onto the canvas context directly
                ctx.fillStyle = "rgba(15, 23, 42, 0.01)";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = "rgba(15, 23, 42, 0.05)";
                ctx.lineWidth = 1;
                for (let i = 15; i < canvas.height; i += 30) {
                    ctx.beginPath();
                    ctx.moveTo(0, i);
                    ctx.lineTo(canvas.width, i);
                    ctx.stroke();
                }
                return;
            }

            telemetryChart = new Chart(ctx, {
                type: "line",
                data: {
                    labels: chartTimeLabels,
                    datasets: [
                        {
                            label: "RPS",
                            data: chartRpsData,
                            borderColor: "#0d9488",
                            backgroundColor: "rgba(13, 148, 136, 0.05)",
                            borderWidth: 2,
                            tension: 0.3,
                            yAxisID: "y-rps",
                            pointRadius: 0
                        },
                        {
                            label: "Gateway Latency (ms)",
                            data: chartLatencyData,
                            borderColor: "#7c3aed",
                            backgroundColor: "rgba(124, 58, 237, 0.05)",
                            borderWidth: 2,
                            tension: 0.3,
                            yAxisID: "y-lat",
                            pointRadius: 0
                        },
                        {
                            label: "Error Rate (%)",
                            data: chartErrorData,
                            borderColor: "#dc2626",
                            backgroundColor: "rgba(220, 38, 38, 0.05)",
                            borderWidth: 2,
                            tension: 0.3,
                            yAxisID: "y-err",
                            pointRadius: 0
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: "top",
                            labels: {
                                color: "#475569",
                                font: { family: "'Outfit', sans-serif", size: 11 }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: "rgba(15, 23, 42, 0.03)" },
                            ticks: { display: false }
                        },
                        "y-rps": {
                            type: "linear",
                            position: "left",
                            title: { display: true, text: "Requests / Sec", color: "#0d9488", font: { size: 10 } },
                            ticks: { color: "#475569" },
                            grid: { color: "rgba(15, 23, 42, 0.04)" },
                            min: 0,
                            max: 150
                        },
                        "y-lat": {
                            type: "linear",
                            position: "right",
                            title: { display: true, text: "Latency (ms)", color: "#7c3aed", font: { size: 10 } },
                            ticks: { color: "#475569" },
                            grid: { drawOnChartArea: false },
                            min: 0
                        },
                        "y-err": {
                            type: "linear",
                            position: "right",
                            title: { display: true, text: "Errors (%)", color: "#dc2626", font: { size: 10 } },
                            ticks: { color: "#475569", max: 100 },
                            grid: { drawOnChartArea: false },
                            min: 0,
                            max: 100
                        }
                    }
                }
            });
        } catch (err) {
            console.error("Failed to initialize Chart library safely:", err);
        }
    }

    function updateChartMetrics(metrics) {
        if (typeof Chart === "undefined" || !telemetryChart) return;
        
        chartRpsData.shift();
        chartLatencyData.shift();
        chartErrorData.shift();
        chartTimeLabels.shift();


        let rps = 15 + Math.round(Math.random() * 5);
        if (metrics.active_incident === "spike_traffic") {
            rps = 110 + Math.round(Math.random() * 20);
        } else if (metrics.active_incident !== "healthy") {
            rps = 25 + Math.round(Math.random() * 5);
        }

        const gatewayLat = metrics.services["gateway"] ? metrics.services["gateway"].avg_latency : 35;
        const gatewayErr = metrics.services["gateway"] ? metrics.services["gateway"].error_rate : 0.0;

        chartRpsData.push(rps);
        chartLatencyData.push(gatewayLat);
        chartErrorData.push(gatewayErr);
        
        const timestampStr = new Date().toLocaleTimeString().split(" ")[0];
        chartTimeLabels.push(timestampStr);

        if (gatewayLat > 2000) {
            telemetryChart.options.scales["y-lat"].max = 12000;
        } else {
            telemetryChart.options.scales["y-lat"].max = undefined;
        }

        telemetryChart.update("quiet");
    }

    // Connect to WebSocket Telemetry Stream (With permanent HTTP Polling lock after 2 attempts)
    let isSocketConnected = false;
    let fallbackInterval = null;
    let websocketAttempts = 0;
    const MAX_WEBSOCKET_ATTEMPTS = 2;

    function connectWebSocket() {
        if (websocketAttempts >= MAX_WEBSOCKET_ATTEMPTS) {
            console.log("ℹ️ WebSocket transport blocked twice. Sticking permanently to SRE HTTP Polling fallback.");
            triggerPollingFallback();
            return;
        }

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        websocketAttempts++;
        console.log(`Connecting to SRE telemetry stream (Attempt ${websocketAttempts}/${MAX_WEBSOCKET_ATTEMPTS}): ${wsUrl}`);
        
        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log("WebSocket stream connected successfully.");
                isSocketConnected = true;
                subValueEl.textContent = "1 (WS)";
                if (fallbackInterval) {
                    clearInterval(fallbackInterval);
                    fallbackInterval = null;
                }
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.type === "bootstrap") {
                    subValueEl.textContent = "1 (WS)";
                    bootstrapLogs(data.history);
                    currentDeployments = data.deployments || [];
                    updateGlobalStats(data.metrics, data.active_incident);
                    drawTopologyWires();
                } else if (data.type === "telemetry") {
                    appendLogs(data.logs);
                    currentDeployments = data.deployments || [];
                    updateGlobalStats(data.metrics, data.active_incident);
                }
            };

            ws.onclose = () => {
                console.warn("WebSocket closed.");
                isSocketConnected = false;
                triggerPollingFallback();
                
                // Only try to reconnect if we haven't hit the attempt limit
                if (websocketAttempts < MAX_WEBSOCKET_ATTEMPTS) {
                    subValueEl.textContent = "0";
                    setTimeout(connectWebSocket, 5000);
                }
            };

            ws.onerror = (err) => {
                console.warn("WebSocket transport blocked. Triggering HTTP Polling fallback.");
                isSocketConnected = false;
                triggerPollingFallback();
            };
        } catch (e) {
            console.warn("WebSocket interface unavailable. Running HTTP Polling fallback directly.");
            isSocketConnected = false;
            triggerPollingFallback();
        }
        
        // Fallback safety timeout
        setTimeout(() => {
            if (!isSocketConnected) {
                console.warn("WebSocket connection timeout. Activating HTTP Polling fallback...");
                triggerPollingFallback();
            }
        }, 1500);
    }


    // Phase 2: High-Fidelity HTTP Polling Fallback Manager
    function triggerPollingFallback() {
        if (fallbackInterval) return; // Already polling
        
        console.log("⚡ Auto-remediation network fallback: SRE dashboard running on HTTP Long-Polling.");
        subValueEl.textContent = "1 (REST)";
        
        // Bootstrapping initial metrics via API first
        fetchFallbackTelemetry();
        
        // Setup polling loop every 1.2 seconds
        fallbackInterval = setInterval(fetchFallbackTelemetry, 1200);
    }

    function fetchFallbackTelemetry() {
        if (isSocketConnected) {
            if (fallbackInterval) {
                clearInterval(fallbackInterval);
                fallbackInterval = null;
            }
            return;
        }

        fetch("/api/telemetry")
        .then(res => res.json())
        .then(data => {
            // Safe filter to prevent duplicate logs in scrolling buffer
            const existingTraceIds = new Set(logBuffer.map(l => l.trace_id));
            const freshLogs = data.logs.filter(l => !existingTraceIds.has(l.trace_id));
            
            if (freshLogs.length > 0) {
                appendLogs(freshLogs);
            }
            
            currentDeployments = data.deployments || [];
            updateGlobalStats(data.metrics, data.active_incident);
        })
        .catch(err => {
            console.error("HTTP telemetry fallback fetch failed:", err);
            subValueEl.textContent = "0 (Offline)";
        });
    }

    // Load initial boot history logs
    function bootstrapLogs(history) {
        logConsole.innerHTML = "";
        logBuffer = [...history];
        
        const filtered = applyLogFilters(logBuffer);
        filtered.forEach(log => {
            logConsole.appendChild(createLogElement(log));
        });
        scrollLogsToBottom();
        updateLogCountBadge();
    }

    // Process new log arrivals
    function appendLogs(newLogs) {
        logBuffer.push(...newLogs);
        
        if (logBuffer.length > 500) {
            logBuffer = logBuffer.slice(-500);
        }

        if (isLogStreamPaused) {
            updateLogCountBadge();
            return;
        }

        const filteredNew = applyLogFilters(newLogs);
        const shouldScroll = logConsole.scrollHeight - logConsole.clientHeight <= logConsole.scrollTop + 50;
        
        filteredNew.forEach(log => {
            logConsole.appendChild(createLogElement(log));
        });

        while (logConsole.childElementCount > MAX_DISPLAYED_LOGS) {
            logConsole.removeChild(logConsole.firstChild);
        }

        if (shouldScroll) {
            scrollLogsToBottom();
        }
        updateLogCountBadge();
    }

    // HTML Log Element Builder
    function createLogElement(log) {
        const row = document.createElement("div");
        const levelClass = log.level.toLowerCase();
        
        // Special highlighting for Silent Anomaly
        let silentStyle = "";
        if (log.status_code === 200 && log.message.includes("errors") && log.payload_size < 150) {
            row.className = `log-line log-warn`;
            silentStyle = `style="border-left: 3px solid var(--amber); background: rgba(251, 191, 36, 0.05);"`;
        } else {
            row.className = `log-line log-${levelClass}`;
        }
        
        const dateStr = new Date(log.timestamp * 1000).toISOString().split("T")[1].slice(0, -1);
        
        row.innerHTML = `
            <span class="log-ts">[${dateStr}]</span>
            <span class="log-svc">${log.service}</span>
            <span class="log-status">${log.status_code}</span>
            <span class="log-lat">${log.latency_ms}ms</span>
            <span class="log-msg">${escapeHtml(log.message)}</span>
        `;
        
        // Phase 2: Open Trace Modal Dialog when clicking a log line
        row.addEventListener("click", () => {
            openDistributedTraceModal(log.trace_id);
        });
        
        if (silentStyle) {
            row.setAttribute("style", "border-left: 3px solid var(--amber); background: rgba(251, 191, 36, 0.03);");
        }
        
        return row;
    }

    // Phase 2: Distributed Trace Tree Modal Parser (Jaeger style)
    function openDistributedTraceModal(traceId) {
        // Collect all logs matching this traceId from our local buffer
        const traceSpans = logBuffer.filter(log => log.trace_id === traceId);
        if (traceSpans.length === 0) return;
        
        // Sort spans. Gateway is typically first (parent_span_id is null)
        traceSpans.sort((a, b) => {
            if (a.parent_span_id === null) return -1;
            if (b.parent_span_id === null) return 1;
            return a.timestamp - b.timestamp;
        });

        // Set metadata headers
        traceMetaId.textContent = traceId;
        traceMetaIp.textContent = traceSpans[0].client_ip || "127.0.0.1";
        
        // Clear canvas
        traceTreeContainer.innerHTML = "";
        
        // Calculate total trace latency (duration of gateway span)
        const gatewaySpan = traceSpans.find(s => s.service === "gateway");
        const totalDuration = gatewaySpan ? gatewaySpan.latency_ms : Math.max(...traceSpans.map(s => s.latency_ms));

        traceSpans.forEach(span => {
            const spanRow = document.createElement("div");
            
            // Check if this span encountered errors
            const isError = span.status_code >= 500 || (span.status_code === 200 && span.message.includes("errors"));
            spanRow.className = `span-row ${isError ? 'span-err' : ''}`;
            
            // Indent child spans visually to represent nesting hierarchy
            let indent = 0;
            if (span.parent_span_id) {
                indent = 25; // 25px indentation for child spans
                if (span.service === "db-cluster") indent = 50; // deeper nesting for DB calls
            }
            spanRow.style.marginLeft = `${indent}px`;
            
            // Calculate percentage width of total duration for horizontal bar
            const pct = Math.min((span.latency_ms / totalDuration) * 100, 100);
            
            // Check for error signatures
            let errorTextHtml = "";
            if (isError) {
                errorTextHtml = `<div class="span-error-msg"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(span.message)}</div>`;
            }

            spanRow.innerHTML = `
                <div class="span-header">
                    <div>
                        <span class="span-svc-label">${span.service}</span>
                        <span style="color: var(--text-muted); font-size: 11px; margin-left: 8px;">${span.endpoint}</span>
                    </div>
                    <span class="span-duration">${span.latency_ms}ms</span>
                </div>
                <div class="span-sub-bar-container">
                    <div class="span-fill-bar" style="width: ${pct}%;"></div>
                </div>
                ${errorTextHtml}
            `;
            
            traceTreeContainer.appendChild(spanRow);
        });

        // Show Modal backdrop
        traceModal.style.display = "flex";
    }

    // Close modal triggers
    btnCloseModal.addEventListener("click", () => {
        traceModal.style.display = "none";
    });
    traceModal.addEventListener("click", (e) => {
        if (e.target === traceModal) traceModal.style.display = "none";
    });

    // Filtering logic
    function applyLogFilters(logs) {
        const query = logSearchInput.value.toLowerCase().trim();
        const service = logServiceFilter.value;
        
        return logs.filter(log => {
            if (service !== "all" && log.service !== service) return false;
            if (query !== "") {
                const matchMsg = log.message.toLowerCase().includes(query);
                const matchSvc = log.service.toLowerCase().includes(query);
                const matchStatus = String(log.status_code).includes(query);
                const matchTrace = log.trace_id.toLowerCase().includes(query);
                return matchMsg || matchSvc || matchStatus || matchTrace;
            }
            return true;
        });
    }

    function triggerFilterReload() {
        logConsole.innerHTML = "";
        const filtered = applyLogFilters(logBuffer);
        const toShow = filtered.slice(-MAX_DISPLAYED_LOGS);
        toShow.forEach(log => {
            logConsole.appendChild(createLogElement(log));
        });
        scrollLogsToBottom();
        updateLogCountBadge();
    }

    logSearchInput.addEventListener("input", triggerFilterReload);
    logServiceFilter.addEventListener("change", triggerFilterReload);

    function scrollLogsToBottom() {
        logConsole.scrollTop = logConsole.scrollHeight;
    }

    function updateLogCountBadge() {
        logCounter.textContent = `${logBuffer.length} logs ingested | Showing ${logConsole.childElementCount}`;
    }

    btnLogPause.addEventListener("click", () => {
        isLogStreamPaused = !isLogStreamPaused;
        if (isLogStreamPaused) {
            btnLogPause.innerHTML = '<i class="fa-solid fa-play"></i> <span class="btn-lbl">Resume Stream</span>';
            btnLogPause.classList.add("active");
        } else {
            btnLogPause.innerHTML = '<i class="fa-solid fa-pause"></i> <span class="btn-lbl">Pause Stream</span>';
            btnLogPause.classList.remove("active");
            triggerFilterReload();
        }
    });

    btnLogClear.addEventListener("click", () => {
        logConsole.innerHTML = "";
        logBuffer = [];
        updateLogCountBadge();
    });

    // Update Topology states & metrics
    function updateGlobalStats(metrics, activeIncident) {
        const status = metrics.overall_status;
        systemHealthVal.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        
        if (status === "healthy") {
            systemHealthVal.className = "pill-value text-green";
            systemHealthPill.querySelector(".status-indicator").className = "status-indicator ping-green";
        } else if (status === "degraded") {
            systemHealthVal.className = "pill-value text-amber";
            systemHealthPill.querySelector(".status-indicator").className = "status-indicator ping-amber";
        } else {
            systemHealthVal.className = "pill-value text-rose";
            systemHealthPill.querySelector(".status-indicator").className = "status-indicator ping-red";
        }

        // Live Nodes Status Render
        for (const [svcName, info] of Object.entries(metrics.services)) {
            const nodeEl = document.getElementById(`node-${svcName}`);
            const nodeTelEl = document.getElementById(`node-${svcName}-tel`);
            
            if (nodeEl) {
                nodeEl.classList.remove("node-degraded", "node-critical");
                
                if (info.status === "degraded") {
                    nodeEl.classList.add("node-degraded");
                } else if (info.status === "critical") {
                    nodeEl.classList.add("node-critical");
                }
                
                nodeTelEl.textContent = `${info.avg_latency}ms | ${info.error_rate}% err`;
            }
        }

        drawTopologyWires(metrics.services);
        updateChartMetrics(metrics);
        handleActiveIncident(activeIncident);
        updatePrognosisCard(activeIncident);
    }

    // Phase 2: SRE AI Outage Predictor Card Manager
    function updatePrognosisCard(incident) {
        const progCard = document.querySelector(".prognosis-card");
        const progTitle = document.getElementById("prog-title");
        const progDesc = document.getElementById("prog-desc");
        
        if (!progCard || !progTitle || !progDesc) return;
        
        if (!incident) {
            progCard.classList.remove("prog-warning");
            progTitle.textContent = "System Stable (99.8% Reliability)";
            progDesc.textContent = "AI is forecasting telemetry bounds. Zero anomaly symptoms isolated in request logs.";
            return;
        }
        
        progCard.classList.add("prog-warning");
        
        if (incident.type === "auth_memory_leak") {
            progTitle.textContent = "Outage Imminent: auth-service (94% confidence)";
            progDesc.textContent = "AI Prognosis: Creeping JVM memory leak detected (+18MB/s). Heap size will exhaust limit (-Xmx1024m) in 22 seconds. Preemptive pod reload required.";
        } else if (incident.type === "db_pool_exhaustion") {
            progTitle.textContent = "Outage Imminent: db-cluster (98% confidence)";
            progDesc.textContent = "AI Prognosis: Rapid Hikari connection pool deadlock. Database limits hit maximum ceiling. Cascade backend latency lockout imminent.";
        } else if (incident.type === "silent_graphql_deadlock") {
            progTitle.textContent = "Outage Imminent: inventory-service (89% confidence)";
            progDesc.textContent = "AI Prognosis: AccessDenied exceptions isolated in resolver threads. Silent failure detected inside 200 OK GraphQL queries.";
        } else if (incident.type === "payment_gateway_timeout") {
            progTitle.textContent = "Outage Imminent: payment-service (88% confidence)";
            progDesc.textContent = "AI Prognosis: Third-party Stripe API SocketTimeoutException warnings detected. External egress payment routes dropping transactions.";
        } else {
            progTitle.textContent = "Outage Imminent: gateway (78% confidence)";
            progDesc.textContent = "AI Prognosis: High request load causing minor thread pool congestion warnings on core checkouts.";
        }
    }

    // Active Incident Manager (Plays sirens, shows One-click mitigation triggers, dispatches Slack)
    function handleActiveIncident(incident) {
        if (!incident) {
            if (activeIncidentId !== null) {
                activeIncidentId = null;
                appendSREMessage("System recovered. Incident cleared successfully. All APIs back within healthy EWMA latency bounds.");
            }
            
            incBadge.className = "inc-status-tag tag-green";
            incBadge.textContent = "Healthy";
            incTitle.textContent = "No Active System Failures";
            incBody.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-circle-check text-green bounce-animation"></i></div>
                    <h4>System Status fully Operational</h4>
                    <p>Ingestion streams are healthy. No active anomalies clustered. Trigger an incident using the Fault Deck to see AI RCA Diagnostics.</p>
                </div>
            `;
            aiRcaCard.style.borderColor = "var(--border-glass)";
            mitigationBtnContainer.style.display = "none";
            return;
        }

        const isNewIncident = activeIncidentId !== incident.id;
        activeIncidentId = incident.id;

        if (isNewIncident) {
            if (soundEnabled) {
                alertSfx.volume = 0.35;
                alertSfx.play().catch(() => {});
            }
            appendSREMessage(`🚨 [ALERT DETECTED]: Dynamic clustering engine triggered incident **${incident.id}** on service **${incident.primary_service}**. Root Cause analyzer running...`);
            
            // Phase 2 Hackathon dispatch trigger: Send Slack Notification block if checked
            const slackChecked = document.getElementById("toggle-slack")?.checked;
            if (slackChecked) {
                dispatchSlackAlert(incident);
            }
        }

        let badgeColor = "tag-red";
        if (incident.type === "payment_gateway_timeout" || incident.type === "silent_graphql_deadlock") badgeColor = "tag-amber";
        if (incident.type === "spike_traffic") badgeColor = "tag-violet";
        
        incBadge.className = `inc-status-tag ${badgeColor}`;
        incBadge.textContent = `${incident.id} | ${incident.type.toUpperCase().replace(/_/g, " ")}`;
        incTitle.textContent = incident.title;

        mitigationBtnContainer.style.display = "block";
        btnExecuteRunbook.innerHTML = '<i class="fa-solid fa-bolt-lightning"></i> ⚡ Execute Remediation Runbook';
        btnExecuteRunbook.disabled = false;

        // Render Markdown
        if (typeof marked !== "undefined" && incident.rca) {
            const rawHtml = marked.parse(incident.rca);
            
            let processedHtml = rawHtml.replace(/<pre><code class="language-diff">([\s\S]*?)<\/code><\/pre>/g, (match, code) => {
                const lines = code.split("\n").map(line => {
                    if (line.startsWith("+")) return `<span class="diff-add">${escapeHtml(line)}</span>`;
                    if (line.startsWith("-")) return `<span class="diff-del">${escapeHtml(line)}</span>`;
                    return escapeHtml(line);
                }).join("\n");
                return `<pre><code class="language-diff">${lines}</code></pre>`;
            });
            
            incBody.innerHTML = processedHtml;
        } else {
            incBody.textContent = incident.rca || "Generating incident analysis report...";
        }

        if (incident.type === "db_pool_exhaustion" || incident.type === "auth_memory_leak") {
            aiRcaCard.style.borderColor = "var(--rose)";
        } else if (incident.type === "payment_gateway_timeout" || incident.type === "silent_graphql_deadlock") {
            aiRcaCard.style.borderColor = "var(--amber)";
        } else {
            aiRcaCard.style.borderColor = "var(--violet)";
        }
    }

    // Phase 2: Slide-in Slack Block Kit Notification Toast Builder
    function dispatchSlackAlert(incident) {
        const slackContainer = document.getElementById("slack-toast-container");
        if (!slackContainer) return;
        
        const toast = document.createElement("div");
        toast.className = "slack-toast";
        
        let sevColor = "#e01e5a"; // pink for critical
        let sevLabel = "CRITICAL";
        if (incident.type === "silent_graphql_deadlock" || incident.type === "payment_gateway_timeout") {
            sevColor = "#ecb22e"; // yellow for high
            sevLabel = "HIGH";
        }
        
        toast.innerHTML = `
            <div class="slack-header">
                <div class="slack-app-identity">
                    <span class="slack-app-logo"><i class="fa-solid fa-robot"></i></span>
                    <span>DebugPilot SRE-Agent</span>
                </div>
                <span class="slack-channel">#sre-alerts</span>
            </div>
            <div class="slack-body">
                <div class="slack-msg-title">🚨 [INCIDENT ALARM]: ${incident.id}</div>
                <div class="slack-msg-desc">Primary service <strong>${incident.primary_service}</strong> is experiencing critical EWMA latency bounds degradation. Core checkouts affected.</div>
                <div class="slack-block-kit-card" style="border-left-color: ${sevColor};">
                    <div class="slack-block-row">
                        <span class="slack-block-lbl">Severity:</span>
                        <span class="slack-block-val" style="color: ${sevColor};">${sevLabel}</span>
                    </div>
                    <div class="slack-block-row">
                        <span class="slack-block-lbl">Anomalies:</span>
                        <span class="slack-block-val">${incident.anomaly_count} logs clustered</span>
                    </div>
                    <div class="slack-block-row">
                        <span class="slack-block-lbl">Commit Correlation:</span>
                        <span class="slack-block-val" style="color: var(--violet);">${currentDeployments.length > 0 ? currentDeployments[currentDeployments.length - 1].commit : 'none'}</span>
                    </div>
                </div>
            </div>
            <div class="slack-footer">
                <i class="fa-regular fa-clock"></i> Just now | Sent from DebugPilot SRE Webhook Hub
            </div>
        `;
        
        slackContainer.appendChild(toast);
        
        // Slide out and remove toast after 6 seconds
        setTimeout(() => {
            toast.classList.add("fade-out");
            setTimeout(() => {
                slackContainer.removeChild(toast);
            }, 350);
        }, 5500);
    }


    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Draw SVG wire bridges
    function drawTopologyWires(services = {}) {
        const svg = document.getElementById("topology-svg");
        const container = document.getElementById("network-container");
        if (!svg || !container) return;

        svg.innerHTML = `
            <defs>
                <linearGradient id="grad-healthy" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="var(--teal)" stop-opacity="0.3"/>
                    <stop offset="100%" stop-color="var(--green)" stop-opacity="0.3"/>
                </linearGradient>
                <linearGradient id="grad-degraded" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="var(--amber)" stop-opacity="0.5"/>
                    <stop offset="100%" stop-color="var(--amber)" stop-opacity="0.5"/>
                </linearGradient>
                <linearGradient id="grad-critical" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="var(--rose)" stop-opacity="0.6"/>
                    <stop offset="100%" stop-color="var(--rose)" stop-opacity="0.6"/>
                </linearGradient>
            </defs>
        `;

        const connections = [
            { from: "gateway", to: "auth-service" },
            { from: "gateway", to: "payment-service" },
            { from: "gateway", to: "inventory-service" },
            { from: "inventory-service", to: "db-cluster" }
        ];

        const containerRect = container.getBoundingClientRect();

        connections.forEach(conn => {
            const fromNode = document.getElementById(`node-${conn.from}`);
            const toNode = document.getElementById(`node-${conn.to}`);
            
            if (!fromNode || !toNode) return;

            const fromRect = fromNode.getBoundingClientRect();
            const toRect = toNode.getBoundingClientRect();

            const x1 = (fromRect.left + fromRect.width / 2) - containerRect.left;
            const y1 = (fromRect.top + fromRect.height / 2) - containerRect.top;
            
            const x2 = (toRect.left + toRect.width / 2) - containerRect.left;
            const y2 = (toRect.top + toRect.height / 2) - containerRect.top;

            const targetSvcInfo = services[conn.to];
            let color = "url(#grad-healthy)";
            let strokeWidth = 1.5;
            let speed = "30s";

            if (targetSvcInfo) {
                if (targetSvcInfo.status === "degraded") {
                    color = "var(--amber)";
                    strokeWidth = 2.0;
                    speed = "15s";
                } else if (targetSvcInfo.status === "critical") {
                    color = "var(--rose)";
                    strokeWidth = 3.0;
                    speed = "6s";
                }
            }

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            
            const dx = x2 - x1;
            const dy = y2 - y1;
            const cx1 = x1 + dx * 0.1;
            const cy1 = y1 + dy * 0.9;
            const cx2 = x1 + dx * 0.5;
            const cy2 = y1 + dy * 0.5;
            
            const pathString = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
            
            path.setAttribute("d", pathString);
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", color);
            path.setAttribute("stroke-width", strokeWidth);
            path.setAttribute("class", "topo-wire");
            path.style.animationDuration = speed;

            svg.appendChild(path);
        });
    }

    window.addEventListener("resize", () => drawTopologyWires());

    // Inject buttons
    const injectButtons = document.querySelectorAll(".inject-btn");
    injectButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const incidentType = btn.getAttribute("data-incident");
            if (!incidentType) return; // Ignore deploy trigger button clicks
            
            injectButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            fetch("/api/inject-anomaly", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ incident_type: incidentType })
            })
            .then(res => res.json())
            .then(data => {
                console.log("Anomaly updated:", data);
            });
        });
    });

    // Phase 2: One-Click Runbook Remediation Click Trigger
    btnExecuteRunbook.addEventListener("click", () => {
        // Show spinner loading status
        btnExecuteRunbook.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Executing Auto-Healing Runbook...';
        btnExecuteRunbook.disabled = true;
        
        fetch("/api/mitigate", {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        })
        .then(res => res.json())
        .then(data => {
            console.log("Mitigated active incident:", data);
            appendSREMessage("⚡ SRE runbook succeeded: cleared active locks, adjusted resources, and flushed telemetry caches.");
            
            // Return Inject Button Deck active states to healthy
            injectButtons.forEach(b => b.classList.remove("active"));
            const healthyBtn = document.getElementById("btn-inject-healthy");
            if (healthyBtn) healthyBtn.classList.add("active");
        })
        .catch(err => {
            console.error("Failed to execute runbook:", err);
            btnExecuteRunbook.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Execution Failed';
            btnExecuteRunbook.disabled = false;
        });
    });

    // Phase 2: Mock Code Deployment Trigger
    btnTriggerDeploy.addEventListener("click", () => {
        btnTriggerDeploy.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pushing Commit e93a4b7...';
        btnTriggerDeploy.disabled = true;
        
        fetch("/api/deploy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: "GraphQL schema adjustments for shopping cart resolver queries",
                author: "dev-checkout@company.com",
                files_changed: ["services/inventory/resolver.py"]
            })
        })
        .then(res => res.json())
        .then(data => {
            console.log("Deployed schema commit:", data);
            appendSREMessage("📦 Commit `e93a4b7` deployed successfully on `inventory-service` by dev-checkout@company.com.");
            btnTriggerDeploy.innerHTML = '<i class="fa-solid fa-code-commit"></i> Rollout Buggy Schema';
            btnTriggerDeploy.disabled = false;
            
            // Set active state on GraphQL injector button
            injectButtons.forEach(b => b.classList.remove("active"));
            const gqlBtn = document.getElementById("btn-inject-graphql");
            if (gqlBtn) gqlBtn.classList.add("active");
        })
        .catch(err => {
            console.error("Failed to trigger deploy:", err);
            btnTriggerDeploy.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Deploy Failed';
            btnTriggerDeploy.disabled = false;
        });
    });

    // Chatbot Submit
    chatSubmit.addEventListener("click", triggerUserChat);
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") triggerUserChat();
    });

    function triggerUserChat() {
        const text = chatInput.value.trim();
        if (text === "") return;

        appendUserMessage(text);
        chatInput.value = "";

        const typingEl = document.createElement("div");
        typingEl.className = "bot-msg";
        typingEl.id = "bot-typing";
        typingEl.innerHTML = `<p><strong>[DebugPilot AI]:</strong> <i class="fa-solid fa-circle-notch fa-spin"></i> Analyzing telemetry logs and config trees...</p>`;
        chatMessages.appendChild(typingEl);
        scrollChatToBottom();

        fetch("/api/copilot/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text })
        })
        .then(res => res.json())
        .then(data => {
            const typing = document.getElementById("bot-typing");
            if (typing) chatMessages.removeChild(typing);
            appendSREMessage(data.reply);
        })
        .catch(err => {
            console.error("Chat engine failed:", err);
            const typing = document.getElementById("bot-typing");
            if (typing) chatMessages.removeChild(typing);
            appendSREMessage("Error: SRE Chat engine connection dropped. Verify server status.");
        });
    }

    function appendUserMessage(text) {
        const msg = document.createElement("div");
        msg.className = "user-msg";
        msg.innerHTML = `<p><strong>[Operator]:</strong> ${escapeHtml(text)}</p>`;
        chatMessages.appendChild(msg);
        scrollChatToBottom();
    }

    function appendSREMessage(text) {
        const msg = document.createElement("div");
        msg.className = "bot-msg";
        msg.innerHTML = `<p><strong>[DebugPilot AI]:</strong> ${escapeHtml(text)}</p>`;
        chatMessages.appendChild(msg);
        scrollChatToBottom();
    }

    function scrollChatToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    initTelemetryChart();
    connectWebSocket();
});
