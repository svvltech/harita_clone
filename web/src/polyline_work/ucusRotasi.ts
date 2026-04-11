import * as Cesium from 'cesium';
import { ArrowEdgeMaterialProperty, ArrowEdgeMaterialProperty1,ArrowEdgeMaterialProperty2,ArrowEdgeMaterialProperty2duzgun_1, ArrowEdgeMaterialProperty2duzgun_2, ArrowEdgeMaterialProperty2duzgun_3, ArrowEdgeMaterialProperty2duzgun_4, ArrowEdgeMaterialProperty2son, ArrowEdgeMaterialProperty_anchor, ArrowEdgeMaterialProperty_Border_Ekle, ArrowEdgeMaterialProperty_Border_Ekle_v2, ArrowEdgeMaterialProperty_Border_Ekle_v3, ArrowEdgeMaterialProperty_glsl, ArrowEdgeMaterialProperty_Kusursuz, ArrowEdgeMaterialPropertyIlk, ArrowEdgeMaterialPropertyIlk_Border, ArrowEdgeMaterialPropertySabit, ChevronArrowEdgeMaterialProperty, ChevronArrowEdgeMaterialProperty_sandwichLine } from './shaders';
import { viewer } from "../harita";

export const ucusRotasiEkle1 = (): void => {
  try {
    if (!viewer) return;

    // 2. Materyal parametrelerini hazırlıyoruz
    const okRengi = Cesium.Color.RED;

    // dashColor bir CallbackProperty bekliyor. 
    // İleride buraya zamana bağlı bir renk değişimi (yanıp sönme vb.) ekleyebilirsin.
    // Şimdilik shader kodundaki varsayılan mor/pembe tonunu sabit olarak döndürüyoruz.
    const cizgiRengi = new Cesium.CallbackProperty(() => {
        return Cesium.Color.fromBytes(239, 12, 249, 255);
    }, false); // false = değerin her karede sürekli hesaplanmasına gerek yok (sabit)

    // 3. Custom materyalimizi örnekliyoruz
    //const ucusRotasiMateryali = new ArrowEdgeMaterialProperty(okRengi, çizgiRengi);
    const routeStartPoint = Cesium.Cartesian3.fromDegrees(28.8144, 40.9769, 1000.0); 

    const ucusRotasiMateryali = new ArrowEdgeMaterialProperty1(
        okRengi,
        cizgiRengi,
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
    if (!viewer) return;

    const kayma = 0.1;
    
    // Eşit uzunlukta 3 parçalı rota (Her parça ~0.5 derece)
    const rotaKoordinatlari = Cesium.Cartesian3.fromDegreesArrayHeights([
        29.000, 41.000 + kayma, 10000.0,  
        29.500, 41.000 + kayma, 10000.0,  
        29.750, 40.567 + kayma, 10000.0,  
        30.250, 40.567 + kayma, 10000.0   
    ]);

    // Toplam uzunluk hesabı
    let toplamMetre = 0;
    for (let i = 0; i < rotaKoordinatlari.length - 1; i++) {
        toplamMetre += Cesium.Cartesian3.distance(rotaKoordinatlari[i], rotaKoordinatlari[i + 1]);
    }

    const dashColor = new Cesium.CallbackProperty(() => {
        return Cesium.Color.fromBytes(239, 12, 249, 255);
    }, false);

    
    const materyal = new ArrowEdgeMaterialProperty2duzgun_2(
        Cesium.Color.WHITE,
        dashColor,
        viewer.scene,
        rotaKoordinatlari,
        toplamMetre,
        115.0, // dashLength
        35.0   // arrowLength
    );

    viewer.entities.add({
        polyline: {
            positions: rotaKoordinatlari,
            width: 14,
            material: materyal,
            clampToGround: false,
            arcType: Cesium.ArcType.NONE // Çizgilerin bükülmesini engellemek için kritik
        }
    });

    viewer.zoomTo(viewer.entities);
};

export const ucusRotasiEkle2_2 = (): void => {
    if (!viewer) return;

    const kayma = 0.9;
    
    // Eşit uzunlukta 3 parçalı rota (Her parça ~0.5 derece)
    const rotaKoordinatlari = Cesium.Cartesian3.fromDegreesArrayHeights([
        29.000, 41.000 + kayma, 10000.0,  
        29.500, 41.000 + kayma, 10000.0,  
        29.750, 40.567 + kayma, 10000.0,  
        30.250, 40.567 + kayma, 10000.0   
    ]);

    // Toplam uzunluk hesabı
    let toplamMetre = 0;
    for (let i = 0; i < rotaKoordinatlari.length - 1; i++) {
        toplamMetre += Cesium.Cartesian3.distance(rotaKoordinatlari[i], rotaKoordinatlari[i + 1]);
    }

    const dashColor = new Cesium.CallbackProperty(() => {
        return Cesium.Color.fromBytes(239, 12, 249, 255);
    }, false);


    const materyal = new ArrowEdgeMaterialProperty2duzgun_1(
        Cesium.Color.WHITE,
        dashColor,
        viewer.scene,
        toplamMetre,
        115.0, // dashLength
        35.0   // arrowLength
    ); 

    viewer.entities.add({
        polyline: {
            positions: rotaKoordinatlari,
            width: 14,
            material: materyal,
            clampToGround: false,
            arcType: Cesium.ArcType.NONE // Çizgilerin bükülmesini engellemek için kritik
        }
    });

    viewer.zoomTo(viewer.entities);
};
export const ucusRotasiEkle_corridor = (): void => {
    if (!viewer) return;

    const kayma = 0.1;
    
    // Eşit uzunlukta 3 parçalı rota (Her parça ~0.5 derece)
    const rotaKoordinatlari = Cesium.Cartesian3.fromDegreesArrayHeights([
        29.000, 41.000 + kayma, 10000.0,  
        29.500, 41.000 + kayma, 10000.0,  
        29.750, 40.567 + kayma, 10000.0,  
        30.250, 40.567 + kayma, 10000.0   
    ]);

    // Toplam uzunluk hesabı
    let toplamMetre = 0;
    for (let i = 0; i < rotaKoordinatlari.length - 1; i++) {
        toplamMetre += Cesium.Cartesian3.distance(rotaKoordinatlari[i], rotaKoordinatlari[i + 1]);
    }

    const dashColor = new Cesium.CallbackProperty(() => {
        return Cesium.Color.fromBytes(239, 12, 249, 255);
    }, false);

    const taktikselArrowRatio = 2.3; // Ok uzunluğu oranı (Kısa)
    const taktikselDashRatio  = 7.7; // Çizgi uzunluğu oranı (Uzun)

    const materyal = new ArrowEdgeMaterialProperty2duzgun_2(
        Cesium.Color.WHITE,
        dashColor,
        viewer.scene,
        rotaKoordinatlari,
        toplamMetre,
        
        // --- BU İKİ DEĞER DEĞİŞTİ ---
        taktikselDashRatio,  // 115.0 yerine 7.7 (Çizgi narinleşti)
        taktikselArrowRatio  // 35.0 yerine 2.3 (Ok sivrileşti)
    );

  viewer.entities.add({
      name: 'Taktiksel Uçuş Koridoru',
      corridor: {
          positions: rotaKoordinatlari, // Önceden tanımladığın rotan
          
          // İŞTE SİHİRLİ NOKTA: Genişlik artık piksel değil, METRE.
          // Uçağın rotasını rahat görmek için 1500 metre (1.5 km) genişlik veriyoruz.
          width: 1500.0, 
          
          // Günlerdir yazdığımız o özel materyal sınıfını buraya veriyoruz
          material: materyal,
          
          // Virajların (köşelerin) yumuşak değil, keskin ve düzgün dönmesi için:
          cornerType: Cesium.CornerType.MITERED,
          
          // Yere tam yapışmasını istiyorsan height değerini 0 verebilirsin, 
          // 3D havada uçmasını istiyorsan yükseklikleri positions içinden otomatik alır.
      }
  });

    viewer.zoomTo(viewer.entities);
};

// ============================================================================
// YENİ: Hibrit Sabit Ok Materyali Test Fonksiyonu
// ============================================================================
export const ucusRotasiEkle_sabit = (): void => {
    if (!viewer) return;

    const kayma = 0.1;
    
    // Z şeklinde 3 parçalı rota (Her parça ~0.5 derece)
    const rotaKoordinatlari = Cesium.Cartesian3.fromDegreesArrayHeights([
        29.000, 41.000 + kayma, 10000.0,  
        29.500, 41.000 + kayma, 10000.0,  
        29.750, 40.567 + kayma, 10000.0,  
        30.250, 40.567 + kayma, 10000.0   
    ]);

    // Toplam uzunluk hesabı (metre)
    let toplamMetre = 0;
    for (let i = 0; i < rotaKoordinatlari.length - 1; i++) {
        toplamMetre += Cesium.Cartesian3.distance(rotaKoordinatlari[i], rotaKoordinatlari[i + 1]);
    }

    const dashColor = new Cesium.CallbackProperty(() => {
        return Cesium.Color.fromBytes(239, 12, 249, 255);
    }, false);

    // Yeni hibrit materyal: sabit pozisyon + perspektif-doğru boyut
    const materyal = new ArrowEdgeMaterialPropertySabit(
        Cesium.Color.WHITE,       // Ok rengi
        dashColor,                // Çizgi rengi
        toplamMetre,              // Rotanın gerçek uzunluğu
        rotaKoordinatlari,        // Koordinatlar
        toplamMetre / 15,         // Ok aralığı: toplam uzunluğun 1/15'i (daha sık)
        50.0                      // Ok piksel boyutu (büyük, net ok şekli)
    );

    viewer.entities.add({
        name: 'Hibrit Sabit Ok Rotası',
        polyline: {
            positions: rotaKoordinatlari,
            width: 14,
            material: materyal,
            clampToGround: false,
            arcType: Cesium.ArcType.NONE
        }
    });

    viewer.zoomTo(viewer.entities);
    console.log(`✅ Sabit ok rotası eklendi. Uzunluk: ${(toplamMetre/1000).toFixed(1)} km, Ok sayısı: ${Math.round(toplamMetre / (toplamMetre/10))}`);
};

export const ucusRotasiEkle2son = (): void => {
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
        28.8144, 40.9769 + kayma, 10000.0,  // 1. Başlangıç noktası
        29.1144, 40.9769 + kayma, 10000.0,  // 2. Dönüş BAŞLANGICI (0.3 boylam gidildi)
        29.6144, 40.5000 + kayma, 10000.0,  // 3. Dönüş BİTİŞİ (Çapraz inildi)
        29.9144, 40.5000 + kayma, 10000.0   // 4. Bitiş noktası (Yine tam 0.3 boylam gidildi)
    ]);
    // Çizginin koordinat dizisi elinde var: rotaKoordinatlari
    let gercekUzunlukMetre = 0;
    for (let i = 0; i < rotaKoordinatlari.length - 1; i++) {
        gercekUzunlukMetre += Cesium.Cartesian3.distance(rotaKoordinatlari[i], rotaKoordinatlari[i + 1]);
    }
    const ortaNokta = rotaKoordinatlari[Math.floor(rotaKoordinatlari.length / 2)];

    // 3. Custom materyalimizi örnekliyoruz
      const ucusRotasiMateryali = new ArrowEdgeMaterialProperty2son(
      okRengi, çizgiRengi, 115.0 ,35.0, viewer.scene, gercekUzunlukMetre);

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
            //clampToGround: true ,
            //arcType: Cesium.ArcType.NONE
        }
        
    });

    viewer.zoomTo(ucusRotasi);

    console.log("ucusRotasi eklendi:", ucusRotasi);


  } catch (error) {
    console.error("ucusRotasi hata:", error);
  }
};

