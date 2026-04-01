// Cesium base URL
(window as any).CESIUM_BASE_URL = './';

import 'cesium/Widgets/widgets.css';
import {
    Viewer, Ion, Terrain, createOsmBuildingsAsync,
    Cartesian3, Math as CesiumMath, Color
} from 'cesium';
import * as signalR from '@microsoft/signalr';
import { setViewer } from './harita';
import { ucusRotasiEkle, ucusRotasiEkleIlk } from './polyline_work/ucusRotasi';

Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzYzczNWQwYy1iNmE4LTRiYWYtOTlmNi02OGFlOTM4YmUyYmEiLCJpZCI6MjY3NzM2LCJpYXQiOjE3NDQyMzE2ODN9.U72KcRtBEhdciByjNEOXCdG2T_rogCDdwziOsx4b6yg';

let viewer: Viewer;
let connection: signalR.HubConnection;

// Test intervals
let httpInterval: number | null = null;
let pingInterval: number | null = null;
let dataInterval: number | null = null;

// Config
const config = {
    httpPerSec: 100,
    pingPerSec: 50,
    dataPerSec: 10,
    dataSizeKB: 50,
    maxConcurrent: 20  // Concurrent limiter
};

// Metrics
const metrics = {
    httpSent: 0,
    httpCompleted: 0,
    pingsSent: 0,
    pingsReceived: 0,
    dataSent: 0,
    dataReceived: 0,
    totalKB: 0,
    avgHttpMs: 0,
    responseTimes: [] as number[],
    startTime: 0,
    pendingRequests: 0  // Bekleyen istek sayısı
};

let msgId = 0;

// === Entity Frequency Metrics ===
interface EntityStat {
    lastTime: number;
    hz: number;
    samples: number[];
}
const entityStats: Record<string, EntityStat> = {};
const ENTITY_NAMES: Record<string, string> = {
    'SHIP_01': '🚢 Gemi',
    'DECK_01': '🏗️ Pist',
    'PLANE_01': '✈️ Uçak'
};

// === SignalR Connection Setup ===
function createSignalRConnection() {
    connection = new signalR.HubConnectionBuilder()
        .withUrl('/cesiumHub')
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .configureLogging(signalR.LogLevel.Warning)
        .build();

    // C# → JS: Pong response
    connection.on('ReceivePong', (counter: number, timestamp: string) => {
        metrics.pingsReceived++;
        updateMetrics();
    });

    // C# → JS: HTTP response
    connection.on('HttpResponse', (response: any) => {
        metrics.httpCompleted++;
        metrics.pendingRequests--;
        
        if (response.success && response.durationMs) {
            metrics.responseTimes.push(response.durationMs);
            if (metrics.responseTimes.length > 50) metrics.responseTimes.shift();
            metrics.avgHttpMs = metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length;
        }
        updateMetrics();
    });

    // C# → JS: Heavy data response
    connection.on('HeavyDataResponse', (response: any) => {
        metrics.dataReceived++;
        metrics.pendingRequests--;
        metrics.totalKB += JSON.stringify(response).length / 1024;
        updateMetrics();
    });

    // C# → JS: Data processed
    connection.on('DataProcessed', (response: any) => {
        metrics.pendingRequests--;
        updateMetrics();
    });

    // C# → JS: Process response
    connection.on('ProcessResponse', (response: any) => {
        metrics.pendingRequests--;
        console.log(`[SignalR] Process completed: ${response.requestId}`);
        updateMetrics();
    });

    // C# → JS: Nesne Konum Güncelleme
    // speed: yatay hız (m/s), h/p/r: radyan, timestamp: ms
    connection.on('EntityPositionUpdated', async (id: string, lon: number, lat: number, height: number,
        speed: number, h: number, p: number, r: number, timestamp: number) => {
        
        // Frekans Hesapla
        const now = performance.now();
        if (!entityStats[id]) {
            entityStats[id] = { lastTime: now, hz: 0, samples: [] };
        } else {
            const delta = now - entityStats[id].lastTime;
            if (delta > 0) {
                const currentHz = 1000 / delta;
                entityStats[id].samples.push(currentHz);
                if (entityStats[id].samples.length > 5) entityStats[id].samples.shift();
                entityStats[id].hz = entityStats[id].samples.reduce((a, b) => a + b, 0) / entityStats[id].samples.length;
            }
            entityStats[id].lastTime = now;
        }
        //updateEntityStatsUI();

        try {
            const { updateEntityPosition } = await import('./modelManager');
            updateEntityPosition(id, lon, lat, height, speed, h, p, r, timestamp);
        } catch (e) {
            console.error('Entity update error:', e);
        }
    });

    // Connection events
    connection.onreconnecting(() => {
        console.log('[SignalR] Reconnecting...');
        updateConnectionStatus('reconnecting');
    });

    connection.onreconnected(() => {
        console.log('[SignalR] Reconnected!');
        updateConnectionStatus('connected');
    });

    connection.onclose(() => {
        console.log('[SignalR] Connection closed');
        updateConnectionStatus('disconnected');
    });
}

