source: `
                        uniform vec4 arrowColor;   
                        uniform vec4 dashColor;
                        uniform float dashLength;
                        uniform float arrowLength;
                        uniform float minV;
                        uniform float maxV;
                        in float v_polylineAngle;

                        uniform vec4 borderColor;
                        uniform float borderWidth;

                        mat2 rotate(float rad) {
                            float c = cos(rad);
                            float s = sin(rad);
                            return mat2(c, s, -s, c);
                        }

                        float modp(float x, float len) {
                            float m = mod(x, len);
                            return m < 0.0 ? m + len : m;
                        }

                        vec2 arrowMask(float u, float v, float bWidth, float pArrowLen) {
                            const float bodyFrac = 0.30;
                            const float bodyH    = 0.35;
                            float halfBody = bodyH * 0.5;
                            float c = abs(v - 0.5);

                            // --- DIŞ MASKE (Sabit ve Kusursuz Sınır) ---
                            float inBodyU = 1.0 - step(bodyFrac, u);
                            float inBodyV = 1.0 - step(halfBody, c);
                            float alphaBody = inBodyU * inBodyV; 

                            float b = clamp((u - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
                            float halfHead = 0.5 * (1.0 - b);
                            float inHeadU  = step(bodyFrac, u);
                            float inHeadV  = 1.0 - step(halfHead, c);
                            float alphaHead = inHeadU * inHeadV; 

                            float outerMask = clamp(max(alphaBody, alphaHead), 0.0, 1.0);

                            // ==========================================
                            // --- İÇ MASKE VE KUSURSUZ KALINLIK MATEMATİĞİ ---
                            // ==========================================
                            
                            // 1. SOL DİKEY KENAR (GPU clamp hatasını çözen analitik hesap)
                            float bWidthU = bWidth / pArrowLen;
                            
                            // 2. YATAY KENARLAR (Alt/Üst Gövde kalınlığı)
                            float fwV = max(fwidth(v), 1e-5);
                            float bWidthV = bWidth * fwV;
                            float innerHalfBody = max(halfBody - bWidthV, 0.0);

                            // 3. ÇAPRAZ EĞİMLİ KENARLAR (Dinamik Pisagor - Gerçek Geometri)
                            // A) Çizginin gerçek piksel yüksekliğini buluyoruz
                            float W = 1.0 / fwV; 
                            // B) Üçgen ucunun piksel uzunluğunu buluyoruz (1.0 - 0.30 = 0.70)
                            float L = pArrowLen * 0.70; 
                            // C) Çapraz çizginin ekran üzerindeki gerçek eğimi
                            float slope_px = (W * 0.5) / max(L, 1e-5);
                            // D) Pisagor teoremi ile dik kalınlık mesafesini buluyoruz
                            float offsetV_px = bWidth * sqrt(1.0 + slope_px * slope_px);
                            // E) Bu piksel mesafesini tekrar V uzayına çeviriyoruz
                            float bWidthV_diag = offsetV_px * fwV;

                            float innerHalfHead = max(halfHead - bWidthV_diag, 0.0);

                            // --- İÇ MASKELERİ BİRLEŞTİRME ---
                            float inBodyUInner = step(bWidthU, u) * (1.0 - step(bodyFrac, u));
                            float inBodyVInner = 1.0 - step(innerHalfBody, c);
                            float alphaBodyInner = inBodyUInner * inBodyVInner;

                            // Kulakçık dikey kenarının kalınlığı da bWidthU'dur (Sol kenarla %100 eşittir)
                            float innerHeadStartU = bodyFrac + (1.0 - inBodyVInner) * bWidthU;
                            
                            // Ucu kütleştiren yatay makas yok, uç kendi eğimiyle jilet gibi sivrilerek kapanır.
                            float inHeadUInner = step(innerHeadStartU, u); 
                            float inHeadVInner = 1.0 - step(innerHalfHead, c);
                            float alphaHeadInner = inHeadUInner * inHeadVInner;

                            float innerMask = clamp(max(alphaBodyInner, alphaHeadInner), 0.0, 1.0);

                            return vec2(outerMask, innerMask);
                        }

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            
                            vec2 st = materialInput.st;
                            vec2 pos = rotate(v_polylineAngle) * gl_FragCoord.xy;

                            float pixelDashLength  = max(dashLength  * czm_pixelRatio, 1.0);
                            float pixelArrowLength = max(arrowLength * czm_pixelRatio, 1.0);
                            float pixelSegmentLength = pixelDashLength + pixelArrowLength;
                            float xInSeg = modp(pos.x, pixelSegmentLength);

                            float inArrow = step(pixelDashLength, xInSeg);

                            float u = clamp((xInSeg - pixelDashLength) / pixelArrowLength, 0.0, 1.0);
                            float v = st.t;

                            // **** Maskeleri hesapla (Dinamik Pisagor için uzunluk parametresi eklendi) ****
                            vec2 masks = arrowMask(u, v, borderWidth, pixelArrowLength);
                            float outerMask = masks.x; // (1 = Okun kapladığı tüm alan, 0 = Dış dünya)
                            float innerMask = masks.y; // (1 = Okun içindeki dolgu alanı, 0 = Kenarlık veya dış dünya)

                            float a = inArrow * outerMask; 

                            // Okun KENDİ içindeki rengini belirle (İç maske 1 ise ok rengi, 0 ise kenarlık rengi)
                            vec4 currentArrowColor = mix(borderColor, arrowColor, innerMask);
                    
                            // Genel resmi boya (Ok bölgesindeysek 'a=1' az önce bulduğumuz ok rengini, değilsek arka plan çizgisini boya)
                            vec4 outColor = mix(dashColor, currentArrowColor, a);

                            // Sadece arka plan (dash) kısmı için V aralığı dışında alpha sıfırla
                            float vClip = step(minV, v) * step(v, maxV);
                            if (a <= 0.0) {
                                outColor.a *= vClip;
                            }

                            outColor = czm_antialias(vec4(0.0), outColor, outColor, min(st.t, 1.0 - st.t));
                            outColor = czm_gammaCorrect(outColor);

                            material.diffuse = outColor.rgb;
                            material.alpha   = outColor.a;
                            return material;
                        }
                    `




