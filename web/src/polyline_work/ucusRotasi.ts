import * as Cesium from 'cesium';
import { ArrowEdgeMaterialProperty1,ArrowEdgeMaterialProperty2, ArrowEdgeMaterialPropertyIlk } from './shaders';
import { viewer } from "../harita";

export const ucusRotasiEkle1 = (): void => {
  try {
    if (!viewer) return;

    // 2. Materyal parametrelerini hazırlıyoruz
    const okRengi = Cesium.Color.RED;

    // dashColor bir CallbackProperty bekliyor. 
    // İleride buraya zamana bağlı bir renk değişimi (yanıp sönme vb.) ekleyebilirsin.
    // Şimdilik shader kodundaki varsayılan mor/pembe tonunu sabit olarak döndürüyoruz.
    const çizgiRengi = new Cesium.CallbackProperty(() => {
        return Cesium.Color.fromBytes(239, 12, 249, 255);
    }, false); // false = değerin her karede sürekli hesaplanmasına gerek yok (sabit)

    // 3. Custom materyalimizi örnekliyoruz
    //const ucusRotasiMateryali = new ArrowEdgeMaterialProperty(okRengi, çizgiRengi);
    const routeStartPoint = Cesium.Cartesian3.fromDegrees(28.8144, 40.9769, 1000.0); 

    const ucusRotasiMateryali = new ArrowEdgeMaterialProperty1(
        okRengi,
        çizgiRengi,
        viewer.scene,      // Eklenen parametre
        routeStartPoint    // Eklenen parametre
    );

    // 4. Uçuş rotası için 3D koordinatlar (Boylam, Enlem, İrtifa-Metre)
    // Uçak yörüngesini simüle etmek için giderek artan bir irtifa kullanıyoruz.
    const rotaKoordinatlari = Cesium.Cartesian3.fromDegreesArrayHeights([
        28.8144, 40.9769, 1000.0,  // Kalkış sonrası tırmanış
        29.0000, 41.0000, 3500.0,  // Ara irtifa
        29.5000, 40.8000, 8000.0,  // Seyir irtifasına yaklaşım
       
        30.0000, 40.5000, 10000.0  // Seyir
    ]);


    // 5. Entity'i (Çizgiyi) haritaya ekliyoruz
    const ucusRotasi = viewer.entities.add({
        name: 'Örnek Uçuş Rotası',
        polyline: {
            positions: rotaKoordinatlari,
            // Okların içerideki detaylarının (V şekli, gövde vb.) net görünmesi için 
            // çizgi kalınlığını biraz yüksek tutmak iyi bir pratiktir.
            width: 12, 
            material: ucusRotasiMateryali,
            // Uçuş rotası olduğu için arazinin üzerine yapışmasın, havada kalsın:
            clampToGround: false 
        }
    });

    viewer.zoomTo(ucusRotasi);

    console.log("ucusRotasi eklendi:", ucusRotasi);


  } catch (error) {
    console.error("ucusRotasi hata:", error);
  }
};


