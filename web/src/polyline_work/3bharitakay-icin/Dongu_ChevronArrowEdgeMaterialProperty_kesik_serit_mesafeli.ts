import * as Cesium from "cesium";

// arrowLength e 1 adet chevron arrow için gereken piksel mesafesini ver
// arrowcount a kaç adet chevron arrow istediğini ver
// dashcount a kaç adet kesik siyah çizgi istediğini ver
// uniformdaki değerleri yoruma aldım çünkü ilk çalıştığında class a değerleri atamadıysan bu değerleri kullanıyor 
export class Uclu_dongu_ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli implements Cesium.MaterialProperty {
    private _arrowColor: Cesium.Property;
    private _dashColor: Cesium.Property;
    private _definitionChanged: Cesium.Event;
    private _dashCount: number;
    private _arrowCount: number;
    private _dashLength: number;
    private _arrowLength: number;

    constructor(
        arrowColor: Cesium.Color,
        dashColor: Cesium.CallbackProperty,
        dashCount: number = 4.0 ,
        arrowCount: number = 3.0,
        dashLength: number = 48.0,
        arrowLength: number = 12.0
    ) {
        this._arrowColor = new Cesium.ConstantProperty(arrowColor);
        this._dashColor = dashColor;
        this._definitionChanged = new Cesium.Event();
        this._dashCount = dashCount;
        this._arrowCount = arrowCount;
        this._dashLength = dashLength;
        this._arrowLength = arrowLength;

        if (!(Cesium.Material as any)._materialCache._materials["Uclu_dongu_ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli"]) {
            (Cesium.Material as any)._materialCache.addMaterial("Uclu_dongu_ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli", {
                fabric: {
                    type: "Uclu_dongu_ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.fromBytes(239, 12, 249, 255),
                        dashLength,//: 48.0,   // Senin belirlediğin değer
                        arrowLength,//: 12.0,  // 1 ok için uzunluk
                        minV: 0.30, 
                        maxV: 0.70,
                        middleDashColor: Cesium.Color.BLACK,
                        dashCount,//: 4.0,
                        arrowCount,//: 3.0
                    },
                    source: `
                        uniform vec4 arrowColor;
                        uniform vec4 dashColor;
                        uniform vec4 middleDashColor;
                        uniform float dashLength;
                        uniform float arrowLength;
                        uniform float minV;
                        uniform float maxV;
                        uniform float dashCount;
                        uniform float arrowCount;
                        in float v_polylineAngle;

                        mat2 rotate(float rad) {
                            float c = cos(rad);
                            float s = sin(rad);
                            return mat2(c, s, -s, c);
                        }

                        float modp(float x, float len) {
                            float m = mod(x, len);
                            return m < 0.0 ? m + len : m;
                        }

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            vec2 st = materialInput.st;

                            vec2 pos = rotate(v_polylineAngle) * gl_FragCoord.xy;
                            float pixelDashLength  = max(dashLength  * czm_pixelRatio, 1.0);
                            float pixelArrowLength = max(arrowLength * czm_pixelRatio, 1.0);
                            float pixelSegmentLength = pixelDashLength + (pixelArrowLength * arrowCount);
                            
                            float xInSeg = modp(pos.x, pixelSegmentLength);

                            float fwX = max(fwidth(pos.x), 1e-5);
                            float blurX = fwX * 0.5;
                            float inArrow = smoothstep(pixelDashLength - blurX, pixelDashLength + blurX, xInSeg) * (1.0 - smoothstep(pixelSegmentLength - blurX, pixelSegmentLength + blurX, xInSeg));

                            // u_full: 0.0'dan 3.0'a kadar giden ana koordinatımız
                            float u_full = clamp((xInSeg - pixelDashLength) / pixelArrowLength, 0.0, 3.0);
                            float v = st.t;
                            
                            float foldV = abs(v - 0.5) * 2.0;
                            
                            float fwU = max(fwX / pixelArrowLength, 1e-5); 
                            float fwV = max(fwidth(v) * 2.0, 1e-5); 
                            
                            float blurU = fwU * 0.5; 
                            float blurV = fwV * 0.5;

                            // ==========================================
                            // 1D ANALİTİK CHEVRON (DÖNGÜ İLE DAHA TEMİZ)
                            // ==========================================
                            float slope = 0.4; 

                            float lOut = 0.4 - slope * foldV;
                            float rOut = 1.0 - slope * foldV;
                            float lInn = 0.5 - slope * foldV;
                            float rInn = 0.9 - slope * foldV;

                            float alphaOuter = 0.0;
                            float alphaInner = 0.0;

                            // 3'lü döngü (GPU bunu arkada unroll eder, kesinti veya yavaşlama olmaz)
                            for (int i = 0; i < 3; i++) {
                                if (float(i) >= arrowCount) break;
                                
                                float shift = float(i);
                                float outer = smoothstep(lOut + shift - blurU, lOut + shift + blurU, u_full) * (1.0 - smoothstep(rOut + shift - blurU, rOut + shift + blurU, u_full));                                             
                                float inner = smoothstep(lInn + shift - blurU, lInn + shift + blurU, u_full) * (1.0 - smoothstep(rInn + shift - blurU, rInn + shift + blurU, u_full));
                                
                                alphaOuter += outer;
                                alphaInner += inner;
                            }

                            float innerCapV = 1.0 - smoothstep(0.8 - blurV, 0.8 + blurV, foldV);

                            alphaOuter = clamp(alphaOuter, 0.0, 1.0) * inArrow;
                            alphaInner = clamp(alphaInner, 0.0, 1.0) * innerCapV * inArrow;

                            vec4 dashCol = dashColor;
                            vec4 arrowCol = arrowColor;
                            vec4 blackCol = vec4(0.0, 0.0, 0.0, 1.0);
                            
                            // --- ARKA PLAN (Kesikli Şerit) ---
                            float blurZemin = max(fwidth(v), 1e-5) * 0.5;
                            float midV = (minV + maxV) * 0.5;
                            float stripeThickness = (maxV - minV) * 0.4;
                            float bStart = midV - (stripeThickness * 0.5);
                            float bEnd = midV + (stripeThickness * 0.5);

                            float verticalStripeMask = smoothstep(bStart - blurZemin, bStart + blurZemin, v) - smoothstep(bEnd - blurZemin, bEnd + blurZemin, v);

                            float visualGap = pixelDashLength + 0.4 * pixelArrowLength;

                            float dCount = max(floor(dashCount), 1.0); 
                            float totalParts = 2.0 * dCount + 1.0;
                            
                            float unitLength = visualGap / totalParts;

                            //float x_shifted = xInSeg - 0.5 * unitLength;
                            //float m = modp(x_shifted, 2.0 * unitLength);
                            //float distToDashEdge = 0.5 * unitLength - abs(m - unitLength);
                            float distToDashEdge = unitLength * (0.5 - abs(fract(xInSeg / (2.0 * unitLength) - 0.25) * 2.0 - 1.0));
                            
                            float horizontalStripeMask = smoothstep(-blurX, blurX, distToDashEdge);

                            float finalStripeFactor = verticalStripeMask * horizontalStripeMask;

                            vec4 baseColor = mix(dashCol, middleDashColor, finalStripeFactor);
                            
                            float edgeAlpha = smoothstep(minV - blurZemin, minV + blurZemin, v) * (1.0 - smoothstep(maxV - blurZemin, maxV + blurZemin, v));
                            baseColor.a *= edgeAlpha;

                            // --- KATMANLI RENK BİRLEŞTİRME --
                            vec4 outColor = baseColor;
                            outColor = mix(outColor, blackCol, alphaOuter); 
                            outColor = mix(outColor, arrowCol, alphaInner); 

                            outColor = czm_gammaCorrect(outColor);

                            material.diffuse = outColor.rgb;
                            material.alpha   = outColor.a;
                            return material;
                        }
                    `
                },
                translucent: () => true
            });
        }
    }

    get isConstant(): boolean {
        const ac = (this._arrowColor as any)?.isConstant ?? true;
        const dc = (this._dashColor as any)?.isConstant ?? true;
        return ac && dc;
    }

    get definitionChanged(): Cesium.Event { return this._definitionChanged; }
    getType(_time: Cesium.JulianDate): string { return "Uclu_dongu_ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli"; }

    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.arrowColor = this._arrowColor.getValue(time);
        result.dashColor = this._dashColor.getValue(time);
        result.dashCount = this._dashCount;
        result.arrowCount = this._arrowCount;
        result.dashLength = this._dashLength;
        result.arrowLength = this._arrowLength;
        return result;
    }

    equals(other: Cesium.MaterialProperty): boolean {
        return (
            other instanceof Uclu_dongu_ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli &&
            (other as any)._arrowColor?.equals?.(this._arrowColor) === true &&
            (other as any)._dashColor?.equals?.(this._dashColor) === true &&
            (other as any)._dashCount === this._dashCount &&
            (other as any)._arrowCount === this._arrowCount &&
            (other as any)._dashLength === this._dashLength &&
            (other as any)._arrowLength === this._arrowLength
        );
    }
}

