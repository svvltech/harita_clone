import * as Cesium from "cesium";
import { viewer } from "./harita";

/**
 * Texture pikselleşme problemini ispat eder.
 * 
 * Ekranda canlı HUD overlay gösterir:
 *   - Kamera mesafesi
 *   - Modelin doğal ekran boyutu (piksel)
 *   - minimumPixelSize tarafından zorlanan boyut
 *   - Büyütme oranı (scale)
 *   - Texture gerilme durumu (⚠️ veya ✅)
 * 
 * Kamerayı uzaklaştırıp ekran görüntüsü alarak ispatlayabilirsiniz.
 */

export const solveSilhouetteProblem = (): void => {
  try {
    if (!viewer) return;

    const MODEL_URI = './SampleData/models/Bayraktar/bayraktar_mius.glb';
    const heading = Cesium.Math.toRadians(45);
    const hpr = new Cesium.HeadingPitchRoll(heading, 0, 0);
    const MODEL_RADIUS = 10; // Modelin tahmini yarıçapı (metre)

    // --- 3 Model ---
    const configs = [
      { label: 'Model A', minPixel: 30,  maxScale: 50,  color: Cesium.Color.GREEN,  pos: Cesium.Cartesian3.fromDegrees(29.02, 41.02, 10) },
      { label: 'Model B', minPixel: 100, maxScale: 200, color: Cesium.Color.YELLOW, pos: Cesium.Cartesian3.fromDegrees(29.04, 41.02, 10) },
      { label: 'Model C', minPixel: 200, maxScale: 400, color: Cesium.Color.RED,    pos: Cesium.Cartesian3.fromDegrees(29.06, 41.02, 10) },
    ];

    configs.forEach(c => {
      viewer!.entities.add({
        name: `${c.label} (minPixel: ${c.minPixel})`,
        position: c.pos,
        orientation: Cesium.Transforms.headingPitchRollQuaternion(c.pos, hpr) as any,
        model: {
          uri: MODEL_URI,
          minimumPixelSize: c.minPixel,
          maximumScale: c.maxScale,
          shadows: Cesium.ShadowMode.DISABLED,
          //silhouetteColor: c.color,
          //silhouetteSize: 1.0,
          scale: 0.10,
        },
      });
    });

    // --- HUD Overlay oluştur ---
    const hud = document.createElement('div');
    hud.id = 'texture-pixelation-hud';
    hud.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 12px;
      padding: 12px 16px;
      border-radius: 8px;
      z-index: 9999;
      min-width: 420px;
      border: 1px solid #444;
      pointer-events: none;
    `;
    document.body.appendChild(hud);

    // --- Her saniye güncelle ---
    let lastLogTime = 0;
    viewer.scene.preRender.addEventListener(() => {
      const now = Date.now();
      if (now - lastLogTime < 500) return; // 500ms'de 1 güncelleme
      lastLogTime = now;

      const camera = viewer!.camera;
      const canvas = viewer!.scene.canvas;

      let hudContent = `<div style="font-size:14px;font-weight:bold;margin-bottom:8px;color:#4FC3F7;">
        📊 Texture Pikselleşme Analizi
      </div>`;
      hudContent += `<table style="width:100%;border-collapse:collapse;">`;
      hudContent += `<tr style="color:#aaa;border-bottom:1px solid #555;">
        <th style="text-align:left;padding:4px;">Model</th>
        <th style="text-align:right;padding:4px;">Mesafe</th>
        <th style="text-align:right;padding:4px;">Doğal</th>
        <th style="text-align:right;padding:4px;">MinPx</th>
        <th style="text-align:right;padding:4px;">Scale</th>
        <th style="text-align:center;padding:4px;">Durum</th>
      </tr>`;

      configs.forEach(m => {
        const distance = Cesium.Cartesian3.distance(camera.position, m.pos);
        const bs = new Cesium.BoundingSphere(m.pos, MODEL_RADIUS);
        const metersPerPixel = camera.getPixelSize(bs, canvas.width, canvas.height);
        const naturalDiameter = (2 * MODEL_RADIUS) / metersPerPixel;
        const isScaled = naturalDiameter < m.minPixel;
        const scaleRatio = isScaled ? m.minPixel / naturalDiameter : 1.0;

        let status: string;
        let statusColor: string;
        if (scaleRatio <= 1.0) {
          status = '✅ Normal';
          statusColor = '#4CAF50';
        } else if (scaleRatio <= 2.0) {
          status = '⚠️ Hafif';
          statusColor = '#FFC107';
        } else {
          status = '🔴 Piksel!';
          statusColor = '#F44336';
        }

        // Silhouette rengine göre label rengi
        const labelColor = m.color === Cesium.Color.GREEN ? '#4CAF50'
          : m.color === Cesium.Color.YELLOW ? '#FFC107' : '#F44336';

        hudContent += `<tr style="border-bottom:1px solid #333;">
          <td style="padding:4px;color:${labelColor};font-weight:bold;">${m.label}</td>
          <td style="text-align:right;padding:4px;">${(distance/1000).toFixed(1)}km</td>
          <td style="text-align:right;padding:4px;">${naturalDiameter.toFixed(0)}px</td>
          <td style="text-align:right;padding:4px;">${m.minPixel}px</td>
          <td style="text-align:right;padding:4px;font-weight:bold;">${scaleRatio.toFixed(1)}x</td>
          <td style="text-align:center;padding:4px;color:${statusColor};">${status}</td>
        </tr>`;
      });

      hudContent += `</table>`;
      hudContent += `<div style="margin-top:8px;font-size:10px;color:#888;">
        Scale > 1.0 = texture gerilir → pikselleşme başlar<br>
        Scale > 2.0 = belirgin pikselleşme
      </div>`;

      hud.innerHTML = hudContent;
    });

    console.log("Texture pikselleşme HUD overlay eklendi. Sağ üstte görünür.");

  } catch (error) {
    console.error("SilhouetteProblem hata:", error);
  }
};