async function startConnection() {
    try {
        await connection.start();
        console.log('[SignalR] Connected successfully!');
        updateConnectionStatus('connected');
    } catch (err) {
        console.error('[SignalR] Connection failed:', err);
        updateConnectionStatus('error');
        // 5 saniye sonra tekrar dene
        setTimeout(startConnection, 5000);
    }
}

function updateConnectionStatus(status: string) {
    const el = document.getElementById('connectionStatus');
    if (!el) return;
    
    const colors: Record<string, string> = {
        connected: '#0f0',
        reconnecting: '#ff0',
        disconnected: '#f00',
        error: '#f00'
    };
    
    el.style.color = colors[status] || '#fff';
    el.textContent = `SignalR: ${status}`;
}

// === HTTP TEST (via SignalR to C#) ===
function startHttp() {
    if (httpInterval) return;
    const intervalMs = Math.max(1, Math.floor(1000 / config.httpPerSec));
    
    httpInterval = window.setInterval(() => {
        // Concurrent limiter - bekleyen istek çok fazlaysa atla
        if (metrics.pendingRequests >= config.maxConcurrent) {
            return;
        }
        
        metrics.httpSent++;
        metrics.pendingRequests++;
        
        // HTTP isteğini C# tarafına yönlendir
        connection.invoke('RequestHttp', 'https://httpbin.org/delay/2', ++msgId)
            .catch(err => {
                console.error('[SignalR] HTTP request error:', err);
                metrics.pendingRequests--;
            });
            
        updateMetrics();
    }, intervalMs);
    
    updateButtons();
}

function stopHttp() {
    if (httpInterval) { 
        clearInterval(httpInterval); 
        httpInterval = null; 
    }
    updateButtons();
}

// === PING TEST ===
function startPing() {
    if (pingInterval) return;
    const intervalMs = Math.max(1, Math.floor(1000 / config.pingPerSec));
    
    pingInterval = window.setInterval(() => {
        metrics.pingsSent++;
        connection.invoke('SendPing', metrics.pingsSent)
            .catch(err => console.error('[SignalR] Ping error:', err));
        updateMetrics();
    }, intervalMs);
    
    updateButtons();
}

function stopPing() {
    if (pingInterval) { 
        clearInterval(pingInterval); 
        pingInterval = null; 
    }
    updateButtons();
}

// === DATA EXCHANGE TEST ===
function startData() {
    if (dataInterval) return;
    const intervalMs = Math.max(1, Math.floor(1000 / config.dataPerSec));
    
    dataInterval = window.setInterval(() => {
        if (metrics.pendingRequests >= config.maxConcurrent) {
            return;
        }
        
        metrics.dataSent++;
        metrics.pendingRequests++;
        
        connection.invoke('RequestHeavyData', config.dataSizeKB, ++msgId)
            .catch(err => {
                console.error('[SignalR] Data request error:', err);
                metrics.pendingRequests--;
            });
            
        updateMetrics();
    }, intervalMs);
    
    updateButtons();
}

