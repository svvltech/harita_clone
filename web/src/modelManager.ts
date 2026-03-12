import * as Cesium from "cesium";
import { viewer } from "./harita";
import { MovementEngine, KinematicProfile } from "./movementEngine";

// --- VALIDATION LIMITS ---
const SHIP_LIMITS: KinematicProfile = {
    maxPhysicalSpeed: 40,
    maxAltitude: 300,
    minAltitude: -10,

    minCorrectionSpeed: 2.0,  // Gemi dururken bile düzeltmeleri çok yavaş (saniyede 2 metre) yapar.
    catchUpTimeSec: 3.0       // Hatayı kapatmak için acele etmez, 3 saniyeye yayarak pürüzsüzce süzülür.
};

const PLANE_LIMITS: KinematicProfile = {
    maxPhysicalSpeed: 600,
    maxAltitude: 25000,
    minAltitude: -100,

    minCorrectionSpeed: 20.0, // Taksi yaparken veya yavaşken bile konum sapmalarını atikçe (20 m/s) kapatır.
    catchUpTimeSec: 0.5       // Hatayı yarım saniye içinde çok agresif bir şekilde sönümler.
};

// --- NESNE TAKİPÇİLERİ (ENGINES) ---
let shipEngine: MovementEngine | null = null;
let planeEngine: MovementEngine | null = null;
let deckEngine: MovementEngine | null = null;

let shipEntity: Cesium.Entity | null = null;
let planeEntity: Cesium.Entity | null = null;
///////////
let rawPlaneEntity: Cesium.Entity | null = null;

let flightDeckGroup: Cesium.Entity | null = null;


// --- HAM VERİ KARŞILAŞTIRMASI ---
let rawPlanePos = new Cesium.Cartesian3(); // Engine'siz ham konum
let rawPlaneQuat = new Cesium.Quaternion();
const rawHpr = new Cesium.HeadingPitchRoll();
///////////


// --- PERFORMANS SCRATCH ---
const scratchPos = new Cesium.Cartesian3();
const scratchOri = new Cesium.Quaternion();
const scratchMat3 = new Cesium.Matrix3();
const scratchMat4 = new Cesium.Matrix4();

// Her karede engine'lerin zaman bilgisini güncelle
viewer?.scene.preUpdate.addEventListener(() => {
    shipEngine?.updateFrameTime();
    planeEngine?.updateFrameTime();
    deckEngine?.updateFrameTime();

    // --- DEBUG HUD GÜNCELLEME ---
    if (planeEngine) {
        updateDebugHud(planeEngine.getDebugInfo());
    }
});

// --- DEBUG HUD OVERLAY ---
let debugHudEl: HTMLDivElement | null = null;

function updateDebugHud(info: { timeSincePacket: number; speed: number; packetCount: number; status: string }) {
    if (!debugHudEl) {
        debugHudEl = document.createElement("div");
        debugHudEl.id = "debug-hud";
        debugHudEl.style.cssText = `
            position: fixed;
            top: 155px;
            left: 20px;
            background: rgba(0, 0, 0, 0.75);
            color: #fff;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 13px;
            padding: 10px 12px;
            border-radius: 8px;
            z-index: 99999;
            pointer-events: none;
            line-height: 1.6;
            min-width: 205px;
            border: 1px solid rgba(255,255,255,0.15);
            backdrop-filter: blur(4px);
        `;
        document.body.appendChild(debugHudEl);
    }

    const t = info.timeSincePacket.toFixed(1);
    const spd = info.speed.toFixed(1);

    // Renk: 0-3s yeşil, 3-15s sarı, 15+s kırmızı
    const barMax = 15;
    const barPct = Math.min(info.timeSincePacket / barMax, 1.0) * 100;
    const barColor = info.timeSincePacket > 15 ? "#ff4444" : info.timeSincePacket > 3 ? "#ffaa00" : "#44ff44";

    // Durum renkli göstergesi
    let statusColor = "#888";
    let statusLabel = info.status;
    if (info.status === "VERI_ALINIYOR") { statusColor = "#44ff44"; statusLabel = "VERI ALINIYOR"; }
    else if (info.status === "UZUN_BOSLUK") { statusColor = "#ffaa00"; statusLabel = "UZUN BOSLUK"; }
    else if (info.status === "TIMEOUT") { statusColor = "#ff4444"; statusLabel = "TIMEOUT - VERI YOK"; }
    else if (info.status === "ILK_PAKET") { statusColor = "#aaa"; statusLabel = "ILK PAKET BEKLENIYOR"; }

    debugHudEl.innerHTML = `
        <div style="margin-bottom:4px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${statusColor};margin-right:6px;"></span><b>${statusLabel}</b></div>
        <div>Son Paket: <b style="color:${barColor}">${t}s</b> once</div>
        <div>Hiz: <b>${spd} m/s</b></div>
        <div>Paket #${info.packetCount}</div>
        <div style="margin-top:6px; background:rgba(255,255,255,0.15); border-radius:4px; height:6px; overflow:hidden;">
            <div style="width:${barPct}%; height:100%; background:${barColor}; transition: width 0.2s;"></div>
        </div>
    `;
}

