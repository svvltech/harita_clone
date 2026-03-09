import * as Cesium from "cesium";
import { viewer } from "./harita";

/**
 * Basit PlaneGraphics ile PNG gösterimi.
 * GLB dönüşümü yok, minimumPixelSize yok — en sade hali.
 */
export const addPlane = (): void => {
  try {
    if (!viewer) return;

    const position = Cesium.Cartesian3.fromDegrees(29.01, 41.02);

    // Yönelim
    const heading = Cesium.Math.toRadians(45);
    const pitch = Cesium.Math.toRadians(0);
    const roll = Cesium.Math.toRadians(0);
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(
      position,
      new Cesium.HeadingPitchRoll(heading, pitch, roll)
    );

    const planeEntity = viewer.entities.add({
      position: position,
      orientation: orientation as any,
      plane: {
        plane: new Cesium.Plane(Cesium.Cartesian3.UNIT_Z, 0.0),
        dimensions: new Cesium.Cartesian2(100, 100),
        material: new Cesium.ImageMaterialProperty({
          image: './icons/airplane_blue.png',
          transparent: true, 
        }),
      },
    });

    console.log("Plane eklendi:", planeEntity);


  } catch (error) {
    console.error("Plane hata:", error);
  }
};
