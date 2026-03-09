
///////////////////////////////////////////////////////////////////////////


import * as Cesium from "cesium";
import { viewer } from "../harita";

// --- PERFORMANS İÇİN ORTAK (SCRATCH) DEĞİŞKENLER ---
const scratchPos = new Cesium.Cartesian3();
const scratchOri = new Cesium.Quaternion();
const scratchMat3 = new Cesium.Matrix3();
const scratchMat4 = new Cesium.Matrix4();
const scratchRawOri = new Cesium.Quaternion();
const lastValidOri = new Cesium.Quaternion();
let hasValidOri = false;

/**
 * Yardımcı Fonksiyon: Gemiye göre verilen yerel ofset değerini dünya koordinatına çevirir.
 */
const getPositionWithOffset = (
  shipEntity: Cesium.Entity,
  offset: Cesium.Cartesian3,
) => {
  return new Cesium.CallbackPositionProperty((time, result) => {
    const pos = shipEntity.position?.getValue(time, scratchPos);
    const ori = shipEntity.orientation?.getValue(time, scratchOri);
    if (!pos || !ori) return undefined;

    const transform = Cesium.Matrix4.fromRotationTranslation(
      Cesium.Matrix3.fromQuaternion(ori, scratchMat3),
      pos,
      scratchMat4,
    );
    return Cesium.Matrix4.multiplyByPoint(
      transform,
      offset,
      result || new Cesium.Cartesian3(),
    );
  }, false);
};