/**
 * SignalR'dan gelen tüm güncellemeleri yöneten ana fonksiyon.
 * speed: yatay hız (m/s), h/p/r: radyan, timestamp: ms
 */
export const updateEntityPosition = (id: string, lon: number, lat: number, height: number,
    speed: number, h: number, p: number, r: number, timestamp: number) => {
    if (id === "SHIP_01") {
        if (!shipEngine) {
            // shipEngine = new MovementEngine(lon, lat, height);
            shipEngine = new MovementEngine(lon, lat, height, 0, 0, 0, SHIP_LIMITS);
                (window as any).shipEngine = shipEngine; // GLOBALE BAĞLA (DEBUG)
            shipEngine.setOrientationOffset(Math.PI); // Gemi kıç tarafıyla (ters : Math.PI/2 iken ters gider) ilerlediği için 180 derece (PI) ofset ekledik ,
            addAircraftCarrier();
        }
        shipEngine.onPacketReceived(lon, lat, height, speed, h, p, r, timestamp);
    } 
    else if (id === "PLANE_01") {
        if (!planeEngine) {
            // planeEngine = new MovementEngine(lon, lat, height);
            planeEngine = new MovementEngine(lon, lat, height, 0, 0, 0, PLANE_LIMITS);
                (window as any).planeEngine = planeEngine; // GLOBALE BAĞLA (DEBUG)
            planeEngine.setOrientationOffset(-Math.PI / 2); // Uçak burnu 90 derece sapmalı, düzeltelim
            addLandingPlane();
        }


        planeEngine.onPacketReceived(lon, lat, height, speed, h, p, r, timestamp);

        // Ham veriyi de güncelle (engine'siz karşılaştırma için)
        Cesium.Cartesian3.fromDegrees(lon, lat, height, Cesium.Ellipsoid.WGS84, rawPlanePos);
        rawHpr.heading = h + (-Math.PI / 2);
        rawHpr.pitch = p;
        rawHpr.roll = r;
        Cesium.Transforms.headingPitchRollQuaternion(rawPlanePos, rawHpr, Cesium.Ellipsoid.WGS84, Cesium.Transforms.eastNorthUpToFixedFrame, rawPlaneQuat);
    }
    else if(id === "DECK_01"){
        if (!deckEngine) {
            // deckEngine = new MovementEngine(lon, lat, height);
            deckEngine = new MovementEngine(lon, lat, height, 0, 0, 0, SHIP_LIMITS);
                (window as any).deckEngine = deckEngine; // GLOBALE BAĞLA (DEBUG)
            createFlightDeckGroup();
        }
        deckEngine.onPacketReceived(lon, lat, height, speed, h, p, r, timestamp);
    }
};

