import * as Cesium from "cesium";
import { viewer } from "./harita";

/**
 * PlaneGraphics + Cesium Model'in minimumPixelSize algoritması
 * 
 * Cesium Model.js kaynak kodu (updateComputedScale, satır 2336-2378) 
 * birebir PlaneGraphics'e uyarlanmıştır.
 * 
 * Model'deki algoritma:
 *   1. BoundingSphere oluştur (merkez + yarıçap)
 *   2. camera.getPixelSize(boundingSphere) → metersPerPixel
 *   3. diameterInPixels = (2 * radius) / metersPerPixel
 *   4. diameterInPixels < minimumPixelSize ise → scale uygula
 *   5. scale = (minimumPixelSize * metersPerPixel) / (2 * initialRadius)
 * 
 * NOT: Model iç scaling'i modelMatrix'e uygular (geometri değişmez).
 *      PlaneGraphics'te geometri boyutu değiştirmek zorundayız.
 *      Bu nedenle CallbackProperty kullanıyoruz — her frame değeri okunur,
 *      geometri rebuild tetiklenmez, flickering olmaz.
 */

export const addImprovedPlane = async (): Promise<void> => {
  try {
    if (!viewer) return;

    const LONGITUDE = 29.02;
    const LATITUDE = 41.02;
    const HEIGHT_OFFSET = 1; // Arazinin hemen üstünde (CLAMP_TO_GROUND etkisi)
    const IMAGE_URL = './icons/airplane_green.png';

    // --- Resimden boyut algıla ---
    const img = new Image();
    img.src = IMAGE_URL;
    await img.decode();
    // Resmin piksel boyutları doğrudan metre olarak kullanılır
    const baseWidth = img.width;   // örn: 100px → 100m
    const baseHeight = img.height; // örn: 100px → 100m
    console.log(`Resim boyutu: ${baseWidth}x${baseHeight}px → Plane: ${baseWidth}x${baseHeight}m`);

    // --- AYARLAR ---
    //const BASE_WIDTH = 60;        // Plane genişliği (metre)
    //const BASE_HEIGHT = 60;       // Plane yüksekliği (metre) — farklı değer verilirse dikdörtgen olur
    const MIN_PIXEL_SIZE = 100;    // Minimum ekran boyutu (piksel)
    const MAX_SCALE = 200;        // Maksimum büyütme (Model.maximumScale karşılığı)- En fazla 200 kat büyütülebilir
    // initialRadius: Model'deki _initialRadius karşılığı
    // Dikdörtgen plane'in bounding sphere yarıçapı = köşegen / 2 = √(w² + h²) / 2
    // const initialRadius = Math.sqrt(BASE_WIDTH ** 2 + BASE_HEIGHT ** 2) / 2;
    const initialRadius = Math.sqrt(baseWidth ** 2 + baseHeight ** 2) / 2;

    // --- Ground Clamping: Model'deki CLAMP_TO_GROUND simülasyonu ---
    // PlaneGraphics'te heightReference yok, bu yüzden her frame
    // globe.getHeight() ile terrain yüksekliğini sorguluyoruz.
    const scratchCartographic = Cesium.Cartographic.fromDegrees(LONGITUDE, LATITUDE);
    const scratchPosition = Cesium.Cartesian3.fromDegrees(LONGITUDE, LATITUDE, HEIGHT_OFFSET);
    const boundingSphere = new Cesium.BoundingSphere(scratchPosition, initialRadius);

    const dynamicPosition = new Cesium.CallbackProperty(() => {
      const terrainHeight = viewer!.scene.globe.getHeight(scratchCartographic);
      const height = (terrainHeight ?? 0) + HEIGHT_OFFSET;
      Cesium.Cartesian3.fromDegrees(LONGITUDE, LATITUDE, height, Cesium.Ellipsoid.WGS84, scratchPosition);
      // BoundingSphere merkezini de güncelle (minimumPixelSize hesabı için)
      Cesium.Cartesian3.clone(scratchPosition, boundingSphere.center);
      return scratchPosition;
    }, false);

    // Yönelim — sabit heading/pitch/roll (pozisyon değişse de yönelim aynı kalır)
    const heading = Cesium.Math.toRadians(45);
    const pitch = Cesium.Math.toRadians(0);
    const roll = Cesium.Math.toRadians(0);
    const hpr = new Cesium.HeadingPitchRoll(heading, pitch, roll);

    const dynamicOrientation = new Cesium.CallbackProperty(() => {
      return Cesium.Transforms.headingPitchRollQuaternion(scratchPosition, hpr);
    }, false);

    // GC-friendly scratch nesnesi
    // const scratchDimensions = new Cesium.Cartesian2(BASE_WIDTH, BASE_HEIGHT);
    const scratchDimensions = new Cesium.Cartesian2(baseWidth, baseHeight);

    // --- Model'in updateComputedScale algoritması (CallbackProperty içinde) ---
    // CallbackProperty kullanıyoruz çünkü:
    //   - preRender + dimensions ataması = geometri rebuild = flickering
    //   - CallbackProperty = her frame okunur, rebuild yok, flickering yok
    const dynamicDimensions = new Cesium.CallbackProperty(() => {
      if (!viewer || !viewer.camera) {
        // scratchDimensions.x = BASE_WIDTH;
        // scratchDimensions.y = BASE_HEIGHT;
        scratchDimensions.x = baseWidth;
        scratchDimensions.y = baseHeight;
        return scratchDimensions;
      }

      const camera = viewer.camera;
      const canvas = viewer.scene.canvas;

      // Nesnenin ekranın tamamından büyük olmasını engellemek için kullanılacak
      const maxPixelSize = Math.max(canvas.width, canvas.height);

      // Model.js satır 2357-2358: scaleInPixels fonksiyonu
      // camera.getPixelSize(boundingSphere, drawingBufferWidth, drawingBufferHeight)
      // Bu nesnenin bulunduğu mesafede, ekrandaki 1 piksel gerçekte kaç metreye karşılık geliyor
      /**
       * Kamera 500m uzakta   → metersPerPixel ≈ 0.3   (1 piksel = 0.3 metre)
       * Kamera 5000m uzakta  → metersPerPixel ≈ 3.0   (1 piksel = 3 metre)
       * Kamera 50000m uzakta → metersPerPixel ≈ 30.0  (1 piksel = 30 metre)
       */
      const metersPerPixel = camera.getPixelSize(
        boundingSphere,
        canvas.width,
        canvas.height
      );

      // Model.js satır 2361-2365: diameterInPixels hesabı
      // 1 metre ekranda kaç piksel
      const pixelsPerMeter = 1.0 / metersPerPixel;
      // pixelsPerMeter × çap (metre) = nesnenin ekrandaki piksel boyutu.
      const diameterInPixels = Math.min(
        pixelsPerMeter * (2.0 * initialRadius),
        maxPixelSize // nesnenin ekrandan taşmasını engeller.
      );

      // Model.js satır 2367-2372: scale hesabı
      let scale = 1.0;
      // istenen metre / mevcut metre
      if (diameterInPixels < MIN_PIXEL_SIZE) {
        scale = (MIN_PIXEL_SIZE * metersPerPixel) / (2.0 * initialRadius);
      }

      // Model.js satır 2375-2377: maximumScale sınırı
      const finalScale = Math.min(scale, MAX_SCALE);

      // Boyutu hesapla ve scratch nesnesine yaz (GC-friendly)
      // Genişlik ve yükseklik ayrı ayrı ölçeklenir → en-boy oranı korunur
      // scratchDimensions.x = BASE_WIDTH * finalScale;
      // scratchDimensions.y = BASE_HEIGHT * finalScale;
      scratchDimensions.x = baseWidth * finalScale;
      scratchDimensions.y = baseHeight * finalScale;
      return scratchDimensions;
    }, false);

    const planeEntity = viewer.entities.add({
      position: dynamicPosition as any,
      orientation: dynamicOrientation as any,
      plane: {
        plane: new Cesium.Plane(Cesium.Cartesian3.UNIT_Z, 0.0),
        dimensions: dynamicDimensions as any,
        material: new Cesium.ImageMaterialProperty({
          image: IMAGE_URL,
          transparent: true,
        }),
      },
    });

    console.log("ImprovedPlane eklendi (Model algoritması):", planeEntity);
    //viewer.trackedEntity = planeEntity;

  } catch (error) {
    console.error("ImprovedPlane hata:", error);
  }
};
