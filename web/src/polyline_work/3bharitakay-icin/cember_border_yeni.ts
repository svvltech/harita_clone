/*
czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);
    material.normal = vec3(0.0, 0.0, 1.0);
    material.alpha = 1.0;
    
    vec2 st = materialInput.st;
    
    float isInside = 0.0;
    float isArrow = 0.0;       // DIŞ MASKE (İç dolgu + Kenarlık)
    float isArrowInner = 0.0;  // İÇ MASKE (Sadece saf ok dolgusu)

    float count = floor(arrowCount);
    float spacing = 1.0 / max(count, 1.0);

    // --- 1. FWIDTH SİHRİ VE FREN SİSTEMİ ---
    // Ekranda istenen piksel kalınlığını harita koordinatına çeviriyoruz
    float idealBorderS = borderWidth * fwidth(st.s); 
    float idealBorderT = borderWidth * fwidth(st.t); 

    // Kamera çok uzaklaştığında kenarlığın okun içini yutmaması için 
    // ulaşabileceği maksimum kalınlığa sınır (fren) koyuyoruz
    float borderS = min(idealBorderS, 0.02); 
    float borderT = min(idealBorderT, 0.05); 

    // --- 2. GÜVENLİK PAYI (SAFE SCALE) ---
    // Kenarlık tuvalin sınırına çarpmadan önce, okun iskeletini hafifçe daraltıyoruz
    float safeScale = max(1.0 - (borderT * 3.0), 0.1); 

    // Orijinal ölçüleri güvenlik payı ile yeniden boyutlandırıyoruz
    float arrowWidth = 0.07 * safeScale;
    float arrowBody = 0.03 * safeScale; 
    float arrowHalfHeight = (0.5 * 1.5) * safeScale;
    float bodyThickness = 0.2 * safeScale;

    // --- 3. OKLARI ÇİZME DÖNGÜSÜ ---
    for(int i = 0; i < 8; i++){
        if(float(i) >= count) break;
        float start = float(i) * spacing;
        float bodyEnd = start + arrowBody;
        float end = bodyEnd + arrowWidth;

        // A) GÖVDE (BODY) HESAPLAMALARI
        // Dış Maske: Sınırları border kadar "Dışarıya" doğru esnettik
        if (st.s >= start - borderS && st.s <= bodyEnd + borderS && abs(st.t - 0.5) < bodyThickness + borderT) {
            isArrow = 1.0; 
            
            // İç Maske: Daraltılmış temiz gövde alanı
            if (st.s >= start && st.s <= bodyEnd && abs(st.t - 0.5) < bodyThickness) {
                isArrowInner = 1.0; 
            }
        }

        // B) ÜÇGEN (HEAD) HESAPLAMALARI
        if (st.s >= bodyEnd - borderS && st.s <= end + borderS * 2.0) {
            float dx = (st.s - bodyEnd) / (end - bodyEnd);
            float base = 0.785 - dx;
            float shaped = pow(max(base, 0.0), 1.3);
            float taperFactor = mix(1.0, 0.9, clamp(dx, 0.0, 1.0));
            
            // İç kavis (Orijinal) ve Dış kavis (Border kadar büyütülmüş)
            float maxY = arrowHalfHeight * shaped * taperFactor;
            float outerMaxY = maxY + borderT;
            
            // Okun matematiksel formüldeki gerçek bitiş noktası
            float actualEnd = bodyEnd + (0.785 * arrowWidth);

            // Dış Maske
            if (abs(st.t - 0.5) < outerMaxY && st.s <= actualEnd + borderS * 2.0) {
                isArrow = 1.0; 
                
                // İç Maske
                if (abs(st.t - 0.5) < maxY && st.s >= bodyEnd && st.s <= actualEnd) {
                    isArrowInner = 1.0; 
                }
            }
        }
    }
    
    // --- 4. ARKA PLAN ÇİZGİSİ (YOL) ---
    isInside = max(isInside, isArrow); 
    if(abs(st.t - 0.5) < 0.3){
        isInside = max(isInside, 0.5); 
    }

    // --- 5. RENK KATMANLARINI BİRLEŞTİRME ---
    vec3 finalColor;
    float baseAlpha;

    if (isArrowInner > 0.5) {
        // En İçte: Dolgu Rengi
        finalColor = arrowColor.rgb;     
        baseAlpha = 1.0;
    } else if (isArrow > 0.5) {
        // Dışta: Kenarlık (Border) Rengi
        finalColor = borderColor.rgb;    
        baseAlpha = 1.0;
    } else if (isInside > 0.0) {
        // Arka Planda: Çizgi Rengi
        finalColor = circleColor.rgb;    
        baseAlpha = cemberSaydamlik;
    } else {
        // Boşluk
        finalColor = vec3(0.0);
        baseAlpha = 0.0;
    }

    material.diffuse = finalColor;
    material.alpha = baseAlpha;
    return material;
}
*/



