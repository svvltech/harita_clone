import * as Cesium from "cesium";
import { viewer } from "./harita";

/**
 * PNG'yi bellekte .glb modeline çevirir.
 * Harici araç veya dosya gerektirmez.
 */
export async function createTexturedQuadGlb(imageUrl: string, sizeMeters: number): Promise<string> {
  // 1. PNG/JPG'yi fetch ile yükle
  const imgResponse = await fetch(imageUrl);
  const imgArrayBuffer = await imgResponse.arrayBuffer();
  const imgBytes = new Uint8Array(imgArrayBuffer);

  // 2. Resmin en-boy oranını algıla
  const imgBlob = new Blob([imgBytes]);
  const bitmap = await createImageBitmap(imgBlob);
  const imgWidth = bitmap.width;
  const imgHeight = bitmap.height;
  bitmap.close(); // Belleği serbest bırak

  // En uzun kenar = sizeMeters, kısa kenar oranla hesaplanır
  let halfW: number, halfH: number;
  if (imgWidth >= imgHeight) {
    halfW = sizeMeters / 2;
    halfH = (sizeMeters * (imgHeight / imgWidth)) / 2;
  } else {
    halfH = sizeMeters / 2;
    halfW = (sizeMeters * (imgWidth / imgHeight)) / 2;
  }
  console.log(`Resim: ${imgWidth}x${imgHeight} → Geometri: ${halfW*2}x${halfH*2}m`);

  // 3. Geometri verileri — orana göre dikdörtgen (4 köşe, 2 üçgen)
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const positions = new Float32Array([
    -halfW, 0, -halfH,
     halfW, 0, -halfH,
     halfW, 0,  halfH,
    -halfW, 0,  halfH,
  ]);
  const normals = new Float32Array([
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
  ]);
  const texcoords = new Float32Array([
    0, 0,  1, 0,  1, 1,  0, 1,
  ]);

  // 3. Binary buffer oluştur (geometri + resim)
  const geomSize = 12 + 48 + 48 + 32; // 140 bytes
  const geomPadding = (4 - (geomSize % 4)) % 4;
  const imgOffset = geomSize + geomPadding;
  const totalBinSize = imgOffset + imgBytes.length;
  const binPadding = (4 - (totalBinSize % 4)) % 4;
  const paddedBinSize = totalBinSize + binPadding;

  const binBuffer = new ArrayBuffer(paddedBinSize);
  const binView = new Uint8Array(binBuffer);

  let offset = 0;
  binView.set(new Uint8Array(indices.buffer), offset); offset += 12;
  binView.set(new Uint8Array(positions.buffer), offset); offset += 48;
  binView.set(new Uint8Array(normals.buffer), offset); offset += 48;
  binView.set(new Uint8Array(texcoords.buffer), offset); offset += 32;
  offset += geomPadding;
  binView.set(imgBytes, offset);

  // 4. glTF JSON yapısı
  const mimeType = imageUrl.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const gltf = {
    asset: { version: "2.0", generator: "imageToGlbManager" },
    extensionsUsed: ["KHR_materials_unlit"],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 1, NORMAL: 2, TEXCOORD_0: 3 },
        indices: 0,
        material: 0,
      }],
    }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      extensions: { KHR_materials_unlit: {} },
      alphaMode: "BLEND",
      doubleSided: true,
    }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    images: [{ bufferView: 4, mimeType: mimeType }],
    accessors: [
      { bufferView: 0, componentType: 5123, count: 6, type: "SCALAR", max: [3], min: [0] },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC3",
        max: [halfW, 0, halfH], min: [-halfW, 0, -halfH] },
      { bufferView: 2, componentType: 5126, count: 4, type: "VEC3",
        max: [0, 1, 0], min: [0, 1, 0] },
      { bufferView: 3, componentType: 5126, count: 4, type: "VEC2",
        max: [1, 1], min: [0, 0] },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 12, target: 34963 },
      { buffer: 0, byteOffset: 12, byteLength: 48, target: 34962 },
      { buffer: 0, byteOffset: 60, byteLength: 48, target: 34962 },
      { buffer: 0, byteOffset: 108, byteLength: 32, target: 34962 },
      { buffer: 0, byteOffset: imgOffset, byteLength: imgBytes.length },
    ],
    buffers: [{ byteLength: paddedBinSize }],
  };

  // 5. GLB binary oluştur
  const jsonStr = JSON.stringify(gltf);
  const jsonPadding = (4 - (jsonStr.length % 4)) % 4;
  const paddedJson = jsonStr + ' '.repeat(jsonPadding);
  const jsonEncoder = new TextEncoder();
  const jsonBytes = jsonEncoder.encode(paddedJson);

  const totalGlbSize = 12 + 8 + jsonBytes.length + 8 + paddedBinSize;
  const glbBuffer = new ArrayBuffer(totalGlbSize);
  const glbDataView = new DataView(glbBuffer);
  const glbBytes = new Uint8Array(glbBuffer);

  let glbOffset = 0;

  // Header
  glbDataView.setUint32(glbOffset, 0x46546C67, true); glbOffset += 4; // "glTF"
  glbDataView.setUint32(glbOffset, 2, true); glbOffset += 4;          // version
  glbDataView.setUint32(glbOffset, totalGlbSize, true); glbOffset += 4;

  // JSON chunk
  glbDataView.setUint32(glbOffset, jsonBytes.length, true); glbOffset += 4;
  glbDataView.setUint32(glbOffset, 0x4E4F534A, true); glbOffset += 4; // "JSON"
  glbBytes.set(jsonBytes, glbOffset); glbOffset += jsonBytes.length;

  // BIN chunk
  glbDataView.setUint32(glbOffset, paddedBinSize, true); glbOffset += 4;
  glbDataView.setUint32(glbOffset, 0x004E4942, true); glbOffset += 4; // "BIN\0"
  glbBytes.set(binView, glbOffset);

  // 6. Blob URL döndür
  const glbBlob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
  return URL.createObjectURL(glbBlob);
}

// ===== ANA FONKSİYON =====

export const addImageAsModel = async (): Promise<void> => {
  try {
    if (!viewer) return;

    const position = Cesium.Cartesian3.fromDegrees(29.02, 41.01); // ya yükseklik ve ya da clamp to ground kullan

    // Yönelim
    const heading = Cesium.Math.toRadians(45);
    const pitch = Cesium.Math.toRadians(0);
    const roll = Cesium.Math.toRadians(0);
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(
      position,
      new Cesium.HeadingPitchRoll(heading, pitch, roll)
    );

    // PNG'den bellekte .glb modeli oluştur
    const modelUri = await createTexturedQuadGlb('./icons/airplane.png', 50);

    const planeEntity = viewer.entities.add({
      position: position,
      orientation: orientation as any,
      model: {
        uri: modelUri,
        minimumPixelSize: 100,
        maximumScale: 200,
        shadows: Cesium.ShadowMode.DISABLED,  // Gölge kapalı
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, // ya yükseklik ve ya da clamp to ground kullan
      },
    });
    console.log("Model (PNG→GLB) eklendi:", planeEntity);

    // Depth test kapalı → model asla arazinin altında kalmaz
    viewer.scene.globe.depthTestAgainstTerrain = false;

    //viewer.trackedEntity = planeEntity;

  } catch (error) {
    console.error("Hata:", error);
  }
};