//Uclu_dongu_ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli TÜRKÇESİ

// Ok (Chevron) ve kesik çizgileri bir arada çizen dinamik materyal sınıfı
// arrowLength e 1 adet chevron arrow için gereken piksel mesafesini ver
// arrowcount a kaç adet chevron arrow istediğini ver
// dashcount a kaç adet kesik siyah çizgi istediğini ver
// uniformdaki değerleri yoruma aldım çünkü ilk çalıştığında class a değerleri atamadıysan bu değerleri kullanıyor 
export class Dongu_ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli implements Cesium.MaterialProperty {
    private _ok_rengi: Cesium.Property;              // eski: _arrowColor
    private _serit_rengi: Cesium.Property;           // eski: _dashColor
    private _tanim_degisti: Cesium.Event;            // eski: _definitionChanged
    private _kesik_cizgi_sayisi: number;             // eski: _dashCount
    private _ok_sayisi: number;                      // eski: _arrowCount
    private _kesik_cizgi_uzunlugu: number;           // eski: _dashLength
    private _ok_uzunlugu: number;                    // eski: _arrowLength

    constructor(
        ok_rengi: Cesium.Color,                               // Okların ana rengi (eski: arrowColor)
        serit_rengi: Cesium.CallbackProperty,  // Kesikli şeridin rengi (eski: dashColor)
        kesik_cizgi_sayisi: number = 4.0,                     // Gösterilecek siyah boşluk bölüntü sayısı (eski: dashCount)
        ok_sayisi: number = 3.0,                              // Çizilecek peş peşe ok sayısı (eski: arrowCount)
        kesik_cizgi_uzunlugu: number = 48.0,                  // Kesik çizgi bölümüne ayrılan piksel (eski: dashLength)
        ok_uzunlugu: number = 12.0                            // Sadece 1 adet ok için ayrılan piksel (eski: arrowLength)
    ) {
        // Parametreleri sınıf değişkenlerine atıyoruz
        this._ok_rengi = new Cesium.ConstantProperty(ok_rengi);
        this._serit_rengi = serit_rengi;
        this._tanim_degisti = new Cesium.Event();
        this._kesik_cizgi_sayisi = kesik_cizgi_sayisi;
        this._ok_sayisi = ok_sayisi;
        this._kesik_cizgi_uzunlugu = kesik_cizgi_uzunlugu;
        this._ok_uzunlugu = ok_uzunlugu;

        // Cesium'un materyal önbelleğinde (cache) bu materyal yoksa, oluşturup ekliyoruz.
        if (!(Cesium.Material as any)._materialCache._materials["Dongu_ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli"]) {
            (Cesium.Material as any)._materialCache.addMaterial("Dongu_ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli", {
                fabric: {
                    type: "Dongu_ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli",
                    uniforms: {
                        // Shader içine gönderilecek dış değişkenler (Uniforms)
                        ok_rengi: Cesium.Color.WHITE,                            // eski: arrowColor
                        serit_rengi: Cesium.Color.fromBytes(239, 12, 249, 255),  // eski: dashColor
                        kesik_cizgi_uzunlugu: kesik_cizgi_uzunlugu,              // eski: dashLength
                        ok_uzunlugu: ok_uzunlugu,                                // eski: arrowLength
                        min_v: 0.30,                                             // Şeridin alt kesim sınırı (eski: minV)
                        max_v: 0.70,                                             // Şeridin üst kesim sınırı (eski: maxV)
                        orta_serit_rengi: Cesium.Color.BLACK,                    // Kesik çizgilerdeki boşluk rengi (eski: middleDashColor)
                        kesik_cizgi_sayisi: kesik_cizgi_sayisi,                  // eski: dashCount
                        ok_sayisi: ok_sayisi                                     // eski: arrowCount
                    },
                    source: `
                        // Shader (GLSL) Kodu Başlangıcı
                        uniform vec4 ok_rengi;               // eski: arrowColor
                        uniform vec4 serit_rengi;            // eski: dashColor
                        uniform vec4 orta_serit_rengi;       // eski: middleDashColor
                        uniform float kesik_cizgi_uzunlugu;  // eski: dashLength
                        uniform float ok_uzunlugu;           // eski: arrowLength
                        uniform float min_v;                 // eski: minV
                        uniform float max_v;                 // eski: maxV
                        uniform float kesik_cizgi_sayisi;    // eski: dashCount
                        uniform float ok_sayisi;             // eski: arrowCount
                        
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

                        // Ana materyal hesaplama fonksiyonu (Cesium standartıdır, ismi değiştirilemez)
                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            vec2 st = materialInput.st; // Çizginin lokal 2D koordinatı

                            // Piksel koordinatlarını çizginin yönüne göre hizala (eski: pos)
                            vec2 pozisyon = dondur(v_polylineAngle) * gl_FragCoord.xy;
                            
                            // Ekran ölçeğine göre piksel uzunluklarını ayarla
                            float piksel_cizgi_uzn = max(kesik_cizgi_uzunlugu * czm_pixelRatio, 1.0); // eski: pixelDashLength
                            float piksel_ok_uzn = max(ok_uzunlugu * czm_pixelRatio, 1.0); // eski: pixelArrowLength
                            
                            // Tam bir döngü alanının uzunluğu (eski: pixelSegmentLength)
                            float piksel_segment_uzn = piksel_cizgi_uzn + (piksel_ok_uzn * ok_sayisi);
                            
                            // Mevcut pikselin tekrar eden segment içindeki yeri (eski: xInSeg)
                            float segment_ici_x = mod_pozitif(pozisyon.x, piksel_segment_uzn);

                            // Anti-aliasing (kenar yumuşatma) için yatay pay (eski: fwX ve blurX)
                            float x_yumusatma_payi = max(fwidth(pozisyon.x), 1e-5); 
                            float x_bulanikligi = x_yumusatma_payi * 0.5;
                            
                            // Pikselin ok bölgesinde mi olduğunu belirleyen maske (eski: inArrow)
                            float ok_alaninda_mi = smoothstep(piksel_cizgi_uzn - x_bulanikligi, piksel_cizgi_uzn + x_bulanikligi, segment_ici_x) * (1.0 - smoothstep(piksel_segment_uzn - x_bulanikligi, piksel_segment_uzn + x_bulanikligi, segment_ici_x));

                            // Ok alanına özel normalize edilmiş yatay (x eksenindeki) bölgesel koordinat. 
                            // Çizilecek her ok için ardışık olarak 0'dan 1'e, 1'den 2'ye vb. ilerler. (eski: u_full / u_tam)
                            float ok_yatay_koordinati = clamp((segment_ici_x - piksel_cizgi_uzn) / piksel_ok_uzn, 0.0, ok_sayisi);
                            
                            // Dikey (y eksenindeki) lokasyon. Çizginin en üstü 0, en altı 1'dir.
                            float v = st.t; 
                            
                            // Okların (Chevron) "V" şeklinde katlanıp geriye yatık çizilebilmesi için orta noktadan (0.5) 
                            // kenarlara doğru (0.0 ve 1.0) uzaklığı ölçüyoruz. Merkezde (0.5) değer 0, kenarlarda 1 olur. (eski: foldV / katlanmis_v)
                            float v_merkezden_sapma_orani = abs(v - 0.5) * 2.0;
                            
                            // Kenar yumuşatma (anti-aliasing) için piksel başına kullanılacak bulanıklık değerleri
                            float u_yumusatma = max(x_yumusatma_payi / piksel_ok_uzn, 1e-5); // eski: fwU
                            float v_yumusatma = max(fwidth(v) * 2.0, 1e-5);                  // eski: fwV
                            float u_bulaniklik = u_yumusatma * 0.5;                          // eski: blurU
                            float v_bulaniklik = v_yumusatma * 0.5;                          // eski: blurV

                            // ==========================================
                            // 1D ANALİTİK OK (CHEVRON) ÇİZİM BÖLÜMÜ
                            // ==========================================
                            // Çizgiyi dik kesen düz bir dikdörtgen yerine, "> > >" şeklinde bir ok çizmek 
                            // için v_merkezden_sapma_orani ile pikseli ne kadar geriye iteceğimizi belirliyoruz.
                            float ok_yatiklik_derecesi = 0.4; // Ok kanatlarının geriye yatıklık açısı (eski: slope / egim)

                            // Tek bir okun kalınlığını belirleyen SİYAH dış çerçevenin sınırları
                            float sol_dis_sinir = 0.4 - ok_yatiklik_derecesi * v_merkezden_sapma_orani; // eski: lOut / sol_dis
                            float sag_dis_sinir = 1.0 - ok_yatiklik_derecesi * v_merkezden_sapma_orani; // eski: rOut / sag_dis
                            
                            // Tek bir okun BEYAZ gövdesinin sınırları (siyah kenarlık olabilmesi için biraz içeriden başlar)
                            float sol_ic_sinir = 0.5 - ok_yatiklik_derecesi * v_merkezden_sapma_orani;  // eski: lInn / sol_ic
                            float sag_ic_sinir = 0.9 - ok_yatiklik_derecesi * v_merkezden_sapma_orani;  // eski: rInn / sag_ic

                            float ok_siyah_kenarlik_maskesi = 0.0; // Tüm okların siyah kenarlık sınırına giren piksellerin toplamı (eski: alphaOuter / dis_maske_toplam)
                            float ok_beyaz_govde_maskesi = 0.0;  // Tüm okların iç gövdesine (beyaz bölgeye) giren piksellerin toplamı (eski: alphaInner / ic_maske_toplam)

                            // Dinamik ok (chevron) çizim döngüsü
                            // İhtiyaç duyulan ok sayısı kadar aynı oku yatay koordinatta (+1 birim) kaydırarak art arda çizeriz.
                            const int MAKS_OK_SAYISI = 15; 
                            for (int i = 0; i < MAKS_OK_SAYISI; i++) {
                                // İstenen ok sayısına ulaşılınca döngüyü kırar ki GPU boşuna fazladan yorulmasın
                                if (float(i) >= ok_sayisi) break;
                                
                                float kaydirma_payi = float(i); // Oku sağa doğru 1'er 1'er kaydırmak için eklenecek değer (eski: shift / kaydirma)
                                
                                // O anki piksel, o loop'taki belirli bir okun SİYAH dış kenarlığı içinde mi? (1 = içinde, 0 = dışında) (eski: outer / dis_maske)
                                float current_siyah_icinde_mi = smoothstep(sol_dis_sinir + kaydirma_payi - u_bulaniklik, sol_dis_sinir + kaydirma_payi + u_bulaniklik, ok_yatay_koordinati) * 
                                                                (1.0 - smoothstep(sag_dis_sinir + kaydirma_payi - u_bulaniklik, sag_dis_sinir + kaydirma_payi + u_bulaniklik, ok_yatay_koordinati));
                                                              
                                // O anki piksel, o loop'taki okta BEYAZ gövdenin bulunduğu kısımda mı? (eski: inner / ic_maske)
                                float current_beyaz_icinde_mi = smoothstep(sol_ic_sinir + kaydirma_payi - u_bulaniklik, sol_ic_sinir + kaydirma_payi + u_bulaniklik, ok_yatay_koordinati) * 
                                                                (1.0 - smoothstep(sag_ic_sinir + kaydirma_payi - u_bulaniklik, sag_ic_sinir + kaydirma_payi + u_bulaniklik, ok_yatay_koordinati));
                                
                                ok_siyah_kenarlik_maskesi += current_siyah_icinde_mi;
                                ok_beyaz_govde_maskesi += current_beyaz_icinde_mi;
                            }

                            // V şekli sebebiyle okların en sivri uç noktası (dikey merkez) çok ince bir çizgiye dönüşüp bozulabilir.
                            // Bu bozulmayı engellemek için, ucun merkezini koruyucu bir maskeyle hafifçe tıraşlıyoruz. (eski: innerCapV / ic_kapak_v)
                            float ok_sivri_ucu_kirpma = 1.0 - smoothstep(0.8 - v_bulaniklik, 0.8 + v_bulaniklik, v_merkezden_sapma_orani);

                            // Maskeleri en fazla 1 olacak şekilde sınırlıyoruz (Üst üste binmeden kaynaklı siyah bozulmaları engeller)
                            // "ok_alaninda_mi" çarpımı ok bölgesinden dışarı sızan hatalı hesaplamaları komple siler/bastırır.
                            ok_siyah_kenarlik_maskesi = clamp(ok_siyah_kenarlik_maskesi, 0.0, 1.0) * ok_alaninda_mi;
                            ok_beyaz_govde_maskesi = clamp(ok_beyaz_govde_maskesi, 0.0, 1.0) * ok_sivri_ucu_kirpma * ok_alaninda_mi;

                            // Renk tanımlamaları
                            vec4 renk_serit = serit_rengi;              // eski: dashCol
                            vec4 renk_ok = ok_rengi;                    // eski: arrowCol
                            vec4 renk_siyah = vec4(0.0, 0.0, 0.0, 1.0); // eski: blackCol
                            
                            // ==========================================
                            // ARKA PLAN KESİKLİ ŞERİT BÖLÜMÜ
                            // ==========================================
                            float zemin_bulaniklik = max(fwidth(v), 1e-5) * 0.5; // Arka plan şeridinin anti-aliasing payı (eski: blurZemin)
                            float dikey_merkez = (min_v + max_v) * 0.5;          // Çizginin tam dikey merkez noktası (eski: midV / orta_v)
                            float dikey_serit_kalinligi = (max_v - min_v) * 0.4; // Kesikli şeridin dikey kalınlık değeri (eski: stripeThickness / serit_kalinligi)
                            
                            // Yeşil arka plan şeridinin y (v) eksenindeki başlangıç/bitiş (üst/alt) sınırları (eski: bStart, bEnd / s_baslangic, s_bitis)
                            float v_ust_sinir = dikey_merkez - (dikey_serit_kalinligi * 0.5);
                            float v_alt_sinir = dikey_merkez + (dikey_serit_kalinligi * 0.5);

                            // Soru: Mevcut piksel, boydan boya uzanan tam bir dikey şerit hattının hizasında (altından-üstünden çıkmamış) yer alıyor mu? (eski: verticalStripeMask / dikey_serit_maskesi)
                            float ortadaki_kalin_serit_hizasinda_mi = smoothstep(v_ust_sinir - zemin_bulaniklik, v_ust_sinir + zemin_bulaniklik, v) - smoothstep(v_alt_sinir - zemin_bulaniklik, v_alt_sinir + zemin_bulaniklik, v);

                            // GÖRSEL BOŞLUK HESABI (Kilit Adım)
                            // 0.4 piksellik pay, okun "V" formunun içeri doğru kıvrım yapmasından dolayı oluşan görsel kaymayı kompanze eder. (eski: visualGap / gorsel_bosluk)
                            float gorsel_bosluk_mesafesi = piksel_cizgi_uzn + 0.4 * piksel_ok_uzn;

                            // Kullanıcının istediği boşluk sayısı üzerinden 2N + 1 orantısıyla toplam segment parçasını bulur (eski: dCount, totalParts / k_sayisi, toplam_parca)
                            float cizgi_sayisi = max(floor(kesik_cizgi_sayisi), 1.0);
                            float toplam_bolme_parcasi = 2.0 * cizgi_sayisi + 1.0;
                            
                            // Tam mesafenin segment miktarına bölünmesiyle hesaplanan tek bir çizgi veya boşluğun spesifik boyutu (eski: unitLength / birim_uzunluk)
                            float tek_bir_kesik_cizgi_uzunlugu = gorsel_bosluk_mesafesi / toplam_bolme_parcasi;

                            // MATEMATİKSEL SDF (Signed Distance Field) HİLESİ
                            // Mevcut x hizasının, kendi döngüsüne ait kesik çizginin en orta/merkez noktasına ne kadar uzakta olduğunu belirler. (eski: distToDashEdge / cizgi_kenari_mesafe)
                            float cizgi_merkezine_kalan_mesafe = tek_bir_kesik_cizgi_uzunlugu * (0.5 - abs(fract(segment_ici_x / (2.0 * tek_bir_kesik_cizgi_uzunlugu) - 0.25) * 2.0 - 1.0));
                            
                            // Soru: Kalan mesafe > 0 durumunda mıyız? O zaman piksel siyah kesik çizginin tamamen içindedir! (eski: horizontalStripeMask / yatay_serit_maskesi)
                            float yataydaki_kesik_cizgilerin_icinde_mi = smoothstep(-x_bulanikligi, x_bulanikligi, cizgi_merkezine_kalan_mesafe);

                            // Bu kısımdaki iki kuralın eşzamanlı birleşimi ile kesikli deseni çıkartırız:
                            // Şart 1) Dikey şeridin hizasında kalınacak
                            // Şart 2) Yataydaki siyah kesikli çizgi kutularının içinde olunacak (eski: finalStripeFactor / nihai_serit_carpani)
                            float kesik_orta_serit_icinde_mi = ortadaki_kalin_serit_hizasinda_mi * yataydaki_kesik_cizgilerin_icinde_mi;

                            // Zemin Rengi Harmanlama
                            // Eğer "kesik_orta_serit_icinde_mi" isek siyah boşluğu çiz, değilse normal uçuş şeridin renk tonunu ver. (eski: baseColor / zemin_rengi)
                            vec4 cizgi_zemin_rengi = mix(renk_serit, orta_serit_rengi, kesik_orta_serit_icinde_mi);
                            
                            // Şerit yanlarına doğru (üstten ve alttan dışarı çıkıldıkça) rengi pürüzsüzce şeffaflaştır. (eski: edgeAlpha / kenar_gecirgenligi)
                            float kenar_solma_efekti = smoothstep(min_v - zemin_bulaniklik, min_v + zemin_bulaniklik, v) * (1.0 - smoothstep(max_v - zemin_bulaniklik, max_v + zemin_bulaniklik, v));
                            cizgi_zemin_rengi.a *= kenar_solma_efekti;

                            // ==========================================
                            // KATMANLI RENK BİRLEŞTİRME (EN SON AŞAMA)
                            // ==========================================
                            // 1. Katman (En Alt Katman): Şeffaf/Siyah/Yeşil şerit ve kesik desenleri (eski: outColor / cikis_rengi)
                            vec4 nihai_cikis_rengi = cizgi_zemin_rengi; 
                            
                            // 2. Katman (Tampon Katman): Siyah ok kenarlıklarını bindir
                            nihai_cikis_rengi = mix(nihai_cikis_rengi, renk_siyah, ok_siyah_kenarlik_maskesi); 
                            
                            // 3. Katman (En Üst Katman): Saf beyaz Chevron ok gövdelerini bindir
                            nihai_cikis_rengi = mix(nihai_cikis_rengi, renk_ok, ok_beyaz_govde_maskesi); 

                            // Cesium standardı: Lineer renk uzayından sRGB'ye geçiş (ışık hatalarını ve renk kararmalarını önler)
                            nihai_cikis_rengi = czm_gammaCorrect(nihai_cikis_rengi);

                            // RGB (kırmızı/yeşil/mavi) ve Alpha (şeffaflık) değerlerini materyale devret ve çizimi noktala.
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

    // Özelliklerin sabit olup olmadığını kontrol eder.
    get isConstant(): boolean {
        const ok_ac = (this._ok_rengi as any)?.isConstant ?? true;
        const serit_dc = (this._serit_rengi as any)?.isConstant ?? true;
        return ok_ac && serit_dc;
    }

    get definitionChanged(): Cesium.Event { return this._tanim_degisti; }
    getType(_time: Cesium.JulianDate): string { return "Dongu_ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli"; }

    // Çizim sırasında uniformlara gönderilecek değerleri hazırlar
    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.ok_rengi = this._ok_rengi.getValue(time);
        result.serit_rengi = this._serit_rengi.getValue(time);
        result.kesik_cizgi_sayisi = this._kesik_cizgi_sayisi;
        result.ok_sayisi = this._ok_sayisi;
        result.kesik_cizgi_uzunlugu = this._kesik_cizgi_uzunlugu;
        result.ok_uzunlugu = this._ok_uzunlugu;
        return result;
    }

    // İki materyalin aynı olup olmadığını kontrol eder
    equals(other: Cesium.MaterialProperty): boolean {
        return (
            other instanceof Dongu_ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli &&
            (other as any)._ok_rengi?.equals?.(this._ok_rengi) === true &&
            (other as any)._serit_rengi?.equals?.(this._serit_rengi) === true &&
            (other as any)._kesik_cizgi_sayisi === this._kesik_cizgi_sayisi &&
            (other as any)._ok_sayisi === this._ok_sayisi &&
            (other as any)._kesik_cizgi_uzunlugu === this._kesik_cizgi_uzunlugu &&
            (other as any)._ok_uzunlugu === this._ok_uzunlugu
        );
    }
}