//////////////////////////////


/**
 source: `
                        uniform vec4 arrowColor;   
                        uniform vec4 dashColor;
                        uniform float dashLength;
                        uniform float arrowLength;
                        uniform float minV;
                        uniform float maxV;
                        in float v_polylineAngle;

                        uniform vec4 borderColor;
                        uniform float borderWidth;

                        mat2 rotate(float rad) {
                            float c = cos(rad);
                            float s = sin(rad);
                            return mat2(c, s, -s, c);
                        }

                        float modp(float x, float len) {
                            float m = mod(x, len);
                            return m < 0.0 ? m + len : m;
                        }

                        // TÜM SİHİR BURADA: Anti-Aliasing + Pisagor Kalınlığı
                        vec2 arrowMask(float u, float v, float bWidth, float pArrowLen) {
                            const float bodyFrac = 0.30;
                            const float bodyH    = 0.35;
                            float halfBody = bodyH * 0.5;
                            float c = abs(v - 0.5);

                            // 1. Ortak Piksel Yumuşatma Payları (Fwidth)
                            float fwU = max(fwidth(u), 1e-5);
                            float fwC = max(fwidth(c), 1e-5);

                            // ==========================================
                            // --- DIŞ MASKE (BORDER DIŞ SINIRI) ---
                            // ==========================================
                            float inBodyU_outer = 1.0 - smoothstep(bodyFrac - fwU, bodyFrac + fwU, u);
                            float inBodyV_outer = 1.0 - smoothstep(halfBody - fwC, halfBody + fwC, c);
                            float alphaBodyOuter = inBodyU_outer * inBodyV_outer; 

                            float b = clamp((u - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
                            float halfHead = 0.5 * (1.0 - b);
                            
                            float inHeadU_outer = smoothstep(bodyFrac - fwU, bodyFrac + fwU, u);
                            // Dış Çapraz Çizgi İçin Eğik Fwidth
                            float fwHead_outer = max(fwidth(c - halfHead), 1e-5);
                            float inHeadV_outer = 1.0 - smoothstep(-fwHead_outer, fwHead_outer, c - halfHead);
                            float alphaHeadOuter = inHeadU_outer * inHeadV_outer; 

                            // Dış maskeyi (+) ile birleştir (Dikiş izi önleyici)
                            float outerMask = clamp(alphaBodyOuter + alphaHeadOuter, 0.0, 1.0);

                            // ==========================================
                            // --- İÇ MASKE (PİSAGORLU KUSURSUZ KALINLIK) ---
                            // ==========================================
                            float bWidthU = bWidth / pArrowLen;
                            float bWidthV = bWidth * fwC;
                            float innerHalfBody = max(halfBody - bWidthV, 0.0);

                            // Dinamik Pisagor ile Eğim Kalınlığı
                            float W = 1.0 / fwC; 
                            float L = pArrowLen * 0.70; 
                            float slope_px = (W * 0.5) / max(L, 1e-5);
                            float offsetV_px = bWidth * sqrt(1.0 + slope_px * slope_px);
                            float bWidthV_diag = offsetV_px * fwC;
                            float innerHalfHead = max(halfHead - bWidthV_diag, 0.0);

                            // Gövde İç Maskesi
                            float inBodyU_inner = smoothstep(bWidthU - fwU, bWidthU + fwU, u) * (1.0 - smoothstep(bodyFrac - fwU, bodyFrac + fwU, u));
                            float inBodyV_inner = 1.0 - smoothstep(innerHalfBody - fwC, innerHalfBody + fwC, c);
                            float alphaBodyInner = inBodyU_inner * inBodyV_inner;

                            // Üçgen İç Maskesi
                            float innerHeadStartU = bodyFrac + (1.0 - inBodyV_inner) * bWidthU;
                            float inHeadU_inner = smoothstep(innerHeadStartU - fwU, innerHeadStartU + fwU, u); 
                            
                            // İç Çapraz Çizgi İçin Eğik Fwidth
                            float fwHead_inner = max(fwidth(c - innerHalfHead), 1e-5);
                            float inHeadV_inner = 1.0 - smoothstep(-fwHead_inner, fwHead_inner, c - innerHalfHead);
                            float alphaHeadInner = inHeadU_inner * inHeadV_inner;

                            // İç maskeyi (+) ile birleştir (Dikiş izi önleyici)
                            float innerMask = clamp(alphaBodyInner + alphaHeadInner, 0.0, 1.0);

                            return vec2(outerMask, innerMask);
                        }

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            
                            vec2 st = materialInput.st;
                            vec2 pos = rotate(v_polylineAngle) * gl_FragCoord.xy;

                            float pixelDashLength  = max(dashLength  * czm_pixelRatio, 1.0);
                            float pixelArrowLength = max(arrowLength * czm_pixelRatio, 1.0);
                            float pixelSegmentLength = pixelDashLength + pixelArrowLength;
                            float xInSeg = modp(pos.x, pixelSegmentLength);

                            float inArrow = step(pixelDashLength, xInSeg);

                            float u = clamp((xInSeg - pixelDashLength) / pixelArrowLength, 0.0, 1.0);
                            float v = st.t;

                            // **** Maskeleri hesapla (pixelArrowLength dördüncü parametre olarak gönderiliyor) ****
                            vec2 masks = arrowMask(u, v, borderWidth, pixelArrowLength);
                            float outerMask = masks.x; 
                            float innerMask = masks.y; 

                            // Kenarları yumuşatılmış maskemizle rengi hesapla
                            float a = inArrow * outerMask; 
                            vec4 currentArrowColor = mix(borderColor, arrowColor, innerMask);
                            vec4 outColor = mix(dashColor, currentArrowColor, a);

                            float vClip = step(minV, v) * step(v, maxV);
                            if (a <= 0.0) {
                                outColor.a *= vClip;
                            }

                            outColor = czm_antialias(vec4(0.0), outColor, outColor, min(st.t, 1.0 - st.t));
                            outColor = czm_gammaCorrect(outColor);

                            material.diffuse = outColor.rgb;
                            material.alpha   = outColor.a;
                            return material;
                        }
                    `
 */