function stopData() {
    if (dataInterval) { 
        clearInterval(dataInterval); 
        dataInterval = null; 
    }
    updateButtons();
}

function stopAll() {
    stopHttp(); 
    stopPing(); 
    stopData();
}

function resetMetrics() {
    Object.keys(metrics).forEach(k => {
        if (typeof (metrics as any)[k] === 'number') (metrics as any)[k] = 0;
    });
    metrics.responseTimes = [];
    metrics.startTime = performance.now();
    updateMetrics();
}

function updateMetrics() {
    const el = document.getElementById('metricsDisplay');
    if (!el) return;
    const elapsed = metrics.startTime > 0 ? (performance.now() - metrics.startTime) / 1000 : 0;
    
    el.innerHTML = `
        <div id="connectionStatus" style="color:#0f0;font-weight:bold;margin-bottom:8px">SignalR: connected</div>
        <div style="color:#00d4ff;font-weight:bold;margin-bottom:8px">📊 Metrics</div>
        <div>⏱️ ${elapsed.toFixed(1)}s</div>
        <div>⏳ Pending: ${metrics.pendingRequests}</div>
        <hr style="border-color:#333;margin:5px 0">
        <div>🌐 HTTP: ${metrics.httpCompleted}/${metrics.httpSent}</div>
        <div>⌛ Avg: ${metrics.avgHttpMs.toFixed(0)}ms</div>
        <hr style="border-color:#333;margin:5px 0">
        <div>🏓 Ping: ${metrics.pingsReceived}/${metrics.pingsSent}</div>
        <hr style="border-color:#333;margin:5px 0">
        <div>📦 Data: ${metrics.dataReceived}/${metrics.dataSent}</div>
        <div>📊 ${metrics.totalKB.toFixed(1)} KB</div>
    `;
}

function updateEntityStatsUI() {
    let el = document.getElementById('entityStatsDisplay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'entityStatsDisplay';
        el.style.cssText = 'position:fixed;top:20px;left:20px;background:rgba(0,0,0,0.7);color:#fff;padding:12px;border-radius:8px;font-family:monospace;font-size:13px;z-index:9999;border:1px solid rgba(255,255,255,0.2);backdrop-filter:blur(4px);';
        document.body.appendChild(el);
    }

    let html = `<div style="color:#00d4ff;font-weight:bold;margin-bottom:8px;border-bottom:1px solid #444;padding-bottom:4px">📡 Veri Paket Frekansları</div>`;
    
    Object.keys(ENTITY_NAMES).forEach(id => {
        const stat = entityStats[id];
        const hz = stat ? stat.hz.toFixed(1) : '0.0';
        const color = stat && stat.hz > 0 ? '#0f0' : '#888';
        html += `<div style="margin:4px 0;display:flex;justify-content:space-between;gap:20px;">
                    <span>${ENTITY_NAMES[id]}:</span>
                    <span style="color:${color};font-weight:bold;">${hz} Hz</span>
                 </div>`;
    });
    el.innerHTML = html;
}

function updateButtons() {
    const btnHttp = document.getElementById('btnHttp');
    const btnPing = document.getElementById('btnPing');
    const btnData = document.getElementById('btnData');
    
    if (btnHttp) {
        btnHttp.textContent = httpInterval ? '🛑 Stop HTTP' : '🌐 Start HTTP';
        btnHttp.style.background = httpInterval ? '#c33' : '#28a745';
    }
    if (btnPing) {
        btnPing.textContent = pingInterval ? '🛑 Stop Ping' : '🏓 Start Ping';
        btnPing.style.background = pingInterval ? '#c33' : '#667eea';
    }
    if (btnData) {
        btnData.textContent = dataInterval ? '🛑 Stop Data' : '📦 Start Data';
        btnData.style.background = dataInterval ? '#c33' : '#667eea';
    }
}

