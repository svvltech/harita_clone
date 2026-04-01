import * as Cesium from 'cesium';
import { ArrowEdgeMaterialProperty, ArrowEdgeMaterialProperty1,ArrowEdgeMaterialProperty2,ArrowEdgeMaterialProperty2duzgun_1, ArrowEdgeMaterialProperty2duzgun_2, ArrowEdgeMaterialProperty2duzgun_3, ArrowEdgeMaterialProperty2duzgun_4, ArrowEdgeMaterialProperty2son, ArrowEdgeMaterialPropertyIlk, ArrowEdgeMaterialPropertySabit } from './shaders';
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
    const okRengi = Cesium.Color.BLACK;

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

export const ucusRotasiEkle = (): void => {
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
    const ucusRotasiMateryali = new ArrowEdgeMaterialProperty(okRengi, çizgiRengi);

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