// 08.04.26 icten border
/*
czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);
    material.normal = vec3(0.0, 0.0, 1.0);
    material.alpha = 1.0;
    
    vec2 st = materialInput.st;
    
    float isInside = 0.0;
    float isArrow = 0.0;       
    float isArrowInner = 0.0;  

    float count = floor(arrowCount);
    float spacing = 1.0 / max(count, 1.0);

    float borderS = borderWidth * fwidth(st.s); 
    float borderT = borderWidth * fwidth(st.t); 

    // --- ORİJİNAL ÖLÇÜLER (KÜÇÜLTME YOK) ---
    float arrowWidth = 0.07;
    float arrowBody = 0.03; 
    float arrowHalfHeight = 0.5 * 1.5; // (0.75 yükseklik çarpanı)
    float bodyThickness = 0.2;

    // TAVAN SINIRI (Sihirli Dokunuş): Beyaz dolgunun çıkabileceği maksimum yükseklik
    float innerCeiling = 0.5 - borderT;

    for(int i = 0; i < 8; i++){
        if(float(i) >= count) break;
        float start = float(i) * spacing;
        float bodyEnd = start + arrowBody;
        float end = bodyEnd + arrowWidth;

        // ==========================================
        // A) GÖVDE (BODY) 
        // ==========================================
        if (st.s >= start && st.s <= bodyEnd && abs(st.t - 0.5) < bodyThickness) {
            isArrow = 1.0; // Dış maske (Siyah)
            
            float innerBodyY = max(bodyThickness - borderT, 0.0);
            
            // min(innerBodyY, innerCeiling) -> Tavana çarpmasını engeller
            if (st.s >= start + borderS && st.s <= bodyEnd && abs(st.t - 0.5) < min(innerBodyY, innerCeiling)) {
                isArrowInner = 1.0; // İç maske (Beyaz)
            }
        }

        // ==========================================
        // B) ÜÇGEN (HEAD) 
        // ==========================================
        if (st.s >= bodyEnd && st.s <= end) {
            float dx = (st.s - bodyEnd) / (end - bodyEnd);
            float base = 0.785 - dx;
            float shaped = pow(max(base, 0.0), 1.3);
            float taperFactor = mix(1.0, 0.9, clamp(dx, 0.0, 1.0));
            
            float maxY = arrowHalfHeight * shaped * taperFactor;
            float actualEnd = bodyEnd + (0.785 * arrowWidth);

            // DIŞ MASKE (Tavana 0.50'de çarpıp doğal olarak kesilir)
            if (abs(st.t - 0.5) < maxY && st.s <= actualEnd) {
                isArrow = 1.0; 
                
                // İÇ MASKE
                float innerMaxY = maxY - (borderT * 1.5); 
                
                // min(innerMaxY, innerCeiling) -> Kulakçıkların uçlarında beyaz dolguyu durdurup border'a yer açar!
                if (innerMaxY > 0.0 && abs(st.t - 0.5) < min(innerMaxY, innerCeiling) && st.s >= bodyEnd) {
                    isArrowInner = 1.0; 
                }
            }
        }
    }
    
    // --- 4. ARKA PLAN ÇİZGİSİ ---
    isInside = max(isInside, isArrow); 
    if(abs(st.t - 0.5) < 0.3){
        isInside = max(isInside, 0.5); 
    }

    // --- 5. RENK BİRLEŞTİRME ---
    vec3 finalColor;
    float baseAlpha;

    if (isArrowInner > 0.5) {
        finalColor = arrowColor.rgb;     
        baseAlpha = 1.0;
    } else if (isArrow > 0.5) {
        finalColor = borderColor.rgb;    
        baseAlpha = 1.0;
    } else if (isInside > 0.0) {
        finalColor = circleColor.rgb;    
        baseAlpha = cemberSaydamlik;
    } else {
        finalColor = vec3(0.0);
        baseAlpha = 0.0;
    }

    material.diffuse = finalColor;
    material.alpha = baseAlpha;
    return material;
}

*/