
/*

czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);

    material.normal = vec3(0.0, 0.0, 1.0);
    material.alpha = 1.0;
    
    vec2 st = materialInput.st;
    float isInside = 0.0;
    
    // ESKİDEN: Sadece isArrow vardı. 
    // YENİ: Şimdi bir de iç dolguyu takip etmek için isArrowInner ekledik.
    float isArrow = 0.0;
    float isArrowInner = 0.0; 

    float count = floor(arrowCount);
    float spacing = 1.0 / count;
    float arrowWidth = 0.07;
    float arrowBody = 0.03; 
    float arrowHalfHeight = 0.5 * 1.5;

    for(int i = 0; i < 8; i++){
        if(float(i) >= count) break;
        float start = float(i) * spacing;
        float bodyEnd = start + arrowBody;
        float end = bodyEnd + arrowWidth;

        // 1. GÖVDE (BODY) KONTROLÜ
        if(st.s >= start && st.s <= bodyEnd && abs(st.t - 0.5) < 0.2){
            isArrow = 1.0; // Burası dış maske (Orijinal kodun)

            // YENİ: İç Maske Kontrolü (Gövde için)
            // Soldan borderWidth * 1.5 kadar içeriden başla, dikeyden borderWidth kadar daralt.
            if (st.s >= start + (borderWidth * 1.5) && abs(st.t - 0.5) < max(0.2 - borderWidth, 0.0)) {
                isArrowInner = 1.0;
            }
        }
        
        // 2. ÜÇGEN (HEAD) KONTROLÜ
        else if(st.s >= bodyEnd && st.s <= end){
            float dx = (st.s - bodyEnd) / (end - bodyEnd);
            float base = 0.785 - dx; // Ufak düzeltme: basename yerine base yazdım
            float shaped = pow(max(base, 0.0), 1.3);
            float taperFactor = mix(1.0, 0.9, dx);
            float maxY = arrowHalfHeight * shaped * taperFactor;
            
            if(abs(st.t - 0.5) < maxY){
                isArrow = 1.0; // Burası dış maske (Orijinal kodun)

                // YENİ: İç Maske Kontrolü (Üçgen için)
                float innerMaxY = max(maxY - (borderWidth * 1.5), 0.0); // Dikeyden daralt
                float innerHalfBody = max(0.2 - borderWidth, 0.0);
                
                // Kulakçık (flap) kontrolü: Merkezdeysek gövdeden başla, kulakçıktaysak sağdan başla
                float isCentral = 1.0 - step(innerHalfBody, abs(st.t - 0.5));
                float headStart = bodyEnd + (1.0 - isCentral) * (borderWidth * 1.5);
                
                // Sağ uçtan (end) 2.25 katı geriye çekerek sivri uç kanamasını önle
                if (st.s >= headStart && st.s <= end - (borderWidth * 2.25) && abs(st.t - 0.5) < innerMaxY) {
                    isArrowInner = 1.0;
                }
            }
        }
    }
    
    // Arka plan çizgisi (çember) tespiti (Orijinal kodun)
    isInside = max(isInside, isArrow);
    if(abs(st.t - 0.5) < 0.3){
        isInside = max(isInside, 0.5);
    }

    // YENİ: Renk ve Saydamlık Karar Mekanizması
    // Artık 3 ihtimalimiz var: İç ok (dolgu), Dış ok (kenarlık) veya Arka plan (çember)
    vec3 finalColor;
    float baseAlpha;

    if (isArrowInner > 0.5) {
        // 1. İhtimal: Piksel iç dolgunun içindeyse -> Ok rengi
        finalColor = arrowColor.rgb;
        baseAlpha = 1.0;
    } else if (isArrow > 0.5) {
        // 2. İhtimal: Piksel dış sınırda var ama iç sınırda YOKSA -> Kenarlık rengi
        finalColor = borderColor.rgb;
        baseAlpha = 1.0;
    } else if (isInside > 0.0) {
        // 3. İhtimal: Piksel sadece arka plan çizgisindeyse -> Çember rengi
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