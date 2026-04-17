import * as Cesium from "cesium";

// ChevronArrowEdgeMaterialProperty_sandwichLine TÜRKÇESİ
export class ChevronArrowEdgeMaterialProperty_sandwichLine_tr implements Cesium.MaterialProperty {
    private _ok_rengi: Cesium.Property;              // eski: _arrowColor
    private _serit_rengi: Cesium.Property;           // eski: _dashColor
    private _tanim_degisti: Cesium.Event;            // eski: _definitionChanged

    constructor(
        ok_rengi: Cesium.Color,                      // eski: arrowColor
        serit_rengi: Cesium.CallbackProperty         // eski: dashColor
    ) {
        this._ok_rengi = new Cesium.ConstantProperty(ok_rengi);
        this._serit_rengi = serit_rengi;
        this._tanim_degisti = new Cesium.Event();

        if (!(Cesium.Material as any)._materialCache._materials["ChevronArrowEdgeMaterialProperty_sandwichLine_tr"]) {
            (Cesium.Material as any)._materialCache.addMaterial("ChevronArrowEdgeMaterialProperty_sandwichLine_tr", {
                fabric: {
                    type: "ChevronArrowEdgeMaterialProperty_sandwichLine_tr",
                    uniforms: {
                        ok_rengi: Cesium.Color.WHITE,                            // eski: arrowColor
                        serit_rengi: Cesium.Color.fromBytes(239, 12, 249, 255),  // eski: dashColor
                        orta_kesik_cizgi_rengi: Cesium.Color.AQUA,               // eski: middleDashColor
                        kesik_cizgi_uzunlugu: 100.0,                             // eski: dashLength
                        ok_uzunlugu: 25.0,                                       // eski: arrowLength
                        min_v: 0.30,                                             // eski: minV
                        max_v: 0.70                                              // eski: maxV
                    },
                    source: `
                        // Shader (GLSL) Kodu Başlangıcı
                        uniform vec4 ok_rengi;                            // eski: arrowColor
                        uniform vec4 serit_rengi;                         // eski: dashColor
                        uniform vec4 orta_kesik_cizgi_rengi;              // eski: middleDashColor
                        uniform float kesik_cizgi_uzunlugu;               // eski: dashLength
                        uniform float ok_uzunlugu;                        // eski: arrowLength
                        uniform float min_v;                              // eski: minV
                        uniform float max_v;                              // eski: maxV
                        
                        // Cesium'dan gelen polyline (çizgi) açısı
                        in float v_polylineAngle;

                        // Ekrandaki pikselleri çizgi açısına göre döndüren fonksiyon (eski: rotate)
                        mat2 dondur(float radyan) {
                            float c = cos(radyan);
                            float s = sin(radyan);
                            return mat2(c, s, -s, c);
                        }

                        // Pozitif mod (kalan) alma fonksiyonu (eski: modp)
                        float mod_pozitif(float x, float uzunluk) {
                            float m = mod(x, uzunluk);
                            return m < 0.0 ? m + uzunluk : m;
                        }

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            vec2 lokal_st = materialInput.st; // Çizginin lokal koordinatları (eski: st)

                            // Piksel koordinatlarını döndür ve hizala (eski: pos)
                            vec2 pozisyon = dondur(v_polylineAngle) * gl_FragCoord.xy;
                            
                            float piksel_cizgi_uzunlugu = max(kesik_cizgi_uzunlugu * czm_pixelRatio, 1.0); // eski: pixelDashLength
                            float piksel_ok_uzunlugu = max(ok_uzunlugu * czm_pixelRatio, 1.0);             // eski: pixelArrowLength
                            // Segment sadece çizgi uzunluğu + ok uzunluğu (eski: pixelSegmentLength)
                            float piksel_segment_uzunlugu = piksel_cizgi_uzunlugu + piksel_ok_uzunlugu;

                            // Mevcut pikselin döngü içindeki konumu (eski: xInSeg)
                            float segment_ici_x = mod_pozitif(pozisyon.x, piksel_segment_uzunlugu);

                            // Anti-aliasing yatay pay
                            float x_yumusatma_payi = max(fwidth(pozisyon.x), 1e-5); // eski: fwX
                            float x_bulanikligi = x_yumusatma_payi * 0.5;           // eski: blurX
                            
                            // Ok çizim kutusu içinde mi (eski: inArrow)
                            float ok_alaninda_mi = smoothstep(piksel_cizgi_uzunlugu - x_bulanikligi, piksel_cizgi_uzunlugu + x_bulanikligi, segment_ici_x);

                            // Okun normalleştirilmiş (0 ile 1 arası) yatay koordinatı (eski: u)
                            float ok_yatay_koordinati = clamp((segment_ici_x - piksel_cizgi_uzunlugu) / piksel_ok_uzunlugu, 0.0, 1.0);
                            float v_dikey_koordinat = lokal_st.t; // eski: v
                            
                            // Okun merkezden (0.5) saptıkça V şeklini almasını sağlayan katlama (eski: foldV)
                            float v_merkezden_sapma_orani = abs(v_dikey_koordinat - 0.5) * 2.0;

                            // Artifact (Türev zıplaması) düzeltmesi (eski: fwU ve fwV)
                            float u_yumusatma = max(x_yumusatma_payi / piksel_ok_uzunlugu, 1e-5); 
                            float v_yumusatma = max(fwidth(v_dikey_koordinat) * 2.0, 1e-5); 
                            
                            float u_bulaniklik = u_yumusatma * 0.5; 
                            float v_bulaniklik = v_yumusatma * 0.5;

                            // ==========================================
                            // 1D ANALİTİK CHEVRON (KUSURSUZ PARALELLİK)
                            // ==========================================
                            float ok_yatiklik_derecesi = 0.4; // eski: slope
                            
                            // Dış Sınırlar (Kalınlık = 0.6)
                            float sol_dis_sinir  = 0.4 - ok_yatiklik_derecesi * v_merkezden_sapma_orani; // eski: leftOutU
                            float sag_dis_sinir  = 1.0 - ok_yatiklik_derecesi * v_merkezden_sapma_orani; // eski: rightOutU
                            
                            // İç Sınırlar (Soldan ve Sağdan tam 0.1 birim içeride)
                            float sol_ic_sinir  = 0.6 - ok_yatiklik_derecesi * v_merkezden_sapma_orani; // eski: leftInnU
                            float sag_ic_sinir  = 0.8 - ok_yatiklik_derecesi * v_merkezden_sapma_orani; // eski: rightInnU

                            // Siyah Kenarlık ve Beyaz Gövde alanında kalıp kalmama oranları (eski: outerU, innerU)
                            float siyah_kenarlik_icinde_mi = smoothstep(sol_dis_sinir - u_bulaniklik, sol_dis_sinir + u_bulaniklik, ok_yatay_koordinati) * 
                                                             (1.0 - smoothstep(sag_dis_sinir - u_bulaniklik, sag_dis_sinir + u_bulaniklik, ok_yatay_koordinati));
                            
                            float beyaz_govde_icinde_mi = smoothstep(sol_ic_sinir - u_bulaniklik, sol_ic_sinir + u_bulaniklik, ok_yatay_koordinati) * 
                                                          (1.0 - smoothstep(sag_ic_sinir - u_bulaniklik, sag_ic_sinir + u_bulaniklik, ok_yatay_koordinati));
                            
                            // Uç tıraşlama (Sadece siyah değil, iç beyaz uca uygulanır) (eski: innerCapV)
                            float ok_sivri_ucu_kirpma = 1.0 - smoothstep(0.7 - v_bulaniklik, 0.7 + v_bulaniklik, v_merkezden_sapma_orani);

                            // Dış sınır maskesi × ok bölgesinde mi. (eski: alphaOuter)
                            float nihai_siyah_kenarlik_maskesi = siyah_kenarlik_icinde_mi * ok_alaninda_mi;
                            
                            // İç dolgu maskesi × uç tıraşlama × ok bölgesinde mi (eski: alphaInner)
                            float nihai_beyaz_govde_maskesi = beyaz_govde_icinde_mi * ok_sivri_ucu_kirpma * ok_alaninda_mi;

                            vec4 renk_serit = serit_rengi;              // eski: dashCol
                            vec4 renk_ok = ok_rengi;                    // eski: arrowCol
                            vec4 renk_siyah = vec4(0.0, 0.0, 0.0, 1.0); // eski: blackCol
                            
                            // --- ARKA PLAN (Sandviç Çizgi / Orta Kalın Şerit) ---
                            float zemin_bulaniklik = max(fwidth(v_dikey_koordinat), 1e-5) * 0.5; // (eski: blurZemin)
                            float orta_v = (min_v + max_v) * 0.5;                                // (eski: midV)
                            float serit_kalinligi = (max_v - min_v) * 0.2;                       // (eski: stripeThickness)
                            float v_ust_sinir = orta_v - (serit_kalinligi * 0.5);                // (eski: bStart)
                            float v_alt_sinir = orta_v + (serit_kalinligi * 0.5);                // (eski: bEnd)

                            // Ortadaki düz renk şerit hizasında mı (eski: blackFactor)
                            float ortadaki_siyah_serit_hizasinda_mi = smoothstep(v_ust_sinir - zemin_bulaniklik, v_ust_sinir + zemin_bulaniklik, v_dikey_koordinat) - 
                                                                      smoothstep(v_alt_sinir - zemin_bulaniklik, v_alt_sinir + zemin_bulaniklik, v_dikey_koordinat);
                            
                            vec4 cizgi_zemin_rengi = mix(renk_serit, orta_kesik_cizgi_rengi, ortadaki_siyah_serit_hizasinda_mi); // (eski: baseColor)
                            
                            float kenar_solma_efekti = smoothstep(min_v - zemin_bulaniklik, min_v + zemin_bulaniklik, v_dikey_koordinat) * 
                                                       (1.0 - smoothstep(max_v - zemin_bulaniklik, max_v + zemin_bulaniklik, v_dikey_koordinat)); // (eski: edgeAlpha)
                            cizgi_zemin_rengi.a *= kenar_solma_efekti;

                            // --- KATMANLI RENK BİRLEŞTİRME --
                            vec4 nihai_cikis_rengi = cizgi_zemin_rengi; // (eski: outColor)
                            nihai_cikis_rengi = mix(nihai_cikis_rengi, renk_siyah, nihai_siyah_kenarlik_maskesi); 
                            nihai_cikis_rengi = mix(nihai_cikis_rengi, renk_ok, nihai_beyaz_govde_maskesi); 

                            nihai_cikis_rengi = czm_gammaCorrect(nihai_cikis_rengi);

                            material.diffuse = nihai_cikis_rengi.rgb;
                            material.alpha   = nihai_cikis_rengi.a;
                            return material;
                        }
                    `
                },
                translucent: () => true
            });
        }
    }

    get isConstant(): boolean {
        const ok_ac = (this._ok_rengi as any)?.isConstant ?? true;
        const serit_dc = (this._serit_rengi as any)?.isConstant ?? true;
        return ok_ac && serit_dc;
    }

    get definitionChanged(): Cesium.Event { return this._tanim_degisti; }
    getType(_time: Cesium.JulianDate): string { return "ChevronArrowEdgeMaterialProperty_sandwichLine_tr"; }

    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.ok_rengi = this._ok_rengi.getValue(time);
        result.serit_rengi = this._serit_rengi.getValue(time);
        return result;
    }

    equals(other: Cesium.MaterialProperty): boolean {
        return (
            other instanceof ChevronArrowEdgeMaterialProperty_sandwichLine_tr &&
            (other as any)._ok_rengi?.equals?.(this._ok_rengi) === true &&
            (other as any)._serit_rengi?.equals?.(this._serit_rengi) === true
        );
    }
}