export const addAircraftCarrier = (): void => {
    if (!viewer || shipEntity) return;

    const offsetAmount = 55.0; // Gemi ölçeği 6x olduğu için yükseklik ofseti de artır (40 dı)

    shipEntity = viewer.entities.add({
        name: "Uçak Gemisi (Hassas Takip)",
    position: new Cesium.CallbackProperty((time, result) => {
            const pos = shipEngine?.getLatestPosition(result || new Cesium.Cartesian3());
            if (!pos) return undefined;

            // --- YÜKSEKLİK OFSETİ HESAPLAMA ---
            // Dünyanın merkezinden dışarı doğru (yukarı) giden vektörü bul
            const surfaceNormal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pos, new Cesium.Cartesian3());
            // Bu vektörü offsetAmount kadar uzat
            const offsetVector = Cesium.Cartesian3.multiplyByScalar(surfaceNormal, offsetAmount, new Cesium.Cartesian3());
            // Mevcut pozisyona ekle
            return Cesium.Cartesian3.add(pos, offsetVector, result || new Cesium.Cartesian3());
        }, false) as any,
        /*
        position: new Cesium.CallbackProperty((time, result) => {
            return shipEngine?.getLatestPosition(result || new Cesium.Cartesian3());
        }, false) as any,
        */
        orientation: new Cesium.CallbackProperty((time, result) => {
            return shipEngine?.getLatestOrientation(result || new Cesium.Quaternion());
        }, false) as any,
        model: {
            uri: "./SampleData/models/AircraftCarrier/tcg_anadolul-400_low_poly.glb",
            heightReference: Cesium.HeightReference.NONE,
            scale: 6.0, // Gemi ve Pist'i daha net görmek için 6 kat ölçeklendi
        },
    });

    // PİST ÇİZİMİ (Önceki koddan generic oranlarla)
    drawFlightDeck(shipEntity);
};

export const addLandingPlane = (): void => {
    if (!viewer || planeEntity) return;

    planeEntity = viewer.entities.add({
        name: "İniş Yapan Uçak (Hassas)",
        position: new Cesium.CallbackProperty((time, result) => {
            return planeEngine?.getLatestPosition(result || new Cesium.Cartesian3());
        }, false) as any,
        orientation: new Cesium.CallbackProperty((time, result) => {
            return planeEngine?.getLatestOrientation(result || new Cesium.Quaternion());
        }, false) as any,
        model: {
            uri: "./SampleData/models/Bayraktar/baykar_bayraktar_tb2.glb",
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,

            minimumPixelSize: 100, //60
            scale: 6.0, // Uçağı daha net görmek için ölçeklendi //yoktu
        },
        label: {
            text: new Cesium.CallbackProperty((time) => {
                if (!planeEngine) return "";
                const pos = planeEngine.getLatestPosition(new Cesium.Cartesian3());
                const carto = Cesium.Cartographic.fromCartesian(pos);
                const altFt = (carto.height * 3.28084).toFixed(0);
                return `${altFt} ft`;
            }, false),
            font: "bold 16px monospace",
            fillColor: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -50),
            eyeOffset: new Cesium.Cartesian3(0, 0, -10),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }
    });

    // --- UÇUŞ İZİ (TRAIL) SİSTEMİ ---
    const planeHistory: Cesium.Cartesian3[] = [];
    let lastRecordTime = 0;

    viewer.entities.add({
        name: "Uçak İzi",
        polyline: {
            positions: new Cesium.CallbackProperty(() => {
                const now = performance.now();
                if (planeEngine && now - lastRecordTime > 500) { // Her 0.5s'de bir nokta kaydet
                    const currentPos = planeEngine.getLatestPosition(new Cesium.Cartesian3());
                    if (currentPos) {
                        // Bir önceki noktaya çok yakınsa kaydetme (gereksiz yükü önler)
                        const lastPos = planeHistory[planeHistory.length - 1];
                        /*
                        if (!lastPos || Cesium.Cartesian3.distance(lastPos, currentPos) > 1.0) {
                            planeHistory.push(Cesium.Cartesian3.clone(currentPos));
                            // Bellek yönetimi: Son 200 noktayı tut (yaklaşık 1.5 - 2 dakika)
                            if (planeHistory.length > 200) planeHistory.shift();
                        }
                        */
                        if (!lastPos) {
                            planeHistory.push(Cesium.Cartesian3.clone(currentPos));
                        } else {
                            // 1. İki nokta arasındaki mesafeyi bul
                            const dist = Cesium.Cartesian3.distance(lastPos, currentPos);
                            // 2. Geçen süreyi saniyeye çevir
                            const dtSec = (now - lastRecordTime) / 1000.0;
                            // 3. Bu noktanın çizilme hızını (m/s) hesapla
                            const currentDrawSpeed = dist / dtSec;
                            
                            // ════════════════════════════════════════════════════
                            // DİNAMİK KONTROL: Taşıtın kendi profil sınırını kullan
                            // ════════════════════════════════════════════════════
                            const jumpLimit = /*PLANE_LIMITS.maxJumpDistancePerSecond || */ 1000;

                            if (currentDrawSpeed > jumpLimit) {
                                // Çizim hızı fiziksel limiti aştı, bu bir ışınlanmadır!
                                planeHistory.length = 0; // Geçmişi sil, bağı kopar
                                planeHistory.push(Cesium.Cartesian3.clone(currentPos));  // Yeni noktadan iz bırakmaya başla
                            } 
                            else if (dist > 0.5) {
                                // Normal hızda uçuş, noktayı ekle
                                planeHistory.push(Cesium.Cartesian3.clone(currentPos));
                                if (planeHistory.length > 200) planeHistory.shift();
                            }
                        }                      
                        
                    }
                    lastRecordTime = now;
                }
                return planeHistory;
            }, false),
            width: 3,
            material: new Cesium.PolylineDashMaterialProperty({
                color: Cesium.Color.YELLOW,
                dashLength: 16,
                gapColor: Cesium.Color.BLACK.withAlpha(0)
            }),
        }
    });

    // Uçağa odaklan ama kilitleme (Haritanın dönmesini engeller)
    viewer.flyTo(planeEntity, {
        duration: 3,
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 800) // 5000 -> 1200 (Daha yakın takip)
    });

