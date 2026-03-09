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

        // --- AABB (Axis-Aligned Bounding Box) ÇIKARIMI ---
        // BoundingSphere yerine modelin gerçek en/boy/yükseklik değerlerini çıkar
        const R = shipPrimitive.boundingSphere.radius;
        console.log("Model Yüklendi! BoundingSphere R:", R);

        // Model'in POSITION accessor'larından min/max değerlerini topla
        let globalMin = new Cesium.Cartesian3(
          Number.POSITIVE_INFINITY,
          Number.POSITIVE_INFINITY,
          Number.POSITIVE_INFINITY,
        );
        let globalMax = new Cesium.Cartesian3(
          Number.NEGATIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
        );
        let aabbFound = false;

        try {
          const components = shipPrimitive._sceneGraph?._components;
          if (components?.nodes) {
            for (const node of components.nodes) {
              const primitivesList =
                node?.mesh?.primitives || node?.primitives || [];
              for (const prim of primitivesList) {
                const posAttr =
                  prim?.attributes?.find(
                    (a: any) =>
                      a.semantic === "POSITION" || a.name === "POSITION",
                  ) || prim?.positionAccessor;

                // Doğrudan POSITION accessor'ı bul
                let accessor: any = null;
                if (posAttr?.min && posAttr?.max) {
                  accessor = posAttr;
                } else if (prim?.attributes) {
                  // Alternatif yapı: attributes bir obje (map) olabilir
                  for (const attr of Array.isArray(prim.attributes)
                    ? prim.attributes
                    : Object.values(prim.attributes)) {
                    const a = attr as any;
                    if (
                      a &&
                      (a.semantic === "POSITION" || a.name === "POSITION") &&
                      a.min &&
                      a.max
                    ) {
                      accessor = a;
                      break;
                    }
                  }
                }

                if (accessor?.min && accessor?.max) {
                  const min = accessor.min;
                  const max = accessor.max;

                  // Cartesian3 veya düz dizi olabilir
                  const minX =
                    min.x !== undefined ? min.x : min[0] !== undefined ? min[0] : null;
                  const minY =
                    min.y !== undefined ? min.y : min[1] !== undefined ? min[1] : null;
                  const minZ =
                    min.z !== undefined ? min.z : min[2] !== undefined ? min[2] : null;
                  const maxX =
                    max.x !== undefined ? max.x : max[0] !== undefined ? max[0] : null;
                  const maxY =
                    max.y !== undefined ? max.y : max[1] !== undefined ? max[1] : null;
                  const maxZ =
                    max.z !== undefined ? max.z : max[2] !== undefined ? max[2] : null;

                  if (
                    minX !== null &&
                    minY !== null &&
                    minZ !== null &&
                    maxX !== null &&
                    maxY !== null &&
                    maxZ !== null
                  ) {
                    globalMin.x = Math.min(globalMin.x, minX);
                    globalMin.y = Math.min(globalMin.y, minY);
                    globalMin.z = Math.min(globalMin.z, minZ);
                    globalMax.x = Math.max(globalMax.x, maxX);
                    globalMax.y = Math.max(globalMax.y, maxY);
                    globalMax.z = Math.max(globalMax.z, maxZ);
                    aabbFound = true;
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn("AABB çıkarımı başarısız, R tabanlı fallback kullanılacak:", e);
        }

        // --- BOYUT HESAPLAMA ---
        // AABB bulunduysa gerçek boyutları kullan, bulunamadıysa R tabanlı tahmin
        let shipLength: number; // Y ekseni (baş-kıç)
        let shipWidth: number;  // X ekseni (iskele-sancak)
        let shipHeight: number; // Z ekseni (yükseklik)
        let centerOffsetX: number; // Modelin merkez ofseti X
        let centerOffsetY: number; // Modelin merkez ofseti Y

        if (aabbFound) {
          shipWidth = globalMax.x - globalMin.x;
          shipLength = globalMax.y - globalMin.y;
          shipHeight = globalMax.z - globalMin.z;
          centerOffsetX = (globalMax.x + globalMin.x) / 2;
          centerOffsetY = (globalMax.y + globalMin.y) / 2;

          console.log("✅ AABB Bulundu!");
          console.log(
            `   Gemi Boyutları → Uzunluk(Y): ${shipLength.toFixed(2)}m, ` +
            `Genişlik(X): ${shipWidth.toFixed(2)}m, ` +
            `Yükseklik(Z): ${shipHeight.toFixed(2)}m`,
          );
          console.log(
            `   AABB Min: (${globalMin.x.toFixed(2)}, ${globalMin.y.toFixed(2)}, ${globalMin.z.toFixed(2)})`,
          );
          console.log(
            `   AABB Max: (${globalMax.x.toFixed(2)}, ${globalMax.y.toFixed(2)}, ${globalMax.z.toFixed(2)})`,
          );
          console.log(
            `   Merkez Ofseti: (${centerOffsetX.toFixed(2)}, ${centerOffsetY.toFixed(2)})`,
          );
        } else {
          // Fallback: R tabanlı tahmin (eski davranış)
          // Gemi en/boy oranı yaklaşık 7:1 (tipik uçak gemisi)
          shipLength = R * 2.0;
          shipWidth = R * 0.8;
          shipHeight = R * 0.4;
          centerOffsetX = 0;
          centerOffsetY = 0;
          console.warn("⚠️ AABB bulunamadı, R tabanlı tahmin kullanılıyor.");
          console.log(
            `   Tahmini → Uzunluk: ${shipLength.toFixed(2)}m, ` +
            `Genişlik: ${shipWidth.toFixed(2)}m`,
          );
        }

        // --- PİST KATSAYILARI (boyut-bazlı) ---
        // Artık her eksen kendi boyutuyla oranlanıyor, küresel R yerine
        // Pist genişliği → shipWidth'e göre
        // Pist uzunluğu → shipLength'e göre
        // Yanal pozisyon → shipWidth'e göre
        // Boyuna pozisyon → shipLength'e göre

        const pistGenisligi = shipWidth * 0.13;          // Pist en genişliği
        const pistUzunlugu = shipLength * 0.60;         // Pist boyu
        const pistYanalPoz = centerOffsetX + shipWidth * 0.27;  // Pist X konumu
        const pistBoyunaMerkez = centerOffsetY - shipLength * 0.22; // Pist Y merkezi
        const cizgiKalinligi = shipLength * 0.006;       // Çizgi kalınlığı

        console.log(
          `   Pist Parametreleri → Genişlik: ${pistGenisligi.toFixed(2)}m, ` +
          `Uzunluk: ${pistUzunlugu.toFixed(2)}m, ` +
          `Yanal Konum: ${pistYanalPoz.toFixed(2)}m`,
        );

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
            new Cesium.Cartesian3(pistYanalPoz, pistBoyunaMerkez, 0.02),
          ),
          orientation: sharedOrientation,
          box: {
            dimensions: new Cesium.Cartesian3(
              pistGenisligi,
              pistUzunlugu,
              0.1,
            ),
            material: Cesium.Color.fromCssColorString("#2f3640").withAlpha(0.9),
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          },
        });

        // B) Pembe İniş Çizgisi (Pistin ön ucu)
        const inisCizgiY = pistBoyunaMerkez + pistUzunlugu * 0.5;
        viewer!.entities.add({
          name: "Pist_İnis",
          parent: shipEntity,
          position: getPositionWithOffset(
            shipEntity,
            new Cesium.Cartesian3(pistYanalPoz, inisCizgiY, 0.03),
          ),
          orientation: sharedOrientation,
          box: {
            dimensions: new Cesium.Cartesian3(pistGenisligi, cizgiKalinligi, 0.1),
            material: Cesium.Color.DEEPPINK.withAlpha(0.7),
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          },
        });

        // C) Sarı İniş/Kalkış Çizgileri (Ön ve Arka)
        const sariCizgiYPozlari = [
          pistBoyunaMerkez + pistUzunlugu * 0.5,   // Ön uç
          pistBoyunaMerkez - pistUzunlugu * 0.5,   // Arka uç
        ];
        sariCizgiYPozlari.forEach((yPos) => {
          viewer!.entities.add({
            name: "Sari_Cizgi_" + yPos.toFixed(1),
            parent: shipEntity,
            position: getPositionWithOffset(
              shipEntity,
              new Cesium.Cartesian3(pistYanalPoz, yPos, 0.03),
            ),
            orientation: sharedOrientation,
            box: {
              dimensions: new Cesium.Cartesian3(
                pistGenisligi,
                cizgiKalinligi,
                0.1,
              ),
              material: Cesium.Color.YELLOW,
              heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            },
          });
        });

        // D) Kırmızı Halkalar (Çemberler) — koridor kenarı
        const halkaYanalPoz = centerOffsetX + shipWidth * 0.7; // Sancak tarafı
        const halkaYarıcap = shipWidth * 0.1;
        const halkaYPozlari = [
          pistBoyunaMerkez + pistUzunlugu * 0.65,   // Ön
          pistBoyunaMerkez - pistUzunlugu * 0.65,   // Arka
        ];
        halkaYPozlari.forEach((yPos) => {
          viewer!.entities.add({
            name: "Kirmizi_Halka_" + yPos.toFixed(1),
            parent: shipEntity,
            position: getPositionWithOffset(
              shipEntity,
              new Cesium.Cartesian3(halkaYanalPoz, yPos, 0.05),
            ),
            orientation: sharedOrientation,
            ellipse: {
              semiMajorAxis: halkaYarıcap,
              semiMinorAxis: halkaYarıcap,
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
        const koridorGenislik = halkaYanalPoz - pistYanalPoz + halkaYarıcap;
        const koridorUzunluk =
          halkaYPozlari[0] - halkaYPozlari[1] + halkaYarıcap * 2;
        const koridorMerkezX = (pistYanalPoz + halkaYanalPoz) / 2;
        const koridorMerkezY =
          (halkaYPozlari[0] + halkaYPozlari[1]) / 2;

        viewer!.entities.add({
          name: "Ucus_Koridoru",
          parent: shipEntity,
          position: getPositionWithOffset(
            shipEntity,
            new Cesium.Cartesian3(koridorMerkezX, koridorMerkezY, 0),
          ),
          orientation: sharedOrientation,
          box: {
            dimensions: new Cesium.Cartesian3(
              koridorGenislik,
              koridorUzunluk,
              0.01,
            ),
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