/*
/* 


vec2 arrowMask(float u, float v, float bWidth, float pArrowLen) {
    const float bodyFrac = 0.30;
    const float bodyH    = 0.35;
    float halfBody = bodyH * 0.5;
    float c = abs(v - 0.5);

    float fwU = max(fwidth(u), 1e-5);
    float fwC = max(fwidth(c), 1e-5);

    // --- EĞİM VE PİSAGOR ÇARPANLARI ---
    float W = 1.0 / fwC; 
    float L = pArrowLen * (1.0 - bodyFrac); 
    float slope_px = (W * 0.5) / max(L, 1e-5);
    
    // Eğimli yüzeylerin Anti-Aliasing (yumuşatma) payını ve kalınlığını hesaplıyoruz
    float slopeMultiplier = sqrt(1.0 + slope_px * slope_px);
    float fwHeadV = fwC * slopeMultiplier; // Eğimli fırça kalınlığı

    // ==========================================
    // --- DIŞ MASKE ---
    // ==========================================
    float inBodyU_outer = 1.0 - smoothstep(bodyFrac - fwU, bodyFrac + fwU, u);
    float inBodyV_outer = 1.0 - smoothstep(halfBody - fwC, halfBody + fwC, c);
    float alphaBodyOuter = inBodyU_outer * inBodyV_outer; 

    float b = clamp((u - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
    float halfHead = 0.5 * (1.0 - b);
    
    // Dış ucun yatay makası (1.0 noktasında yumuşakça kesiyoruz ki sızmasın)
    float inHeadU_outer = smoothstep(bodyFrac - fwU, bodyFrac + fwU, u) * (1.0 - smoothstep(1.0 - fwU, 1.0 + fwU, u));
    float inHeadV_outer = 1.0 - smoothstep(halfHead - fwHeadV, halfHead + fwHeadV, c);
    float alphaHeadOuter = inHeadU_outer * inHeadV_outer; 

    float outerMask = clamp(alphaBodyOuter + alphaHeadOuter, 0.0, 1.0);

    // ==========================================
    // --- İÇ MASKE ---
    // ==========================================
    float bWidthU = bWidth / pArrowLen;
    float bWidthV = bWidth * fwC;
    float innerHalfBody = max(halfBody - bWidthV, 0.0);

    float offsetV_px = bWidth * slopeMultiplier;
    float bWidthV_diag = offsetV_px * fwC;
    float innerHalfHead = max(halfHead - bWidthV_diag, 0.0);

    // Gövde İç
    float inBodyU_inner = smoothstep(bWidthU - fwU, bWidthU + fwU, u) * (1.0 - smoothstep(bodyFrac - fwU, bodyFrac + fwU, u));
    float inBodyV_inner = 1.0 - smoothstep(innerHalfBody - fwC, innerHalfBody + fwC, c);
    float alphaBodyInner = inBodyU_inner * inBodyV_inner;

    // İç üçgenin "Tam Sıfırlandığı" (bittiği) U noktasını buluyoruz
    float innerTipU = bodyFrac + (1.0 - 2.0 * bWidthV_diag) * (1.0 - bodyFrac);
    
    float innerHeadStartU = bodyFrac + (1.0 - inBodyV_inner) * bWidthU;
    
    // İç ucun yatay makası (Hesapladığımız sıfır noktasında sızıntıyı kesiyoruz)
    float inHeadU_inner = smoothstep(innerHeadStartU - fwU, innerHeadStartU + fwU, u) * (1.0 - smoothstep(innerTipU - fwU, innerTipU + fwU, u)); 
    float inHeadV_inner = 1.0 - smoothstep(innerHalfHead - fwHeadV, innerHalfHead + fwHeadV, c);
    float alphaHeadInner = inHeadU_inner * inHeadV_inner;

    float innerMask = clamp(alphaBodyInner + alphaHeadInner, 0.0, 1.0);

    return vec2(outerMask, innerMask);
}
    
*/