///////////////
    // ═══════════════════════════════════════════════
    // HAM VERİ KARŞILAŞTIRMA (Engine'siz kırmızı nokta)
    // ═══════════════════════════════════════════════
    
    rawPlaneEntity = viewer.entities.add({
        name: "Ham Veri (Engine'siz)",
        position: new Cesium.CallbackProperty(() => {
            return Cesium.Cartesian3.clone(rawPlanePos);
        }, false) as any,
        orientation: new Cesium.CallbackProperty(() => {
            return Cesium.Quaternion.clone(rawPlaneQuat);
        }, false) as any,
        point: {
            pixelSize: 15,
            color: Cesium.Color.RED,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.NONE,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 100000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
            text: "HAM VERİ",
            font: "bold 12px monospace",
            fillColor: Cesium.Color.RED,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, 25),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }
    });

    // Ham veri izi (kırmızı)
    const rawHistory: Cesium.Cartesian3[] = [];
    let lastRawTime = 0;
    viewer.entities.add({
        name: "Ham Veri İzi",
        polyline: {
            positions: new Cesium.CallbackProperty(() => {
                const now = performance.now();
                if (now - lastRawTime > 500) {
                    const pos = Cesium.Cartesian3.clone(rawPlanePos);
                    if (Cesium.Cartesian3.magnitude(pos) > 0) {
                        const lastPos = rawHistory[rawHistory.length - 1];
                        if (!lastPos || Cesium.Cartesian3.distance(lastPos, pos) > 0.5) {
                            rawHistory.push(pos);
                            if (rawHistory.length > 200) rawHistory.shift();
                        }
                    }
                    lastRawTime = now;
                }
                return rawHistory;
            }, false),
            width: 2,
            material: new Cesium.PolylineDashMaterialProperty({
                color: Cesium.Color.RED.withAlpha(0.7),
                dashLength: 8,
                gapColor: Cesium.Color.TRANSPARENT
            }),
        }
    });
    
    };

/**
* Pisti tek bir vücut olarak hareket ettiren ana "Konteynır"
*/
export const createFlightDeckGroup = () => {
    if (flightDeckGroup) return flightDeckGroup;

    flightDeckGroup = viewer!.entities.add({
        name: "Pist_Taktik_Katman",
        // Bu entity'nin görseli yok, sadece bir "çapa" (anchor) görevi görüyor
        position: new Cesium.CallbackProperty((time, result) => {
            // BURASI KRİTİK: Buraya senin MovementEngine'inden gelen 
            // ekstrapole edilmiş pist konumunu bağlayacağız.
            return deckEngine?.getLatestPosition(result || new Cesium.Cartesian3());
        }, false) as any,
        orientation: new Cesium.CallbackProperty((time, result) => {
            return deckEngine?.getLatestOrientation(result || new Cesium.Quaternion());
        }, false) as any,
    });

    // Artık çizim fonksiyonuna gemiyi değil, bu grubu gönderiyoruz
    drawFlightDeck(flightDeckGroup);
    
    return flightDeckGroup;
};