function createUI() {
    // Metrics panel
    const metricsEl = document.createElement('div');
    metricsEl.id = 'metricsDisplay';
    metricsEl.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(0,0,0,.9);color:#0f0;padding:15px;border-radius:10px;font-family:Consolas,monospace;font-size:12px;z-index:10000;min-width:180px;border:1px solid #0f0';
    document.body.appendChild(metricsEl);

    // Control panel
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;bottom:20px;left:20px;background:rgba(20,20,40,.95);padding:20px;border-radius:12px;z-index:10000;font-family:Segoe UI,sans-serif;max-width:300px';
    panel.innerHTML = `
        <style>
            .cfg-row { display:flex; align-items:center; margin:8px 0; gap:8px; }
            .cfg-row label { color:#aaa; font-size:12px; min-width:100px; }
            .cfg-row input { width:60px; padding:5px; border-radius:4px; border:1px solid #444; background:#222; color:#fff; }
            .test-btn { width:100%; padding:12px; border:none; border-radius:6px; cursor:pointer; font-size:13px; font-weight:bold; color:#fff; margin:5px 0; }
        </style>
        <div style="color:#00d4ff;font-size:16px;font-weight:bold;margin-bottom:15px">🔧 Test Controls (SignalR)</div>
        
        <div class="cfg-row"><label>Max Concurrent:</label><input id="cfgMaxConcurrent" type="number" value="${config.maxConcurrent}"></div>
        
        <hr style="border-color:#333;margin:10px 0">
        
        <div class="cfg-row"><label>HTTP/sec:</label><input id="cfgHttp" type="number" value="${config.httpPerSec}"></div>
        <button id="btnHttp" class="test-btn" style="background:#28a745">🌐 Start HTTP</button>
        
        <hr style="border-color:#333;margin:15px 0">
        
        <div class="cfg-row"><label>Ping/sec:</label><input id="cfgPing" type="number" value="${config.pingPerSec}"></div>
        <button id="btnPing" class="test-btn" style="background:#667eea">🏓 Start Ping</button>
        
        <hr style="border-color:#333;margin:15px 0">
        
        <div class="cfg-row"><label>Data/sec:</label><input id="cfgData" type="number" value="${config.dataPerSec}"></div>
        <div class="cfg-row"><label>Size (KB):</label><input id="cfgSize" type="number" value="${config.dataSizeKB}"></div>
        <button id="btnData" class="test-btn" style="background:#667eea">📦 Start Data</button>
        
        <hr style="border-color:#333;margin:15px 0">
        
        <button id="btnStopAll" class="test-btn" style="background:#c33">🛑 Stop All</button>
        <button id="btnReset" class="test-btn" style="background:#555">🔄 Reset Metrics</button>
    `;
    document.body.appendChild(panel);

    // Config inputs
    document.getElementById('cfgMaxConcurrent')?.addEventListener('change', (e) => {
        config.maxConcurrent = parseInt((e.target as HTMLInputElement).value) || 20;
    });
    document.getElementById('cfgHttp')?.addEventListener('change', (e) => {
        config.httpPerSec = parseInt((e.target as HTMLInputElement).value) || 100;
    });
    document.getElementById('cfgPing')?.addEventListener('change', (e) => {
        config.pingPerSec = parseInt((e.target as HTMLInputElement).value) || 50;
    });
    document.getElementById('cfgData')?.addEventListener('change', (e) => {
        config.dataPerSec = parseInt((e.target as HTMLInputElement).value) || 10;
    });
    document.getElementById('cfgSize')?.addEventListener('change', (e) => {
        config.dataSizeKB = parseInt((e.target as HTMLInputElement).value) || 50;
    });

    // Test buttons
    document.getElementById('btnHttp')?.addEventListener('click', () => httpInterval ? stopHttp() : startHttp());
    document.getElementById('btnPing')?.addEventListener('click', () => pingInterval ? stopPing() : startPing());
    document.getElementById('btnData')?.addEventListener('click', () => dataInterval ? stopData() : startData());
    document.getElementById('btnStopAll')?.addEventListener('click', stopAll);
    document.getElementById('btnReset')?.addEventListener('click', resetMetrics);

    resetMetrics();
}

