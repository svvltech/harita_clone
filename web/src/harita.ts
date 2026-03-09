import * as Cesium from "cesium";

/**
 * Manager modülleri viewer'ı bu dosyadan import eder.
 * index.ts'de viewer oluşturulduktan sonra setViewer() çağrılır.
 */
export let viewer: Cesium.Viewer | null = null;

export function setViewer(v: Cesium.Viewer): void {
    viewer = v;
}