// Gruptaki parçaların kendi içindeki ofsetlerini hesaplayan yardımcı fonksiyon
const getOffsetInsideGroup = (group: Cesium.Entity, offset: Cesium.Cartesian3) => {
    return new Cesium.CallbackPositionProperty((time, result) => {
        const pos = group.position?.getValue(time, scratchPos);
        const ori = group.orientation?.getValue(time, scratchOri);
        if (!pos || !ori) return undefined;

        const transform = Cesium.Matrix4.fromRotationTranslation(
            Cesium.Matrix3.fromQuaternion(ori, scratchMat3),
            pos,
            scratchMat4
        );
        return Cesium.Matrix4.multiplyByPoint(transform, offset, result || new Cesium.Cartesian3());
    }, false);
};

const drawFlightDeck = (parent: Cesium.Entity) => {
    const R = 46.2; // Gemi ölçeği 6.0 olduğu için (7.7 * 6.0 = 46.2)
    const sharedOrientation = new Cesium.CallbackProperty((time) => parent.orientation?.getValue(time), false);

    // --- 1. ANA PİST ZEMİNİ ---
    viewer!.entities.add({
        parent: parent,
        position: getOffsetInsideGroup(parent, new Cesium.Cartesian3(25.8, -27.0, 0.0)), // 4.3 * 6, -4.5 * 6
        orientation: sharedOrientation,
        box: {
            dimensions: new Cesium.Cartesian3(R * 0.13, R * 1.40, 0.9), // Z skalası da 6x (0.15 * 6 = 0.9)
            material: Cesium.Color.fromCssColorString("#2f3640").withAlpha(0.9),
            heightReference: Cesium.HeightReference.NONE,
        },
    });

    // --- 2. ŞERİTLER (SARI) ---
    const stripePositions = [
        new Cesium.Cartesian3(25.8, 6.0, 0.6),    // Baş tarafı (4.3*6, 1.0*6, 0.1*6)
        new Cesium.Cartesian3(25.8, -58.2, 0.6),   // Kıç tarafı (4.3*6, -9.7*6, 0.1*6)
    ];
    stripePositions.forEach(pos => {
        viewer!.entities.add({
            parent: parent,
            position: getOffsetInsideGroup(parent, pos),
            orientation: sharedOrientation,
            box: {
                dimensions: new Cesium.Cartesian3(R * 0.13, R * 0.02, 0.15),
                material: Cesium.Color.YELLOW,
                heightReference: Cesium.HeightReference.NONE,
            },
        });
    });

    // --- 3. HELIPADLAR VE İSKELET ÇİZGİLERİ ---
    const helipadOffsets = [
        new Cesium.Cartesian3(70.2, 33.6, 8.4),   // Sancak-ileri (11.7*6, 5.6*6, 1.4*6)
        new Cesium.Cartesian3(67.8, -72.6, 8.4), // Sancak-geri (11.3*6, -12.1*6, 1.4*6)
    ];

    // İki kırmızı dairenin merkezini birbirine bağlayan uzun çizgi
    viewer!.entities.add({
        parent: parent,
        polyline: {
            positions: new Cesium.CallbackProperty((time) => {
                const startPos = getOffsetInsideGroup(parent, helipadOffsets[0]).getValue(time, new Cesium.Cartesian3());
                const endPos = getOffsetInsideGroup(parent, helipadOffsets[1]).getValue(time, new Cesium.Cartesian3());
                if (!startPos || !endPos) return [];
                return [startPos, endPos];
            }, false),
            width: 3,
            material: Cesium.Color.ROYALBLUE, 
            depthFailMaterial: Cesium.Color.ROYALBLUE.withAlpha(0.3)
        }
    });

    helipadOffsets.forEach((offset, index) => {
        // A. Kırmızı Elips (Helipad)
        viewer!.entities.add({
            parent: parent,
            position: getOffsetInsideGroup(parent, offset),
            orientation: sharedOrientation,
            ellipse: {
                semiMajorAxis: R * 0.15,
                semiMinorAxis: R * 0.15,
                material: Cesium.Color.RED.withAlpha(0.7),
                outline: true,
                outlineColor: Cesium.Color.RED,
                height: new Cesium.CallbackProperty((time) => {
                    const pos = parent.position?.getValue(time, scratchPos);
                    if (!pos) return 0;
                    const carto = Cesium.Cartographic.fromCartesian(pos);
                    return carto.height + offset.z;
                }, false),
                heightReference: Cesium.HeightReference.NONE,
            },
        });

        // B. Paralel ve Eğimli Kollar
        const deckAnchor = stripePositions[index]; 
        
        // Bükülme noktası (Bend): Helipaddan gemiye doğru düz bir çizgi çekeriz.
        // Y ve Z koordinatları helipad ile aynı kalır, sadece X ekseninde gemiye (48.0 hizasına) yaklaşır.
        const bendOffset = new Cesium.Cartesian3(48.0, offset.y, offset.z); // 8.0 * 6 = 48.0

        viewer!.entities.add({
            parent: parent,
            polyline: {
                positions: new Cesium.CallbackProperty((time) => {
                    // Güvertedeki sarı şerit -> Havada düz gelme noktası -> Helipad merkezi
                    const posStripe = getOffsetInsideGroup(parent, deckAnchor).getValue(time, new Cesium.Cartesian3());
                    const posBend = getOffsetInsideGroup(parent, bendOffset).getValue(time, new Cesium.Cartesian3());
                    const posHelipad = getOffsetInsideGroup(parent, offset).getValue(time, new Cesium.Cartesian3());
                    
                    if (!posStripe || !posBend || !posHelipad) return [];
                    return [posStripe, posBend, posHelipad];
                }, false),
                width: 3,
                material: Cesium.Color.ROYALBLUE, // Senin çizimindeki gibi düz, tok bir mavi renk
                depthFailMaterial: Cesium.Color.ROYALBLUE.withAlpha(0.3)
            }
        });
    });
};

