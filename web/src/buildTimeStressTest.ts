import * as Cesium from "cesium";
import { viewer } from "./harita";

let stressTestEntities: Cesium.Entity[] = [];

/**
 * Build-time üretilen GLB'leri kullanarak stres testi yapar.
 * Bu yöntem runtime'da dönüştürme yapmadığı için çok daha hızlıdır.
 */
export const runBuildTimeStressTest = async (count: number = 100): Promise<void> => {
    try {
        if (!viewer) return;

        console.log(`🚀 Build-Time Stress Test Başlıyor: ${count} adet model eklenecek...`);
        const startTime = performance.now();

        // Başlangıç belleği
        const initialMem = (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0;

        // generated klasöründeki uçağı kullanıyoruz
        const modelUri = './SampleData/models/Generated/airplane_tuhaf.glb';

        for (let i = 0; i < count; i++) {
            const lon = 26.0 + Math.random() * 2.0;
            const lat = 36.0 + Math.random() * 2.0;
            const position = Cesium.Cartesian3.fromDegrees(lon, lat);

            const heading = Cesium.Math.toRadians(Math.random() * 360);
            const orientation = Cesium.Transforms.headingPitchRollQuaternion(
                position,
                new Cesium.HeadingPitchRoll(heading, 0, 0)
            );

            const entity = viewer.entities.add({
                position: position,
                orientation: orientation as any,
                model: {
                    uri: modelUri,
                    minimumPixelSize: 60,
                    maximumScale: 60,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
                }
            });
            stressTestEntities.push(entity);

            if (i % 500 === 0 && i > 0) {
                const currentHeap = (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0;
                console.log(`... ${i} model eklendi. Anlık Heap: ${currentHeap.toFixed(2)} MB`);
            }
        }

        const endTime = performance.now();
        const finalMem = (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0;
        
        const report = `
            🏁 Build-Time Test Bitti: ${count} model
            ⏱ Süre: ${((endTime - startTime) / 1000).toFixed(2)} sn
            💾 Bellek Artışı: ${(finalMem - initialMem).toFixed(2)} MB
            📈 Toplam Heap: ${finalMem.toFixed(2)} MB
        `;
        console.log(report);
        alert(report);

    } catch (error) {
        console.error("Build-Time Stress Test Hatası:", error);
    }
};

export const clearBuildTimeStressTest = (): void => {
    console.log("🧹 Temizlik başlıyor (Build-Time)...");
    stressTestEntities.forEach(e => viewer?.entities.remove(e));
    stressTestEntities = [];
    console.log("✅ Temizlik tamamlandı.");
};

export const createBuildTimeStressTestUI = (): void => {
    const panel = document.createElement('div');
    panel.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(0,0,0,0.8);
        padding: 15px;
        border-radius: 10px;
        color: white;
        z-index: 10000;
        border: 1px solid #4FC3F7;
    `;
    
    panel.innerHTML = `
        <h3 style="margin:0 0 10px 0; color:#4FC3F7;">⚡ Hızlı Stres Testi</h3>
        <p style="font-size:12px; margin-bottom:10px;">(Build-Time GLB Testi)</p>
        <button id="btnFastStress100" style="padding:5px 10px; cursor:pointer;">100</button>
        <button id="btnFastStress500" style="padding:5px 10px; cursor:pointer;">500</button>
        <button id="btnFastStress1000" style="padding:5px 10px; cursor:pointer;">1000</button>
        <button id="btnFastStress2000" style="padding:5px 10px; cursor:pointer;">2000</button>
        <button id="btnFastStress5000" style="padding:5px 10px; cursor:pointer; background:#4CAF50; color:white; border:none;">5000</button>
        <button id="btnFastStressClear" style="padding:5px 10px; cursor:pointer; background:#f44336; color:white; border:none; margin-top:5px; width:100%;">Temizle</button>
    `;
    
    document.body.appendChild(panel);
    
    document.getElementById('btnFastStress100')?.addEventListener('click', () => runBuildTimeStressTest(100));
    document.getElementById('btnFastStress500')?.addEventListener('click', () => runBuildTimeStressTest(500));
    document.getElementById('btnFastStress1000')?.addEventListener('click', () => runBuildTimeStressTest(1000));
    document.getElementById('btnFastStress2000')?.addEventListener('click', () => runBuildTimeStressTest(2000));
    document.getElementById('btnFastStress5000')?.addEventListener('click', () => runBuildTimeStressTest(5000));
    document.getElementById('btnFastStressClear')?.addEventListener('click', clearBuildTimeStressTest);
};