/*
export const ucusRotasiEkle2Yedek = (): void => {
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
      okRengi, çizgiRengi,viewer.scene, gercekUzunlukMetre, );

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
*/
export const ucusRotasiEkleIlk = (): void => {
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
        // 1. Nokta: Başlangıç
        29.000, 41.000 + kayma, 10000.0,  
        
        // 2. Nokta: Tam 0.5 derece DOĞUYA düz uçuş
        29.500, 41.000 + kayma, 10000.0,  
        
        // 3. Nokta: Tam 0.5 derece GÜNEYDOĞUYA çapraz iniş 
        // (X'te 0.25, Y'de 0.433 ilerlersek hipotenüs tam 0.5 olur)
        29.750, 40.567 + kayma, 10000.0,  
        
        // 4. Nokta: Yine tam 0.5 derece DOĞUYA düz uçuş
        30.250, 40.567 + kayma, 10000.0   
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

export const ucusRotasiEkleIlk_Border = (): void => {
  try {
    if (!viewer) return;

    // 2. Materyal parametrelerini hazırlıyoruz
    const okRengi = Cesium.Color.WHITE;

    // dashColor bir CallbackProperty bekliyor. 
    // İleride buraya zamana bağlı bir renk değişimi (yanıp sönme vb.) ekleyebilirsin.
    // Şimdilik shader kodundaki varsayılan mor/pembe tonunu sabit olarak döndürüyoruz.
    const çizgiRengi = new Cesium.CallbackProperty(() => {
        return Cesium.Color.WHITE;//fromBytes(239, 12, 249, 255);
    }, false); // false = değerin her karede sürekli hesaplanmasına gerek yok (sabit)


    const borderColor = Cesium.Color.BLACK; // YENİ: Uniform'a varsayılan renk eklendi
    const borderWidth = 2.0;  
    // 3. Custom materyalimizi örnekliyoruz
    const ucusRotasiMateryali = new ArrowEdgeMaterialProperty_Border_Ekle_v3(okRengi, çizgiRengi,borderColor,borderWidth);

    // 4. Uçuş rotası için 3D koordinatlar (Boylam, Enlem, İrtifa-Metre)
    // Uçak yörüngesini simüle etmek için giderek artan bir irtifa kullanıyoruz.
    const kayma = -0.9;
    const rotaKoordinatlari = Cesium.Cartesian3.fromDegreesArrayHeights([
        // 1. Nokta: Başlangıç
        29.000, 41.000 + kayma, 10000.0,  
        
        // 2. Nokta: Tam 0.5 derece DOĞUYA düz uçuş
        29.500, 41.000 + kayma, 10000.0,  
        
        // 3. Nokta: Tam 0.5 derece GÜNEYDOĞUYA çapraz iniş 
        // (X'te 0.25, Y'de 0.433 ilerlersek hipotenüs tam 0.5 olur)
        29.750, 40.567 + kayma, 10000.0,  
        
        // 4. Nokta: Yine tam 0.5 derece DOĞUYA düz uçuş
        30.250, 40.567 + kayma, 10000.0   
    ]);


    // 5. Entity'i (Çizgiyi) haritaya ekliyoruz
    const ucusRotasi = viewer.entities.add({
        name: 'Örnek Uçuş Rotası',
        polyline: {
            positions: rotaKoordinatlari,
            // Okların içerideki detaylarının (V şekli, gövde vb.) net görünmesi için 
            // çizgi kalınlığını biraz yüksek tutmak iyi bir pratiktir.
            width: 50, 
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
export const ucusRotasiEkle = (): void => {
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
    //const ucusRotasiMateryali = new ArrowEdgeMaterialProperty_glsl(okRengi, çizgiRengi);
    const ucusRotasiMateryali = new ChevronArrowEdgeMaterialProperty_sandwichLine(okRengi, çizgiRengi);

    // 4. Uçuş rotası için 3D koordinatlar (Boylam, Enlem, İrtifa-Metre)
    // Uçak yörüngesini simüle etmek için giderek artan bir irtifa kullanıyoruz.
    const kayma = 0.3;
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

export const ucusRotasiEkle_anchor = (): void => {
  try {
    if (!viewer) return;

    // 2. Materyal parametrelerini hazırlıyoruz
    const okRengi = Cesium.Color.PURPLE;

    // dashColor bir CallbackProperty bekliyor. 
    // İleride buraya zamana bağlı bir renk değişimi (yanıp sönme vb.) ekleyebilirsin.
    // Şimdilik shader kodundaki varsayılan mor/pembe tonunu sabit olarak döndürüyoruz.
    const çizgiRengi = new Cesium.CallbackProperty(() => {
        return Cesium.Color.fromBytes(239, 12, 249, 255);
    }, false); // false = değerin her karede sürekli hesaplanmasına gerek yok (sabit)

    // 3. Custom materyalimizi örnekliyoruz

    // 4. Uçuş rotası için 3D koordinatlar (Boylam, Enlem, İrtifa-Metre)
    // Uçak yörüngesini simüle etmek için giderek artan bir irtifa kullanıyoruz.
    const kayma = 0.3;
    const rotaKoordinatlari = Cesium.Cartesian3.fromDegreesArrayHeights([
        28.8144, 40.9769 + kayma, 1000.0,  // Kalkış sonrası tırmanış
        29.0000, 41.0000 + kayma, 3500.0,  // Ara irtifa
        29.5000, 40.8000 + kayma, 8000.0,  // Seyir irtifasına yaklaşım
        30.0000, 40.5000 + kayma, 10000.0  // Seyir
    ]);

    const ucusRotasiMateryali = new ArrowEdgeMaterialProperty_anchor(okRengi, çizgiRengi, viewer.scene, rotaKoordinatlari[0]);

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


export const ucusRotasiEkle2_kusursuz = (): void => {
    if (!viewer) return;

    const kayma = 0.1;
    
    // 1. ZEMİN ROTASI (10.000 Metre)
    const zeminKoordinatlari = Cesium.Cartesian3.fromDegreesArrayHeights([
        29.000, 41.000 + kayma, 10000.0,  
        29.500, 41.000 + kayma, 10000.0,  
        29.750, 40.567 + kayma, 10000.0,  
        30.250, 40.567 + kayma, 10000.0   
    ]);

    // 2. OK ROTASI (10.015 Metre) 
    // BENİM HATAM BURADAYDI! Okları 15 metre yukarı kaldırmak zorundayız, 
    // yoksa mor zemin çizgisi okları (Z-Fighting nedeniyle) yutar ve görünmez yapar.
    const okKoordinatlari = Cesium.Cartesian3.fromDegreesArrayHeights([
        29.000, 41.000 + kayma, 10015.0,  
        29.500, 41.000 + kayma, 10015.0,  
        29.750, 40.567 + kayma, 10015.0,  
        30.250, 40.567 + kayma, 10015.0   
    ]);

    // --- Zemin Çizgisi ---
    viewer.entities.add({
        name: 'Ana Rota Zemini',
        polyline: {
            positions: zeminKoordinatlari, // ZEMİN koordinatları kullanılıyor
            width: 3, 
            material: Cesium.Color.fromBytes(239, 12, 249, 255) 
        }
    });

    const cizgiRengi = new Cesium.CallbackProperty(() => {
        return Cesium.Color.TRANSPARENT;
    }, false); 

    // --- Ok Katmanı ---
    for (let i = 0; i < okKoordinatlari.length - 1; i++) {
        const baslangic = okKoordinatlari[i]; // OK koordinatları kullanılıyor
        const bitis = okKoordinatlari[i + 1];
        
        const segmentMesafe = Cesium.Cartesian3.distance(baslangic, bitis);

        const okMateryali = new ArrowEdgeMaterialProperty_Kusursuz(
            Cesium.Color.WHITE,
            cizgiRengi, 
            segmentMesafe
        );

        viewer.entities.add({
            name: `Ok Segmenti ${i+1}`,
            polyline: {
                positions: [baslangic, bitis],
                width: 7, 
                material: okMateryali
            }
        });
    }

    viewer.zoomTo(viewer.entities);
};

//////////////// 010426

// ============================================================================
// ARROW MESH: Rota üzerinde 3D üçgen ok geometrileri
// ============================================================================

/**
 * Rota boyunca eşit aralıklarla pozisyon ve yön örnekleri alır.
 */
function rotaBoyuncaOrnekle(
    pozisyonlar: Cesium.Cartesian3[],
    aralikMetre: number
): Array<{ pozisyon: Cesium.Cartesian3; yon: Cesium.Cartesian3 }> {
    const sonuc: Array<{ pozisyon: Cesium.Cartesian3; yon: Cesium.Cartesian3 }> = [];
    let toplamMesafe = 0;
    let sonrakiOrnekMesafe = aralikMetre / 2; // İlk ok yarım aralıkta

    for (let i = 0; i < pozisyonlar.length - 1; i++) {
        const baslangic = pozisyonlar[i];
        const bitis = pozisyonlar[i + 1];
        const segUzunluk = Cesium.Cartesian3.distance(baslangic, bitis);
        if (segUzunluk < 1) continue;

        const yon = Cesium.Cartesian3.subtract(bitis, baslangic, new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(yon, yon);

        while (sonrakiOrnekMesafe <= toplamMesafe + segUzunluk) {
            const t = (sonrakiOrnekMesafe - toplamMesafe) / segUzunluk;
            const poz = Cesium.Cartesian3.lerp(baslangic, bitis, t, new Cesium.Cartesian3());
            sonuc.push({ pozisyon: poz, yon: Cesium.Cartesian3.clone(yon) });
            sonrakiOrnekMesafe += aralikMetre;
        }
        toplamMesafe += segUzunluk;
    }
    return sonuc;
}

/**
 * Ok'un dünya pozisyonunu ve rota yönüne dönüş matrisini hesaplar.
 * Ok geometrisi +X yönünde tanımlı → tangent yönüne döndürülür.
 */
function okModelMatrisiHesapla(
    pozisyon: Cesium.Cartesian3,
    yon: Cesium.Cartesian3
): Cesium.Matrix4 {
    // ENU (East-North-Up) çerçevesi
    const enuMatris = Cesium.Transforms.eastNorthUpToFixedFrame(pozisyon);

    // Yön vektörünü ECEF → ENU'ya dönüştür
    const tersEnu = Cesium.Matrix4.inverseTransformation(enuMatris, new Cesium.Matrix4());
    const yonEnu = Cesium.Matrix4.multiplyByPointAsVector(tersEnu, yon, new Cesium.Cartesian3());

    // Ok +X yönünde → East'ten tangent yönüne açıyı bul
    const aci = Math.atan2(yonEnu.y, yonEnu.x);

    // Z (Up) ekseni etrafında döndür
    const donusMatris = Cesium.Matrix4.fromRotationTranslation(
        Cesium.Matrix3.fromRotationZ(aci)
    );

    // Final: dünya pozisyonu × yerel dönüş
    return Cesium.Matrix4.multiply(enuMatris, donusMatris, new Cesium.Matrix4());
}

/**
 * Rota boyunca 3D ok mesh'leri oluşturur.
 * Her ok = 7 vertex, 3 üçgen (gövde dikdörtgen + baş üçgen).
 * Tüm oklar tek Primitive'de batch edilir.
 */
export function rotaOklariniOlustur(
    pozisyonlar: Cesium.Cartesian3[],
    aralikMetre: number,
    okUzunlukMetre: number,
    okGenislikMetre: number,
    renk: Cesium.Color
): Cesium.Primitive {
    const ornekler = rotaBoyuncaOrnekle(pozisyonlar, aralikMetre);

    // Ok geometrisi: +X yönünde, orijinde merkezi, XY düzleminde
    const yarimL = okUzunlukMetre / 2;
    const govdeOran = 0.6;
    const govdeYarimW = okGenislikMetre * 0.15;
    const basYarimW = okGenislikMetre * 0.5;
    const govdeBitis = -yarimL + okUzunlukMetre * govdeOran;
    const zOfset = 50.0; // Polyline ile z-fighting önleme

    // 7 vertex: 4 gövde + 3 baş
    const pozlar = new Float64Array([
        -yarimL,    -govdeYarimW, zOfset,  // 0: gövde sol-arka
         govdeBitis, -govdeYarimW, zOfset,  // 1: gövde sol-ön
         govdeBitis,  govdeYarimW, zOfset,  // 2: gövde sağ-ön
        -yarimL,     govdeYarimW, zOfset,  // 3: gövde sağ-arka
         govdeBitis, -basYarimW,  zOfset,  // 4: baş sol
         yarimL,      0,          zOfset,  // 5: baş ucu
         govdeBitis,  basYarimW,  zOfset,  // 6: baş sağ
    ]);

    // 3 üçgen: 2 gövde + 1 baş = 9 indis
    const indisler = new Uint16Array([
        0, 1, 2,  0, 2, 3,  // Gövde (dikdörtgen → 2 üçgen)
        4, 5, 6             // Baş (üçgen)
    ]);

    // Normal: hepsi +Z (yukarı)
    const normaller = new Float32Array([
        0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
        0, 0, 1,  0, 0, 1,  0, 0, 1
    ]);

    const okGeometri = new Cesium.Geometry({
        attributes: {
            position: new Cesium.GeometryAttribute({
                componentDatatype: Cesium.ComponentDatatype.DOUBLE,
                componentsPerAttribute: 3,
                values: pozlar
            }),
            normal: new Cesium.GeometryAttribute({
                componentDatatype: Cesium.ComponentDatatype.FLOAT,
                componentsPerAttribute: 3,
                values: normaller
            })
        } as any,
        indices: indisler,
        primitiveType: Cesium.PrimitiveType.TRIANGLES,
        boundingSphere: Cesium.BoundingSphere.fromVertices(Array.from(pozlar))
    });

    // Her ok için GeometryInstance (kendi modelMatrix'i ile)
    const instancelar = ornekler.map((ornek, i) => {
        return new Cesium.GeometryInstance({
            geometry: okGeometri,
            modelMatrix: okModelMatrisiHesapla(ornek.pozisyon, ornek.yon),
            attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(renk)
            },
            id: `ok_${i}`
        });
    });

    return new Cesium.Primitive({
        geometryInstances: instancelar,
        appearance: new Cesium.PerInstanceColorAppearance({
            flat: true,
            translucent: false
        }),
        asynchronous: false
    });
}

// ============================================================================
// TEST: Polyline (çizgi) + Arrow Mesh (3D oklar)
// ============================================================================
export const ucusRotasiEkle_arrowMesh = (): void => {
    if (!viewer) return;

    const kayma = 0.1;
    const rotaKoordinatlari = Cesium.Cartesian3.fromDegreesArrayHeights([
        29.000, 41.000 + kayma, 10000.0,
        29.500, 41.000 + kayma, 10000.0,
        29.750, 40.567 + kayma, 10000.0,
        30.250, 40.567 + kayma, 10000.0
    ]);

    // Toplam uzunluk
    let toplamMetre = 0;
    for (let i = 0; i < rotaKoordinatlari.length - 1; i++) {
        toplamMetre += Cesium.Cartesian3.distance(rotaKoordinatlari[i], rotaKoordinatlari[i + 1]);
    }

    // 1. Rota çizgisi (sadece düz magenta çizgi)
    viewer.entities.add({
        polyline: {
            positions: rotaKoordinatlari,
            width: 6,
            material: Cesium.Color.fromBytes(239, 12, 249, 255),
            clampToGround: false,
            arcType: Cesium.ArcType.NONE
        }
    });

    // 2. Ok mesh'leri (3D üçgen geometri — perspektiften bağımsız)
    const okPrimitive = rotaOklariniOlustur(
        rotaKoordinatlari,
        toplamMetre / 15,    // Oklar arası: ~7 km
        1500,                // Ok uzunluğu: 1.5 km
        1200,                // Ok genişliği: 1.2 km
        Cesium.Color.WHITE
    );
    viewer.scene.primitives.add(okPrimitive);

    viewer.zoomTo(viewer.entities);
    console.log(`✅ Arrow Mesh eklendi. Uzunluk: ${(toplamMetre / 1000).toFixed(1)} km, Ok sayısı: ${ornekSayisi(rotaKoordinatlari, toplamMetre / 15)}`);
};

function ornekSayisi(poz: Cesium.Cartesian3[], aralik: number): number {
    let toplam = 0;
    for (let i = 0; i < poz.length - 1; i++) toplam += Cesium.Cartesian3.distance(poz[i], poz[i + 1]);
    return Math.floor(toplam / aralik);
}


//////////////////


let cizimDinleyici: Cesium.ScreenSpaceEventHandler | undefined;

/**
 * Haritaya fare ile tıklayarak dinamik ve sabit irtifalı bir
 * uçuş rotası çizilmesini başlatır. Sağ tık yapıldığında çizim biter
 * ve özel materyal çizgisi haritaya eklenir.
 */
export const interaktifRotaCiziminiBaslat = (irtifa: number = 10000.0) => {
    if (!viewer) return;
    const v = viewer; // Lint hatalarını çözmek için yerel non-null referans

    // Eğer önceki bir çizim olayı açıksa önce onu temizle
    if (cizimDinleyici) {
        cizimDinleyici.destroy();
        cizimDinleyici = undefined;
    }

    const scene = v.scene;
    cizimDinleyici = new Cesium.ScreenSpaceEventHandler(scene.canvas);

    const sabitNoktalar: Cesium.Cartesian3[] = [];
    let hareketliNokta: Cesium.Cartesian3 | undefined = undefined;
    let geciciHat: Cesium.Entity | undefined = undefined;

    // Harita üzerindeki fare konumunu belli bir irtifada 3D kartezyene çevirir
    const getPositionFromLocation = (position: Cesium.Cartesian2): Cesium.Cartesian3 | undefined => {
        const ray = v.camera.getPickRay(position);
        if (!ray) return undefined;
        const p = scene.globe.pick(ray, scene);
        if (p) {
            const carto = Cesium.Cartographic.fromCartesian(p);
            carto.height = irtifa;
            return Cesium.Cartographic.toCartesian(carto);
        }
        return undefined;
    };

    // Fare gezinmesi (Önizleme geçici çizgisini sürükler)
    cizimDinleyici.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
        if (sabitNoktalar.length > 0) {
            const pos = getPositionFromLocation(movement.endPosition);
            if (pos) {
                hareketliNokta = pos;
                
                // Eğer sarı kesikli geçici hat henüz yoksa oluşturuyoruz
                if (!geciciHat) {
                    geciciHat = v.entities.add({
                        name: "Çizim Aracı Geçici Hat",
                        polyline: {
                            positions: new Cesium.CallbackProperty(() => {
                                if (hareketliNokta) {
                                    return [...sabitNoktalar, hareketliNokta];
                                }
                                return sabitNoktalar;
                            }, false),
                            width: 6,
                            material: new Cesium.PolylineDashMaterialProperty({
                                color: Cesium.Color.YELLOW,
                                dashLength: 20.0
                            }),
                            clampToGround: false,
                            arcType: Cesium.ArcType.NONE
                        }
                    });
                }
            }
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // SOL TIK: Yeni nokta ekler
    cizimDinleyici.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
        const pos = getPositionFromLocation(click.position);
        if (pos) {
            sabitNoktalar.push(pos);
            console.log("Rota noktası eklendi.");
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // SAĞ TIK: Çizimi Bitir / Uygula
    cizimDinleyici.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
        // 1. Dinleyiciyi durdur ve temizle
        if (cizimDinleyici) {
            cizimDinleyici.destroy();
            cizimDinleyici = undefined;
        }

        // 2. Geçici sarı rotayı haritadan sil
        if (geciciHat) {
            v.entities.remove(geciciHat);
        }

        if (sabitNoktalar.length < 2) {
            console.warn("Rota çizimi iptal edildi. En az 2 nokta çizilmiş olmalı.");
            return;
        }

        // 3. Uzunluğu Ölç (Özel shaderımız için zorunlu)
        let toplamMetre = 0;
        for (let i = 0; i < sabitNoktalar.length - 1; i++) {
            toplamMetre += Cesium.Cartesian3.distance(sabitNoktalar[i], sabitNoktalar[i + 1]);
        }

        // 4. Materyali Oluştur (ucusRotasiEkle2'deki ile tamamen aynı)
        const dashColor = new Cesium.CallbackProperty(() => {
            return Cesium.Color.fromBytes(239, 12, 249, 255);
        }, false);

        const materyal = new ArrowEdgeMaterialProperty2duzgun_3(
            Cesium.Color.WHITE,
            dashColor,
            v.scene,
            sabitNoktalar,
            toplamMetre,
            115.0, // dashLength
            35.0   // arrowLength
        );

        // 5. Kalıcı asıl rotayı (Custom Shader) yerine ekle
        v.entities.add({
            name: "Elle Çizilmiş Yeni Uçuş Rotası",
            polyline: {
                positions: sabitNoktalar,
                width: 14,
                material: materyal,
                clampToGround: false,
                arcType: Cesium.ArcType.NONE
            }
        });

        console.log("İnteraktif rota başarılıyla çizildi. " + sabitNoktalar.length + " noktalı.");

    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
};



