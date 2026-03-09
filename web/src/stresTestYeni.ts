import * as Cesium from "cesium";
import { viewer } from "./harita";
import { createTexturedQuadGlb } from "./imageToGlbManager";

let stressTestEntities: Cesium.Entity[] = [];
let stressTestUrls: string[] = [];

/**
 * imageToGlbManager'ı stres testine sokar.
 * Gerçek hayat şartlarını simüle etmek için her seferinde fetch ve dönüşüm yapılır.
 */
export const runImageToGlbStressTest = async (count: number = 100): Promise<void> => {
    try {
        if (!viewer) return;

        console.log(`🚀 Stress Test Başlıyor: ${count} adet model oluşturulacak...`);
        const startTime = performance.now();

        // Başlangıç belleği
        const initialMem = (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0;

        for (let i = 0; i < count; i++) {
            // Rastgele pozisyonlar (Türkiye civarı)
            const lon = 26.0 + Math.random() * 14.0;
            const lat = 36.0 + Math.random() * 6.0;
            const position = Cesium.Cartesian3.fromDegrees(lon, lat);

            const heading = Cesium.Math.toRadians(Math.random() * 360);
            const orientation = Cesium.Transforms.headingPitchRollQuaternion(
                position,
                new Cesium.HeadingPitchRoll(heading, 0, 0)
            );

            // Kullanıcının isteği üzerine: Her seferinde fetch ve dönüşüm yapılır (no-cache simülasyonu)
            const modelUri = await createTexturedQuadGlb('./icons/airplane_tuhaf.png', 50);
            stressTestUrls.push(modelUri);

            const entity = viewer.entities.add({
                position: position,
                orientation: orientation as any,
                model: {
                    uri: modelUri,
                    minimumPixelSize: 30,
                    maximumScale: 60,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
                }
            });
            stressTestEntities.push(entity);

            if (i % 100 === 0 && i > 0) {
                const currentHeap = (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0;
                console.log(`... ${i} model eklendi. Anlık Heap: ${currentHeap.toFixed(2)} MB`);
            }
        }

        const endTime = performance.now();
        const finalMem = (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0;
        
        const report = `
            🏁 Test Bitti: ${count} model
            ⏱ Süre: ${((endTime - startTime) / 1000).toFixed(2)} sn
            💾 Bellek Artışı: ${(finalMem - initialMem).toFixed(2)} MB
            📈 Toplam Heap: ${finalMem.toFixed(2)} MB
        `;
        console.log(report);
        alert(report);

    } catch (error) {
        console.error("Stress Test Hatası:", error);
    }
};

/**
 * Test modellerini temizler ve Blob URL'lerini iptal eder.
 */
export const clearStressTest = (): void => {
    console.log("🧹 Temizlik başlıyor...");
    stressTestEntities.forEach(e => viewer?.entities.remove(e));
    stressTestUrls.forEach(url => URL.revokeObjectURL(url));
    
    stressTestEntities = [];
    stressTestUrls = [];
    console.log("✅ Temizlik tamamlandı. Blob URL'leri iptal edildi.");
};

/**
 * UI Panelini oluşturur
 */
export const createStressTestUI = (): void => {
    const panel = document.createElement('div');
    panel.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: rgba(0,0,0,0.8);
        padding: 15px;
        border-radius: 10px;
        color: white;
        z-index: 10000;
        border: 1px solid #444;
    `;
    
    panel.innerHTML = `
        <h3 style="margin:0 0 10px 0; color:#4FC3F7;">🧠 Bellek/Stres Testi</h3>
        <p style="font-size:12px; margin-bottom:10px;">(PNG -> GLB Bellek Testi)</p>
        <button id="btnStress100" style="padding:5px 10px; cursor:pointer;">100</button>
        <button id="btnStress500" style="padding:5px 10px; cursor:pointer;">500</button>
        <button id="btnStress1000" style="padding:5px 10px; cursor:pointer;">1000</button>
        <button id="btnStress2000" style="padding:5px 10px; cursor:pointer;">2000</button>
        <button id="btnStressClear" style="padding:5px 10px; cursor:pointer; background:#f44336; color:white; border:none; margin-top:5px; width:100%;">Temizle & Revoke</button>
    `;
    
    document.body.appendChild(panel);
    
    document.getElementById('btnStress100')?.addEventListener('click', () => runImageToGlbStressTest(100));
    document.getElementById('btnStress500')?.addEventListener('click', () => runImageToGlbStressTest(500));
    document.getElementById('btnStress1000')?.addEventListener('click', () => runImageToGlbStressTest(1000));
    document.getElementById('btnStress2000')?.addEventListener('click', () => runImageToGlbStressTest(2000));
    document.getElementById('btnStressClear')?.addEventListener('click', clearStressTest);
};
