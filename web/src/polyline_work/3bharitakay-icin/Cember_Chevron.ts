import * as Cesium from "cesium";

/**
 * Çember (veya kapalı polyline) üzerine eşit aralıklarla istenen sayıda OK (Chevron) çizen,
 * arka planını ise ince ve tek renkli düz bir şerit yapan materyal sınıfı.
 * 
 * Ok sayısı (ok_sayisi) verildiğinde o çemberin çevresini o sayıya böler
 * ve her dilimin tam merkezine piksel bazında sabit uzunlukta (ok_uzunlugu) bir ok yerleştirir.
 */
export class Cember_Chevron_MaterialProperty implements Cesium.MaterialProperty {
    private _ok_rengi: Cesium.Property;
    private _serit_rengi: Cesium.Property;
    private _ok_sayisi: number;
    private _ok_uzunlugu: number;
    private _serit_kalinlik_orani: number;
    private _tanim_degisti: Cesium.Event;

    /**
     * @param ok_rengi Okların Rengi (örn: Mavi)
     * @param serit_rengi Çember hattının çizgi rengi (örn: Siyah)
     * @param ok_sayisi Çemberin etrafında kaç tane ok görmek istediğiniz
     * @param ok_uzunlugu Ekranda çizilecek 1 adet okun piksel uzunluğu
     * @param serit_kalinlik_orani 0.0 ile 1.0 arası: Haritadaki ince yuvarlak şeridin kalınlığı (0.2 = %20)
     */
    constructor(
        ok_rengi: Cesium.Color = Cesium.Color.fromBytes(20, 100, 250, 255),  // Şık Mavi Varsayılan
        serit_rengi: Cesium.Color = Cesium.Color.BLACK,                      // Siyah Varsayılan
        ok_sayisi: number = 4.0,                                             // 4 Adet Yön Oku Varsayılan
        ok_uzunlugu: number = 25.0,                                          // 25 Piksel Uzunluk Varsayılan
        serit_kalinlik_orani: number = 0.2                                   // Arka plan çizgisi %20 kalınlık
    ) {
        this._ok_rengi = new Cesium.ConstantProperty(ok_rengi);
        this._serit_rengi = new Cesium.ConstantProperty(serit_rengi);
        this._ok_sayisi = ok_sayisi;
        this._ok_uzunlugu = ok_uzunlugu;
        this._serit_kalinlik_orani = serit_kalinlik_orani;
        this._tanim_degisti = new Cesium.Event();

        if (!(Cesium.Material as any)._materialCache._materials["Cember_Chevron_Material"]) {
            (Cesium.Material as any)._materialCache.addMaterial("Cember_Chevron_Material", {
                fabric: {
                    type: "Cember_Chevron_Material",
                    uniforms: {
                        ok_rengi: Cesium.Color.fromBytes(20, 100, 250, 255),
                        serit_rengi: Cesium.Color.BLACK,
                        ok_sayisi: ok_sayisi,
                        ok_uzunlugu: ok_uzunlugu,
                        serit_kalinlik_orani: serit_kalinlik_orani
                    },
                    source: `
                        uniform vec4 ok_rengi;
                        uniform vec4 serit_rengi;
                        uniform float ok_sayisi;
                        uniform float ok_uzunlugu;
                        uniform float serit_kalinlik_orani;

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            vec2 st = materialInput.st;
                            
                            // ===============================================
                            // 1. ÇEMBER MATEMATİĞİ (s Segmentlerinin Belirlenmesi)
                            // ===============================================
                            // Çember veya spline boyunca mesafenin (st.s) 1 ekranda (pixel) ne kadar değiştiğini bulalım.
                            float ds_dx = dFdx(st.s);
                            float ds_dy = dFdy(st.s);

                            // Kapalı Polylinelerde başa dönüş/bitiş dikişi olan "seam" zıplamalarını engelle (Türev patlaması çözer)
                            ds_dx = abs(ds_dx) > 0.5 ? 0.0 : ds_dx;
                            ds_dy = abs(ds_dy) > 0.5 ? 0.0 : ds_dy;

                            // Her bir piksele düşen st.s değişimi
                            float PikselBasina_S_Degisimi = max(length(vec2(ds_dx, ds_dy)), 1e-7);
                            
                            // 1 tur çemberin ekranımızdaki toplam piksel karşılığı
                            float polyline_ekran_pikseli = 1.0 / PikselBasina_S_Degisimi;

                            // Kullanıcının "ok uzunluğu" px girdisini hesaba dahil et
                            float piksel_ok_uzunlugu = max(ok_uzunlugu * czm_pixelRatio, 1.0);
                            
                            // Çemberi "ok_sayisi" kadar parçaya böl. Lokal parça %'lik dilimini al (0.0 -> 1.0)
                            float lokal_s = fract(st.s * ok_sayisi);
                            
                            // Bir okun, içinde bulunduğu tek bir segment parçasının "yüzde kaçını" kaplayacağı
                            // (Eğer obje zoom-out yapılmış küçücük bir çemberse, bu oran büyüyecektir)
                            float ok_kaplama_s_orani = piksel_ok_uzunlugu / polyline_ekran_pikseli;
                            ok_kaplama_s_orani = clamp(ok_kaplama_s_orani, 0.0, 1.0); // Çemberden bile büyükse kırp
                            
                            // Oku, oluşturduğu 0'dan 1'e giden segment periyodunun tam ortasına hizala (0.5)
                            float ok_baslangic_s = 0.5 - (ok_kaplama_s_orani * 0.5);
                            float ok_bitis_s = ok_baslangic_s + ok_kaplama_s_orani;
                            
                            // Pürüzsüzleştirme (Anti-Aliasing) payı
                            float s_yumusatma = PikselBasina_S_Degisimi * ok_sayisi;
                            float bulaniklik = s_yumusatma * 0.5;

                            // O anki pikselin ok koordinat sınırlarının içinde olup olmadığını tespit et
                            float ok_alaninda_mi = smoothstep(ok_baslangic_s - bulaniklik, ok_baslangic_s + bulaniklik, lokal_s) *
                                                   (1.0 - smoothstep(ok_bitis_s - bulaniklik, ok_bitis_s + bulaniklik, lokal_s));
                                                   
                            // Ok çizim alanındaki "u" koordinatını, sınırları daraltarak 0-1 normalize alanına esnet
                            float ok_u_koordinati = clamp((lokal_s - ok_baslangic_s) / max(ok_kaplama_s_orani, 1e-5), 0.0, 1.0);
                            
                            float v = st.t; // Dikey Ekseni (çizginin eni)
                            float v_merkezden_sapma_orani = abs(v - 0.5) * 2.0;
                            
                            // u ve v için kenar yumuşatmalar (Artifact temizleyici)
                            float fwU = max(s_yumusatma / max(ok_kaplama_s_orani, 1e-5), 1e-5);
                            float blurU = fwU * 0.5;
                            float blurV = max(fwidth(v) * 2.0, 1e-5) * 0.5;
                            
                            // ===============================================
                            // 2. CHEVRON GÖRSEL MATEMATİĞİ (V Şekilli Ok)
                            // ===============================================
                            float ok_yatiklik_derecesi = 0.4;
                            
                            // Okun sol ve sağ gövdesini (V kesitleri) oluşturur
                            // Sadece dolgu mavi kullanıyoruz, kontur/dış çerçeve yok. Kalınlığı 0.3 (0.8 - 0.5).
                            float sol_ic_sinir = 0.5 - ok_yatiklik_derecesi * v_merkezden_sapma_orani;
                            float sag_ic_sinir = 0.8 - ok_yatiklik_derecesi * v_merkezden_sapma_orani;

                            float ok_govde_icinde_mi = smoothstep(sol_ic_sinir - blurU, sol_ic_sinir + blurU, ok_u_koordinati) * 
                                                       (1.0 - smoothstep(sag_ic_sinir - blurU, sag_ic_sinir + blurU, ok_u_koordinati));
                                                       
                            // Okun aşırı sivrilen ucunu kes ve törpüle
                            float ok_sivri_ucu_kirpma = 1.0 - smoothstep(0.8 - blurV, 0.8 + blurV, v_merkezden_sapma_orani);

                            // Okun tüm geometrik maskesini birleştir ve taşan sızıntıları temizle
                            float nihai_ok_maskesi = ok_govde_icinde_mi * ok_sivri_ucu_kirpma * ok_alaninda_mi;

                            // ===============================================
                            // 3. ARKA PLAN DÜZ ŞERİDİ
                            // ===============================================
                            // Siyah çember/zemin şeridi. 
                            // Kalınlığını uniform'dan alır, böylece V ekseninde (0-1 arasında) ortalanır.
                            float yari_kalinlik = serit_kalinlik_orani * 0.5;
                            float serit_ust = 0.5 - yari_kalinlik;
                            float serit_alt = 0.5 + yari_kalinlik;
                            
                            // Anti-Aliasing (Şerit kenarları)
                            float zemin_bulaniklik = max(fwidth(v), 1e-5) * 0.5;
                            
                            float serit_maskesi = smoothstep(serit_ust - zemin_bulaniklik, serit_ust + zemin_bulaniklik, v) * 
                                                  (1.0 - smoothstep(serit_alt - zemin_bulaniklik, serit_alt + zemin_bulaniklik, v));

                            // ===============================================
                            // 4. SON RENK KATMANLAMASI
                            // ===============================================
                            vec4 cikis_rengi = mix(vec4(0.0), serit_rengi, serit_maskesi); // Önce Zemin Çizgisini boya
                            cikis_rengi = mix(cikis_rengi, ok_rengi, nihai_ok_maskesi);    // Sonra Okları üzerine çak
                            
                            cikis_rengi = czm_gammaCorrect(cikis_rengi);

                            material.diffuse = cikis_rengi.rgb;
                            material.alpha = cikis_rengi.a;
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
    getType(_time: Cesium.JulianDate): string { return "Cember_Chevron_Material"; }

    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.ok_rengi = this._ok_rengi.getValue(time);
        result.serit_rengi = this._serit_rengi.getValue(time);
        result.ok_sayisi = this._ok_sayisi;
        result.ok_uzunlugu = this._ok_uzunlugu;
        result.serit_kalinlik_orani = this._serit_kalinlik_orani;
        return result;
    }

    equals(other: Cesium.MaterialProperty): boolean {
        return (
            other instanceof Cember_Chevron_MaterialProperty &&
            (other as any)._ok_rengi?.equals?.(this._ok_rengi) === true &&
            (other as any)._serit_rengi?.equals?.(this._serit_rengi) === true &&
            (other as any)._ok_sayisi === this._ok_sayisi &&
            (other as any)._ok_uzunlugu === this._ok_uzunlugu &&
            (other as any)._serit_kalinlik_orani === this._serit_kalinlik_orani
        );
    }
}