// modelManager.ts sonuna eklenebilir
(window as any).testAttack = (scenario: number) => {
    if (!(window as any).planeEngine) {
        console.error("Uçak henüz oluşmadı!");
        return;
    }
    const engine = (window as any).planeEngine;
    const now = Date.now();
    const lon = 28.5, lat = 40.5, alt = 1000, speed = 100;

    switch(scenario) {
        case 1: // ZAMAN SALDIRISI (Gecikmiş Paket)
            console.log("Test 1: Eski Timestamp gönderiliyor...");
            engine.onPacketReceived(lon, lat, alt, speed, 0, 0, 0, now - 5000); 
            break;
            
        case 2: // NaN SALDIRISI
            console.log("Test 2: NaN veri gönderiliyor...");
            engine.onPacketReceived(lon, lat, NaN, speed, 0, 0, 0, now + 100);
            break;

        case 3: // COĞRAFİ SINIR SALDIRISI
            console.log("Test 3: Geçersiz Enlem (120 derece) gönderiliyor...");
            engine.onPacketReceived(lon, 120, alt, speed, 0, 0, 0, now + 200);
            break;

        case 4: // HIZ LİMİTİ SALDIRISI (Uçak için max 600m/s demiştik)
            console.log("Test 4: 2000 m/s hız gönderiliyor...");
            engine.onPacketReceived(lon, lat, alt, 2000, 0, 0, 0, now + 300);
            break;

        case 5: // ANLIK IŞINLANMA (Outlier Testi)
            console.log("Test 5: Uçak aniden 5km öteye ışınlanıyor (Tek Paket)...");
            engine.onPacketReceived(lon + 0.05, lat + 0.05, alt, speed, 0, 0, 0, now + 400);
            break;

        case 6: // KALICI IŞINLANMA (ForceSync Testi)
            console.log("Test 6: Uçak 5km ötede kalmaya zorlanıyor (1.5sn boyunca)...");
            let count = 0;
            const interval = setInterval(() => {
                engine.onPacketReceived(lon + 0.05, lat + 0.05, alt, speed, 0, 0, 0, Date.now());
                if (++count > 20) clearInterval(interval); // Yaklaşık 2sn boyunca gönder
            }, 100);
            break;
    }
};