async function initializeCesium() {
    const loadingOverlay = document.getElementById('loadingOverlay');

    try {
        viewer = new Viewer('cesiumContainer', {
            terrain: Terrain.fromWorldTerrain(),
            animation: false, baseLayerPicker: true, fullscreenButton: true,
            vrButton: false, geocoder: true, homeButton: true, infoBox: true,
            sceneModePicker: true, selectionIndicator: true, timeline: false,
            navigationHelpButton: false,
        });

        // Sol alt köşedeki Cesium logolarını gizle
        if (viewer.cesiumWidget.creditContainer) {
            (viewer.cesiumWidget.creditContainer as HTMLElement).style.display = 'none';
        }


        try {
            const osmBuildings = await createOsmBuildingsAsync();
            viewer.scene.primitives.add(osmBuildings);
        } catch {}

        viewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(29.0, 41.0, 50000),
            orientation: { heading: CesiumMath.toRadians(0), pitch: CesiumMath.toRadians(-45), roll: 0 },
            duration: 2
        });

        viewer.scene.backgroundColor = Color.fromCssColorString('#1a1a2e');

        // SignalR bağlantısını kur
        createSignalRConnection();
        await startConnection();

        //createUI();

        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
            setTimeout(() => loadingOverlay.style.display = 'none', 500);
        }

        // Harita manager'larını başlat
        setViewer(viewer);

        try {
            const { addAircraftCarrier } = await import('./modelManager');
            addAircraftCarrier();
        } catch (e) { console.warn('modelManager yüklenemedi:', e); }

        try {
            const { addPlane } = await import('./planeManager');
            addPlane();
        } catch (e) { console.warn('planeManager yüklenemedi:', e); }

        try {
            const { addImageAsModel } = await import('./imageToGlbManager');
            await addImageAsModel();
        } catch (e) { console.warn('imageToGlbManager yüklenemedi:', e); }

        try {
            const { addImprovedPlane } = await import('./improvedPlaneYedek');
            await addImprovedPlane();
        } catch (e) { console.warn('improvedPlaneYedek yüklenemedi:', e); }
/*
        try {
            const { solveSilhouetteProblem } = await import('./silhouetteProblemManager');
            solveSilhouetteProblem();
        } catch (e) { console.warn('silhouetteProblemManager yüklenemedi:', e); }
*/
/*      // STRESS TEST
        try {
            const { createStressTestUI } = await import('./stressTestManager');
            createStressTestUI();
            const { createBuildTimeStressTestUI } = await import('./buildTimeStressTest');
            createBuildTimeStressTestUI();
        } catch (e) { console.warn('stres manager yüklenemedi:', e); }
*/

        try {
            const { ucusRotasiEkle, ucusRotasiEkle1  ,ucusRotasiEkle2,ucusRotasiEkle_corridor,ucusRotasiEkle_sabit} = await import('./polyline_work/ucusRotasi');
            //await ucusRotasiEkle1();
            //await ucusRotasiEkle2();
            //await ucusRotasiEkle();
            //await ucusRotasiEkle_corridor();
            await ucusRotasiEkle_sabit();
        } catch (e) { console.warn('ucusRotasiEkle yüklenemedi:', e); }

        // Etkileşimli Çizim Aracı Kısayolu (R tuşu)
        document.addEventListener('keydown', async (e) => {
            if (e.key === 'r' || e.key === 'R') {
                try {
                    const { interaktifRotaCiziminiBaslat } = await import('./polyline_work/ucusRotasi');
                    interaktifRotaCiziminiBaslat(1000.0);
                    console.log("✏️ Çizim aracı aktif! Haritaya SOL TIK ile noktalar ekleyin. SAĞ TIK ile bitirin. (İrtifa: 1000m)");
                } catch (err) { console.error("Çizim aracı başlatılamadı:", err); }
            }
        });

        console.log('✅ Ready! SignalR connected. Harita managers loaded.');
    } catch (error) {
        console.error('Cesium error:', error);
    }
}

document.addEventListener('DOMContentLoaded', initializeCesium);