export const ucusRotasiEkle2 = (): void => {
  try {
    if (!viewer) return;

    // 2. Materyal parametrelerini hazırlıyoruz
    const okRengi = Cesium.Color.WHITE;

    // dashColor bir CallbackProperty bekliyor. 
    // İleride buraya zamana bağlı bir renk değişimi (yanıp sönme vb.) ekleyebilirsin.
    // Şimdilik shader kodundaki varsayılan mor/pembe tonunu sabit olarak döndürüyoruz.
    const çizgiRengi = new Cesium.CallbackProperty(() => {
        return Cesium.Color.fromBytes(239, 12, 249, 255);
    }, false); // false = değerin her karede sürekli hesaplanmasına gerek yok (sabit)


    // 4. Uçuş rotası için 3D koordinatlar (Boylam, Enlem, İrtifa-Metre)
    // Uçak yörüngesini simüle etmek için giderek artan bir irtifa kullanıyoruz.
    const kayma = 0.1;
    const rotaKoordinatlari = Cesium.Cartesian3.fromDegreesArrayHeights([
        28.8144, 40.9769 + kayma, 1000.0,  // Kalkış sonrası tırmanış
        29.0000, 41.0000 + kayma, 3500.0,  // Ara irtifa
        29.5000, 40.8000 + kayma, 8000.0,  // Seyir irtifasına yaklaşım
        30.0000, 40.5000 + kayma, 10000.0  // Seyir
    ]);

    // Çizginin koordinat dizisi elinde var: rotaKoordinatlari
    let gercekUzunlukMetre = 0;
    for (let i = 0; i < rotaKoordinatlari.length - 1; i++) {
        gercekUzunlukMetre += Cesium.Cartesian3.distance(rotaKoordinatlari[i], rotaKoordinatlari[i + 1]);
    }
    const ortaNokta = rotaKoordinatlari[Math.floor(rotaKoordinatlari.length / 2)];

    // 3. Custom materyalimizi örnekliyoruz
    const ucusRotasiMateryali = new ArrowEdgeMaterialProperty2(
      okRengi, çizgiRengi,viewer.scene, gercekUzunlukMetre);

    // 5. Entity'i (Çizgiyi) haritaya ekliyoruz
    const ucusRotasi = viewer.entities.add({
        name: 'Örnek Uçuş Rotası',
        polyline: {
            positions: rotaKoordinatlari,
            // Okların içerideki detaylarının (V şekli, gövde vb.) net görünmesi için 
            // çizgi kalınlığını biraz yüksek tutmak iyi bir pratiktir.
            width: 12, 
            material: ucusRotasiMateryali,
            // Uçuş rotası olduğu için arazinin üzerine yapışmasın, havada kalsın:
            clampToGround: false 
        }
        
    });

    viewer.zoomTo(ucusRotasi);

    console.log("ucusRotasi eklendi:", ucusRotasi);


  } catch (error) {
    console.error("ucusRotasi hata:", error);
  }
};

export const ucusRotasiEkleıllk = (): void => {
  try {
    if (!viewer) return;

    // 2. Materyal parametrelerini hazırlıyoruz
    const okRengi = Cesium.Color.WHITE;

    // dashColor bir CallbackProperty bekliyor. 
    // İleride buraya zamana bağlı bir renk değişimi (yanıp sönme vb.) ekleyebilirsin.
    // Şimdilik shader kodundaki varsayılan mor/pembe tonunu sabit olarak döndürüyoruz.
    const çizgiRengi = new Cesium.CallbackProperty(() => {
        return Cesium.Color.fromBytes(239, 12, 249, 255);
    }, false); // false = değerin her karede sürekli hesaplanmasına gerek yok (sabit)

    // 3. Custom materyalimizi örnekliyoruz
    const ucusRotasiMateryali = new ArrowEdgeMaterialPropertyIlk(okRengi, çizgiRengi);

    // 4. Uçuş rotası için 3D koordinatlar (Boylam, Enlem, İrtifa-Metre)
    // Uçak yörüngesini simüle etmek için giderek artan bir irtifa kullanıyoruz.
    const kayma = 0.5;
    const rotaKoordinatlari = Cesium.Cartesian3.fromDegreesArrayHeights([
        28.8144, 40.9769 + kayma, 1000.0,  // Kalkış sonrası tırmanış
        29.0000, 41.0000 + kayma, 3500.0,  // Ara irtifa
        29.5000, 40.8000 + kayma, 8000.0,  // Seyir irtifasına yaklaşım
        30.0000, 40.5000 + kayma, 10000.0  // Seyir
    ]);


    // 5. Entity'i (Çizgiyi) haritaya ekliyoruz
    const ucusRotasi = viewer.entities.add({
        name: 'Örnek Uçuş Rotası',
        polyline: {
            positions: rotaKoordinatlari,
            // Okların içerideki detaylarının (V şekli, gövde vb.) net görünmesi için 
            // çizgi kalınlığını biraz yüksek tutmak iyi bir pratiktir.
            width: 12, 
            material: ucusRotasiMateryali,
            // Uçuş rotası olduğu için arazinin üzerine yapışmasın, havada kalsın:
            clampToGround: false 
        }
        
    });

    viewer.zoomTo(ucusRotasi);

    console.log("ucusRotasi eklendi:", ucusRotasi);


  } catch (error) {
    console.error("ucusRotasi hata:", error);
  }
};