export const addAircraftCarrier = (): void => {
  try {
    if (!viewer) return;

    // --- HAREKET VE ZAMAN AYARLARI ---
    const start = Cesium.JulianDate.fromDate(new Date());
    const stop = Cesium.JulianDate.addSeconds(
      start,
      60,
      new Cesium.JulianDate(),
    );

    viewer.clock.startTime = start.clone();
    viewer.clock.stopTime = stop.clone();
    viewer.clock.currentTime = start.clone();
    viewer.clock.clockRange = Cesium.ClockRange.CLAMPED; // Bitince dursun
    viewer.clock.multiplier = 1;
    viewer.clock.shouldAnimate = true;

    // --- ROTA VE YÖNELİM AYARLARI ---
    const routePosition = new Cesium.SampledPositionProperty();
    routePosition.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;

    routePosition.addSample(
      start,
      Cesium.Cartesian3.fromDegrees(28.99, 40.99, 2),
    );
    routePosition.addSample(stop, Cesium.Cartesian3.fromDegrees(29.0, 41.0, 2));

    const rawOrientation = new Cesium.VelocityOrientationProperty(
      routePosition,
    );
    const rotationOffset = Cesium.Quaternion.fromAxisAngle(
      Cesium.Cartesian3.UNIT_Z,
      Cesium.Math.toRadians(90),
    );

    const correctedOrientation = new Cesium.CallbackProperty((time, result) => {
      const ori = rawOrientation.getValue(time, scratchRawOri);
      if (ori) {
        Cesium.Quaternion.clone(ori, lastValidOri);
        hasValidOri = true;
      }
      if (!hasValidOri) return undefined;

      return Cesium.Quaternion.multiply(
        lastValidOri,
        rotationOffset,
        result || new Cesium.Quaternion(),
      );
    }, false);

    // --- 1. ANA GEMİ ENTITY'SİNİ OLUŞTURMA ---
    const shipEntity = viewer.entities.add({
      name: "Uçak Gemisi",
      position: routePosition,
      orientation: correctedOrientation,
      model: {
        uri: "./SampleData/models/AircraftCarrier/tcg_anadolul-400_low_poly.glb",
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        scale: 1.0,
      },
    });

    viewer.trackedEntity = shipEntity;

    // --- 2. DİNAMİK MODEL ÖLÇÜMÜ VE PİST YERLEŞİMİ ---

    // Modelin arka planda (primitive olarak) yüklenmesini bekleyen dinleyici
    const removeListener = viewer.scene.postRender.addEventListener(() => {
      let shipPrimitive: any = null;

      // Sahnedeki primitifleri tara ve gemimize ait olanı bul
      const primitives = viewer!.scene.primitives;
      for (let i = 0; i < primitives.length; i++) {
        const prim = primitives.get(i);
        if (prim.id === shipEntity) {
          shipPrimitive = prim;
          break;
        }
      }

      // Model bulunduysa ve çizilmeye hazırsa:
      if (shipPrimitive && shipPrimitive.ready) {
        // Dinleyiciyi hemen kaldır ki sürekli çalışıp performansı düşürmesin
        removeListener();

        // Modelin bounding sphere (çevreleyen küre) yarıçapını al
        const R = shipPrimitive.boundingSphere.radius;
        console.log("Model Yüklendi! Dinamik Referans Yarıçapı (R):", R);

        const M = shipPrimitive.boundingSphere.center;
        console.log("Merkez Noktası (M):", M);

        console.log("shipPrimitive yapısı :", shipPrimitive);

        const components = shipPrimitive._sceneGraph?._components;
        if (components) {
          console.log("Scene components:", components);
          // components.nodes → her node altında mesh → primitives → POSITION accessor → min/max
        }

        // console.log("shipPrimitive._sceneGraph._components :", shipPrimitive._sceneGraph._components);

        // Not: Mevcut modelinde R yaklaşık 7.7 değerindedir.
        // Eski sabit sayılarını (4.3, 11, -12 vb.) bu R değerine oranlayarak generic katsayılar elde ettik.

        // ORTAK YÖNELİM CALLBACK'İ
        const sharedOrientation = new Cesium.CallbackProperty(
          (time) => shipEntity.orientation?.getValue(time),
          false,
        );

        // A) Ana Pist Zemini (Asfalt)
        viewer!.entities.add({
          name: "Pist_Zemini",
          parent: shipEntity,
          position: getPositionWithOffset(
            shipEntity,
            new Cesium.Cartesian3(R * 0.55, -R * 0.58, 0.02),
          ),
          orientation: sharedOrientation,
          box: {
            dimensions: new Cesium.Cartesian3(R * 0.13, R * 1.23, 0.1),
            material: Cesium.Color.fromCssColorString("#2f3640").withAlpha(0.9),
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          },
        });

        // B) Pembe İniş Çizgisi
        viewer!.entities.add({
          name: "Pist_İnis",
          parent: shipEntity,
          position: getPositionWithOffset(
            shipEntity,
            new Cesium.Cartesian3(R * 0.55, R * 0.04, 0.03),
          ),
          orientation: sharedOrientation,
          box: {
            dimensions: new Cesium.Cartesian3(R * 0.13, R * 0.013, 0.1),
            material: Cesium.Color.DEEPPINK.withAlpha(0.7),
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          },
        });

        // C) Sarı İniş/Kalkış Çizgileri (Ön ve Arka)
        const sariCizgiYOranlari = [0.04, -1.2]; // Eski 0.3 ve -9.2
        sariCizgiYOranlari.forEach((yRatio) => {
          viewer!.entities.add({
            name: "Sari_Cizgi_" + yRatio,
            parent: shipEntity,
            position: getPositionWithOffset(
              shipEntity,
              new Cesium.Cartesian3(R * 0.55, R * yRatio, 0.03),
            ),
            orientation: sharedOrientation,
            box: {
              dimensions: new Cesium.Cartesian3(R * 0.13, R * 0.013, 0.1),
              material: Cesium.Color.YELLOW,
              heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            },
          });
        });

        // D) Kırmızı Halkalar (Çemberler)
        const cemberYOranlari = [0.52, -1.55]; // Eski 4 ve -12
        cemberYOranlari.forEach((yRatio) => {
          viewer!.entities.add({
            name: "Kirmizi_Halka_" + yRatio,
            parent: shipEntity,
            position: getPositionWithOffset(
              shipEntity,
              new Cesium.Cartesian3(R * 1.42, R * yRatio, 0.05),
            ),
            orientation: sharedOrientation,
            ellipse: {
              semiMajorAxis: R * 0.2, // Yarıçaplar da modele göre ölçekleniyor
              semiMinorAxis: R * 0.2,
              material: Cesium.Color.RED.withAlpha(0.5),
              outline: true,
              outlineColor: Cesium.Color.RED,
              outlineWidth: 4,
              height: 2,
              heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            },
          });
        });

        // E) Uçuş Pist Koridoru (Mavi Dikdörtgen)
        viewer!.entities.add({
          name: "Ucus_Koridoru",
          parent: shipEntity,
          // Merkez noktası: Eski (7.65, -4) -> R cinsinden oranlandı
          position: getPositionWithOffset(
            shipEntity,
            new Cesium.Cartesian3(R * 1.0, -R * 0.52, 0),
          ),
          orientation: sharedOrientation,
          box: {
            // Boyutlar: Eski X(6.7) ve Y(16.0) -> R cinsinden oranlandı
            dimensions: new Cesium.Cartesian3(R * 0.87, R * 2.07, 0.01),
            material: Cesium.Color.TRANSPARENT,
            outline: true,
            outlineColor: Cesium.Color.BLUE,
            outlineWidth: 5,
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          },
        });
      }
    });
  } catch (error) {
    console.error("Hata:", error);
  }
};
