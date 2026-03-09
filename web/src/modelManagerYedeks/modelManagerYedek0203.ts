import * as Cesium from "cesium";
import { viewer } from "../harita";
import { MovementEngine } from "../movementEngineEski";

// --- NESNE TAKİPÇİLERİ (ENGINES) ---
let shipEngine: MovementEngine | null = null;
let planeEngine: MovementEngine | null = null;

let shipEntity: Cesium.Entity | null = null;
let planeEntity: Cesium.Entity | null = null;

// --- PERFORMANS SCRATCH ---
const scratchPos = new Cesium.Cartesian3();
const scratchOri = new Cesium.Quaternion();
const scratchMat3 = new Cesium.Matrix3();
const scratchMat4 = new Cesium.Matrix4();

/**
 * SignalR'dan gelen tüm güncellemeleri yöneten ana fonksiyon.
 * vx/vy/vz: ENU hız vektörü (m/s), heading/pitch/roll: derece
 */
export const updateEntityPosition = (id: string, lon: number, lat: number, height: number,
    vx: number, vy: number, vz: number, heading: number, pitch: number, roll: number) => {
    if (id === "SHIP_01") {
        if (!shipEngine) {
            shipEngine = new MovementEngine(lon, lat, height);
            //shipEngine.rotationOffset = Math.PI / 2; // Gemi modeli 90 derece sapmalı
            addAircraftCarrier();
        }
        shipEngine.onPacketReceived(lon, lat, height, vx, vy, vz, heading, pitch, roll);
    } 
    else if (id === "PLANE_01") {
        if (!planeEngine) {
            planeEngine = new MovementEngine(lon, lat, height);
            planeEngine.rotationOffset = -Math.PI / 2; // Uçak burnunu düzelt
            addLandingPlane();
        }
        
        // DİNAMİK DOCKING: Eğer yükseklik azaldıysa (iniş modu), gemiye çapala
        if (height < 20 && shipEngine) {
            planeEngine.dockTo(shipEngine);
        } else {
            planeEngine.dockTo(null);
        }

        planeEngine.onPacketReceived(lon, lat, height, vx, vy, vz, heading, pitch, roll);
    }
};

/**
 * Yardımcı: Gemiye göre ofset hesaplar.
 */
const getPositionWithOffset = (offset: Cesium.Cartesian3) => {
    return new Cesium.CallbackPositionProperty((time, result) => {
        if (!shipEntity) return undefined;
        const pos = shipEntity.position?.getValue(time, scratchPos);
        const ori = shipEntity.orientation?.getValue(time, scratchOri);
        if (!pos || !ori) return undefined;

        const transform = Cesium.Matrix4.fromRotationTranslation(
            Cesium.Matrix3.fromQuaternion(ori, scratchMat3),
            pos,
            scratchMat4
        );
        return Cesium.Matrix4.multiplyByPoint(transform, offset, result || new Cesium.Cartesian3());
    }, false);
};

export const addAircraftCarrier = (): void => {
    if (!viewer || shipEntity) return;

    shipEntity = viewer.entities.add({
        name: "Uçak Gemisi (Hassas Takip)",
        position: new Cesium.CallbackProperty((time, result) => {
            return shipEngine?.getLatestPosition(result || new Cesium.Cartesian3());
        }, false) as any,
        orientation: new Cesium.CallbackProperty((time, result) => {
            return shipEngine?.getLatestOrientation(result || new Cesium.Quaternion());
        }, false) as any,
        model: {
            uri: "./SampleData/models/AircraftCarrier/tcg_anadolul-400_low_poly.glb",
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            scale: 1.0,
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
            minimumPixelSize: 60,
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
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50000)
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
                        if (!lastPos || Cesium.Cartesian3.distance(lastPos, currentPos) > 1.0) {
                            planeHistory.push(Cesium.Cartesian3.clone(currentPos));
                            // Bellek yönetimi: Son 200 noktayı tut (yaklaşık 1.5 - 2 dakika)
                            if (planeHistory.length > 200) planeHistory.shift();
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
            })
        }
    });

    // Uçağa odaklan ama kilitleme (Haritanın dönmesini engeller)
    viewer.flyTo(planeEntity, {
        duration: 3,
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 5000)
    });
};

const drawFlightDeck = (parent: Cesium.Entity) => {
    const R = 7.7; 
    const sharedOrientation = new Cesium.CallbackProperty((time) => parent.orientation?.getValue(time), false);

    // 1. Ana Pist Zemini
    viewer!.entities.add({
        parent: parent,
        position: getPositionWithOffset(new Cesium.Cartesian3(R * 0.55, -R * 0.58, 0.02)),
        orientation: sharedOrientation,
        box: {
            dimensions: new Cesium.Cartesian3(R * 0.13, R * 1.23, 0.1),
            material: Cesium.Color.fromCssColorString("#2f3640").withAlpha(0.9),
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        },
    });

    // 2. İniş/Kalkış Şeritleri (Sarı)
    const offsets = [0.04, -1.2];
    offsets.forEach(y => {
        viewer!.entities.add({
            parent: parent,
            position: getPositionWithOffset(new Cesium.Cartesian3(R * 0.55, R * y, 0.03)),
            orientation: sharedOrientation,
            box: {
                dimensions: new Cesium.Cartesian3(R * 0.13, R * 0.013, 0.13),
                material: Cesium.Color.YELLOW,
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            },
        });
    });

    // 3. Kırmızı Halkalar
    const circles = [0.52, -1.55];
    circles.forEach(y => {
        viewer!.entities.add({
            parent: parent,
            position: getPositionWithOffset(new Cesium.Cartesian3(R * 1.42, R * y, 0.05)),
            orientation: sharedOrientation,
            ellipse: {
                semiMajorAxis: R * 0.2,
                semiMinorAxis: R * 0.2,
                material: Cesium.Color.RED.withAlpha(0.5),
                outline: true,
                outlineColor: Cesium.Color.RED,
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            },
        });
    });
};
