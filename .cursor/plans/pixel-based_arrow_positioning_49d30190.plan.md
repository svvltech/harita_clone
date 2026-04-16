---
name: Pixel-Based Arrow Positioning
overview: st.s ve gl_FragCoord dışındaki alternatif koordinat kaynaklarını kullanarak pan-stabil, zoom-stabil ok konumlandırma algoritmaları türetmek.
todos:
  - id: algo-select
    content: Kullanici hangi algoritmayı/algoritmaları denemek istediğini seçsin
    status: pending
  - id: implement
    content: Seçilen algoritmayı shaders.ts'de yeni MaterialProperty sınıfı olarak implemente et
    status: pending
  - id: integrate
    content: ucusRotasi.ts'de demo fonksiyonu ekle ve test et
    status: pending
isProject: false
---

# Alternatif Koordinat Kaynaklarıyla Ok Konumlandırma Algoritmaları

## Mevcut Durum Özeti

- **`st.s`:** Geometriye kilitli, pan'da kaymaz, ama zoom'da ok boyutu bozulur.
- **`gl_FragCoord`:** Ekrana kilitli, zoom'da piksel boyutu sabit, ama pan'da kayar.
- **`anchorPoint`/`anchorPixel`:** `gl_FragCoord`'a çıpa ekler ama `v_polylineAngle` fragmentlar arası değiştiğinden fazlarda tutarsızlık oluşuyor.

**Hedef:** `st.s` ve `gl_FragCoord` kullanmadan, alternatif koordinat kaynaklarıyla pan ve zoom'da stabil ok deseni elde etmek.

---

## Kullanılabilir Alternatif Koordinat Kaynakları

Cesium material pipeline'ında fragment shader'da erişilebilen, henüz ok konumlandırmada kullanılmamış kaynaklar:

| Kaynak | Ne verir | Pan'da davranış | Zoom'da davranış |
|--------|----------|-----------------|------------------|
| `materialInput.positionToEyeEC` | Göz uzayı pozisyonu (vec3, metre) | Kamerayla birlikte değişir | Derinlik (z) değişir |
| `czm_projection[1][1]` + `czm_viewport.w` | FOV ve viewport boyutundan metre/piksel | Sabit (projeksiyon değişmez) | Sabit |
| `dFdx()` / `dFdy()` | Herhangi bir değerin piksel başına değişimi | Otomatik adapte | Otomatik adapte |
| `czm_metersPerPixel()` | Derinliğe göre 1px = kaç metre | Derinlik bağımlı | Derinlik bağımlı |
| `czm_inverseProjection` | Clip space'den eye space'e dönüşüm | Sabit | Sabit |
| `sampler2D` (Data Texture) | CPU'dan GPU'ya arbitrary veri | Tamamen kontrollü | Tamamen kontrollü |

---

## Algoritma A: Eye-Space Projeksiyon (positionToEyeEC Tabanlı)

### Temel Fikir

Fragment'ın **göz uzayı (eye-space) pozisyonunu** projeksiyon matrisi ile **ekran piksellerine** dönüştür. Bu, `gl_FragCoord`'a benzer bir piksel koordinatı verir ama hesaplama tamamen **materialInput** ve **Cesium built-in matrislerinden** türetilir.

Sonra bu piksel pozisyonunu `v_polylineAngle` ile döndürerek "çizgi boyunca piksel mesafesi" elde et. Pan'da kaymaması için bu pozisyonu bir **anchor noktasının eye-space projeksiyon** farkı ile telafi et.

### Shader

```glsl
uniform vec4 arrowColor;
uniform vec4 dashColor;
uniform float dashLength;   // piksel
uniform float arrowLength;  // piksel
uniform vec3 anchorEyePos;  // CPU'dan: anchor noktasının eye-space karşılığı

in float v_polylineAngle;

czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);

    // 1. Fragment'ın eye-space pozisyonunu al
    vec3 eyePos = materialInput.positionToEyeEC;

    // 2. Eye-space'den pencere koordinatına projeksiyon (manual)
    //    clipPos = projectionMatrix * eyePos
    vec4 clipPos = czm_projection * vec4(eyePos, 1.0);
    vec2 ndcPos = clipPos.xy / clipPos.w;  // [-1, 1]
    vec2 winPos = (ndcPos * 0.5 + 0.5) * czm_viewport.zw + czm_viewport.xy;

    // 3. Anchor noktasını da aynı şekilde projekte et
    vec4 anchorClip = czm_projection * vec4(anchorEyePos, 1.0);
    vec2 anchorNdc = anchorClip.xy / anchorClip.w;
    vec2 anchorWin = (anchorNdc * 0.5 + 0.5) * czm_viewport.zw + czm_viewport.xy;

    // 4. Fark: anchor'a göre göreceli piksel pozisyonu
    vec2 delta = winPos - anchorWin;

    // 5. Polyline yönüne döndür
    vec2 pos = rotate(v_polylineAngle) * delta;

    // 6. Desen fazı
    float pixelSegLen = dashLength + arrowLength;
    float xInSeg = modp(pos.x, pixelSegLen);

    float inArrow = step(dashLength, xInSeg);
    float u = clamp((xInSeg - dashLength) / max(arrowLength, 1.0), 0.0, 1.0);
    float v = materialInput.st.t;
    float a = inArrow * arrowMask(u, v);

    vec4 outColor = mix(dashColor, arrowColor, a);
    material.diffuse = outColor.rgb;
    material.alpha = outColor.a;
    return material;
}
```

### CPU Tarafı (getValue)

```typescript
getValue(time, result) {
    if (!result) result = {};
    result.arrowColor = this._arrowColor.getValue(time);
    result.dashColor = this._dashColor.getValue(time);
    result.dashLength = this._dashLength;
    result.arrowLength = this._arrowLength;

    // Anchor dünya noktasını eye-space'e çevir
    const viewMatrix = this._scene.camera.viewMatrix;
    const anchorWorld = this._anchorCartesian3;
    const eyePos = Cesium.Matrix4.multiplyByPoint(
        viewMatrix, anchorWorld, new Cesium.Cartesian3()
    );
    result.anchorEyePos = eyePos;
    return result;
}
```

### Analiz

- **Pan:** `anchorEyePos` her frame güncellenir, `winPos - anchorWin` farkı pan'ı telafi eder. Anchor ile aynı derinlikteki fragmentlar icin fark sabit kalır.
- **Zoom:** `dashLength` ve `arrowLength` piksel cinsinden verildiği için ok boyutu sabit.
- **Avantaj:** `gl_FragCoord` hiç kullanılmıyor; tüm hesap `positionToEyeEC` + `czm_projection` ile yapılıyor.
- **Dezavantaj:** `v_polylineAngle` hala varying olarak kullanılıyor (ancak bu kaçınılmaz, çizgi yönünü bilmek gerekir). Perspektif farkı olan fragmentlarda (polyline uzak ucu vs yakın ucu) anchor ile derinlik farkı küçük bir faz kaymasına neden olabilir.
- **Risk:** `positionToEyeEC` Cesium'da polyline material için interpolasyon sorunları yaşayabilir (vertex'lerde doğru, fragmentlar arası linear interpolasyon perspektif nedeniyle bozuk olabilir).

---

## Algoritma B: dFdx/dFdy Tabanlı Tam Shader-İçi Hesap (Sıfır CPU)

### Temel Fikir

`st.s`'in piksel başına değişim oranını `dFdx`/`dFdy` ile ölç. Bu oran "1 piksel = ne kadar `s`" bilgisini verir. Bu bilgiyle `st.s`'i piksel birimine çevir, ok boyutunu piksel olarak sabit tut. Tüm hesap shader'da, **CPU'dan sadece sabit parametreler** gelir.

### Shader

```glsl
uniform vec4 arrowColor;
uniform vec4 dashColor;
uniform float dashPixels;    // sabit: istenen dash uzunluğu piksel cinsinden
uniform float arrowPixels;   // sabit: istenen ok uzunluğu piksel cinsinden

czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);

    float s = materialInput.st.s;
    float v = materialInput.st.t;

    // 1. s'in piksel başına değişim hızı
    float gradS = length(vec2(dFdx(s), dFdy(s)));
    // gradS = "1 piksel ilerleyince s ne kadar değişir"
    // 1/gradS = "1 birim s kaç piksel"

    // 2. Desen uzunluğunu s birimine çevir
    float segPixels = dashPixels + arrowPixels;
    float segInS = segPixels * gradS;  // piksel * (s/piksel) = s birimi

    // 3. s'i segment içi pozisyona çevir
    float cellCoord = modp(s, segInS) / segInS;  // [0, 1] normalize

    // 4. Dash/arrow ayrımı
    float dashRatio = dashPixels / segPixels;
    float inArrow = step(dashRatio, cellCoord);
    float u = clamp((cellCoord - dashRatio) / (1.0 - dashRatio), 0.0, 1.0);
    float a = inArrow * arrowMask(u, v);

    vec4 outColor = mix(dashColor, arrowColor, a);
    material.diffuse = outColor.rgb;
    material.alpha = outColor.a;
    return material;
}
```

### CPU Tarafı (getValue)

```typescript
getValue(time, result) {
    if (!result) result = {};
    result.arrowColor = this._arrowColor.getValue(time);
    result.dashColor = this._dashColor.getValue(time);
    result.dashPixels = 48.0;   // sabit
    result.arrowPixels = 16.0;  // sabit
    return result;
}
```

### Analiz

- **Pan:** `st.s` geometriye kilitli, `dFdx(s)` pan'dan etkilenmez (geometri değişmediği için aynı fragment aynı s değerini alır). Oklar **kesinlikle kaymaz**.
- **Zoom:** `dFdx(s)` zoom'la birlikte otomatik olarak değişir (zoom in yapınca 1 piksel daha az `s`'e karşılık gelir, yani `gradS` küçülür, `segInS` küçülür, daha fazla ok sığar). Ok boyutu **piksel cinsinden sabit** kalır.
- **Avantaj:** CPU'da hiçbir kamera hesabı yok. `gl_FragCoord` yok. `anchorPoint` yok. `v_polylineAngle` bile gerekmiyor. Tamamen `materialInput.st` + türev.
- **Dezavantaj:** `dFdx`/`dFdy` polygon kenarlarında (triangle edge) yanlış değer verebilir ("derivative spike"). `segInS` her fragment için farklı olabilir (perspektif, polyline eğriliği), bu da okların uzak/yakın uçlarda farklı boyutlarda görünmesine neden olur.
- **Spike çözümü:** `gradS`'i clamp et: `gradS = clamp(gradS, minGrad, maxGrad)` veya `fwidth` yerine tek eksen kullan: `gradS = abs(dFdx(s))` (polyline çoğunlukla yatay).

### Gelişmiş Varyant: Quantized Segment Sayısı

`segInS` fragment'lar arası değiştiği için desen sınırları titrer. Bunu çözmek için **toplam segment sayısını** quantize et:

```glsl
float totalSegments = 1.0 / max(segInS, 1e-6);
totalSegments = floor(totalSegments + 0.5);  // en yakın tam sayıya yuvarla
segInS = 1.0 / max(totalSegments, 1.0);      // yuvarlanan değerden geri hesapla

float cellCoord = modp(s, segInS) / segInS;
```

Bu, zoom sırasında ok sayısının tam sayı adımlarıyla değişmesini sağlar (5 ok -> 6 ok -> 7 ok...).

---

## Algoritma C: czm_metersPerPixel + positionToEyeEC Hibrit (Derinlik Uyarlamalı)

### Temel Fikir

Her fragment için `czm_metersPerPixel` fonksiyonuyla o noktanın derinliğine göre 1 pikselin kaç metre olduğunu bul. `st.s * totalLengthMeters` ile metre cinsinden mesafeyi al, `mpp`'ye bölerek piksel mesafesine çevir. Bu aslında mevcut `Kusursuz` yaklaşımına benzer ama burada **`positionToEyeEC`'yi doğrudan `czm_metersPerPixel`'e vererek** daha doğru bir derinlik kullanıyoruz (gl_FragCoord.w yerine).

### Shader

```glsl
uniform vec4 arrowColor;
uniform vec4 dashColor;
uniform float dashLength;       // piksel
uniform float arrowLength;      // piksel
uniform float totalLengthMeters;

czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);

    // 1. Fragment'ın derinliğine göre metre/piksel
    float mpp = czm_metersPerPixel(materialInput.positionToEyeEC);
    mpp = max(mpp, 1e-6);

    // 2. Geometrik mesafeyi piksel mesafesine çevir
    float s_meters = materialInput.st.s * totalLengthMeters;
    float s_pixels = s_meters / mpp;

    // 3. Desen fazı
    float pixelSegLen = dashLength + arrowLength;
    float xInSeg = modp(s_pixels, pixelSegLen);

    float inArrow = step(dashLength, xInSeg);
    float u = clamp((xInSeg - dashLength) / max(arrowLength, 1.0), 0.0, 1.0);
    float v = materialInput.st.t;
    float a = inArrow * arrowMask(u, v);

    vec4 outColor = mix(dashColor, arrowColor, a);
    material.diffuse = outColor.rgb;
    material.alpha = outColor.a;
    return material;
}
```

### Analiz

- **Pan:** `st.s` geometriye kilitli => kaymaz. `mpp` derinliğe bağlı, pan'da sabit (aynı yükseklikte kalınırsa).
- **Zoom:** `mpp` değişir, `s_pixels` otomatik uyarlanır, ok boyutu piksel cinsinden sabit.
- **Avantaj:** `gl_FragCoord` kullanmıyor. `positionToEyeEC`'den `czm_metersPerPixel`'e direkt geçiş, `gl_FragCoord.w` workaround'una gerek yok.
- **Dezavantaj:** Mevcut `Kusursuz` yaklaşımına çok benziyor (sadece `positionToEyeEC.z` yerine tam vektör). Pan'da `mpp` sabit olmayabilir (perspektiften dolayı polyline'ın uzak ucu vs yakın ucu farklı `mpp` alır => ok boyutları değişir). Bu "istenen" bir davranış olabilir (perspektif uyumu) ama tutarsız da olabilir.

### Fark: Mevcut Kusursuz vs Bu Algoritma

Mevcut `Kusursuz` ([shaders.ts:4211-4212](web/src/polyline_work/shaders.ts)):
```glsl
float distanceToEye = abs(materialInput.positionToEyeEC.z);
float mpp = distanceToEye / (czm_projection[1][1] * czm_viewport.w * 0.5);
```

Bu algoritma:
```glsl
float mpp = czm_metersPerPixel(materialInput.positionToEyeEC);
```

`czm_metersPerPixel` Cesium'un built-in fonksiyonu, FOV + viewport hesabını kendi içinde yapar ve daha doğru olabilir (off-axis fragmentlar icin).

---

## Algoritma D: Data Texture Atlas (CPU-Driven Ok Pozisyonları)

### Temel Fikir

Tamamen farklı bir paradigma: Ok konumlarını **CPU'da hesapla**, bir **1D texture'a** yaz, fragment shader'da `st.s`'e göre bu texture'dan örnekle. Texture'da her piksel "burada ok var mı, yönü ne" bilgisini tutar.

### Shader

```glsl
uniform vec4 arrowColor;
uniform vec4 dashColor;
uniform sampler2D uArrowMap;   // R: ok var mı (0/1), G: ok u değeri, B: ok yönü

czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);

    float s = materialInput.st.s;
    float v = materialInput.st.t;

    // Texture'dan ok bilgisini oku
    vec4 arrowData = texture(uArrowMap, vec2(s, 0.5));
    float hasArrow = arrowData.r;    // 0 veya 1
    float u = arrowData.g;           // ok içi pozisyon [0,1]

    float a = hasArrow * arrowMask(u, v);

    vec4 outColor = mix(dashColor, arrowColor, a);
    material.diffuse = outColor.rgb;
    material.alpha = outColor.a;
    return material;
}
```

### CPU Tarafı

```typescript
// Texture oluştur (bir kere veya zoom değişince)
const TEX_WIDTH = 512;
const data = new Uint8Array(TEX_WIDTH * 4);

// Kameraya göre ok pozisyonlarını hesapla
const mpp = getMetersPerPixel(scene);
const arrowSpacingMeters = desiredSpacingPixels * mpp;

for (let i = 0; i < TEX_WIDTH; i++) {
    const s = i / TEX_WIDTH;
    const meters = s * totalLengthMeters;
    const cellPos = (meters % arrowSpacingMeters) / arrowSpacingMeters;

    if (cellPos > dashRatio) {
        const u = (cellPos - dashRatio) / (1 - dashRatio);
        data[i * 4 + 0] = 255;         // hasArrow = 1
        data[i * 4 + 1] = u * 255;     // u değeri
    }
}

// Cesium Material fabric'e texture olarak aktar
// (Cesium'da Material.fromType ile texture uniform desteklenir)
```

### Analiz

- **Pan:** `st.s` tabanlı okuma => kaymaz.
- **Zoom:** CPU her zoom adımında texture'u yeniden hesaplar, ok boyutu piksel cinsinden kontrollü.
- **Avantaj:** Shader çok basit. Her türlü özel dağılım (eşit aralıklı, rastgele, yoğunluk tabanlı) mümkün. `gl_FragCoord`, `dFdx`, `anchorPoint` hiçbiri gerekmiyor.
- **Dezavantaj:** Texture çözünürlüğü (512px) ok detayını sınırlar. CPU'dan GPU'ya her frame texture upload pahalı olabilir. Cesium Material fabric'inde `sampler2D` uniform tanımı standart değil (ek yapılandırma gerekir). Perspektiften dolayı polyline'ın farklı bölgelerinde `s` aralığı eşit piksel aralığına karşılık gelmeyebilir.

---

## Algoritma E: czm_inverseProjection ile Clip-to-Eye Geri Dönüşüm

### Temel Fikir

Fragment'ın clip-space pozisyonunu (NDC'den) `czm_inverseProjection` ile eye-space'e geri dönüştür. Sonra eye-space'de anchor noktasından olan **XY mesafesini** (yani ekran düzlemine paralel mesafeyi) hesapla. Bu mesafe **metre cinsinden** ama ekrana paralel olduğu icin piksel mesafesine orantılıdır.

### Shader

```glsl
uniform vec4 arrowColor;
uniform vec4 dashColor;
uniform float dashLength;
uniform float arrowLength;
uniform vec3 anchorEyePos;

in float v_polylineAngle;

czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);

    vec3 eyePos = materialInput.positionToEyeEC;

    // Eye-space XY düzlemindeki fark (ekrana paralel)
    vec2 deltaEyeXY = eyePos.xy - anchorEyePos.xy;

    // Bu farkı piksele çevir: proj * eyeXY / eyeZ * viewport/2
    float depth = -eyePos.z;
    vec2 deltaPixels = deltaEyeXY * czm_projection[1][1] * czm_viewport.w * 0.5 / depth;

    // Polyline yönüne döndür
    vec2 pos = rotate(v_polylineAngle) * deltaPixels;

    float pixelSegLen = dashLength + arrowLength;
    float xInSeg = modp(pos.x, pixelSegLen);

    float inArrow = step(dashLength, xInSeg);
    float u = clamp((xInSeg - dashLength) / max(arrowLength, 1.0), 0.0, 1.0);
    float v_coord = materialInput.st.t;
    float a = inArrow * arrowMask(u, v_coord);

    vec4 outColor = mix(dashColor, arrowColor, a);
    material.diffuse = outColor.rgb;
    material.alpha = outColor.a;
    return material;
}
```

### Analiz

- **Pan:** `anchorEyePos` her frame güncellenir, eye-space'de fark alındığı için pan telafi edilir. Anchor noktası ile fragment aynı derinlikteyse fark sabit.
- **Zoom:** `dashLength`/`arrowLength` piksel cinsinden verildiği için sabit. `depth` değişimi zaten formüle dahil.
- **Avantaj:** `gl_FragCoord` kullanmıyor. Hesap tamamen eye-space'de. `czm_inverseProjection` yerine forward projection ile aynı sonuç (daha verimli).
- **Dezavantaj:** Algoritma A'ya çok benziyor ama eye-space XY düzleminde çalışıyor. Derinlik farkı olan fragmentlarda (perspektif) `deltaPixels` hesabı bozulabilir çünkü her fragment farklı `depth` değerine sahip.

---

## Karşılaştırma Tablosu

| Algoritma | Koordinat Kaynağı | Pan Stabil | Zoom Stabil | CPU Yükü | Karmaşıklık | gl_FragCoord | st.s |
|-----------|-------------------|------------|-------------|----------|-------------|--------------|------|
| A: Eye-Space Projeksiyon | `positionToEyeEC` + `czm_projection` | Evet (anchor delta) | Evet (piksel uniform) | Düşük (eye-space anchor) | Orta | Yok | Yok (sadece st.t) |
| B: dFdx/dFdy Tam Shader | `dFdx(st.s)` + `dFdy(st.s)` | Evet (st.s kilitli) | Evet (otomatik) | Sıfır | Düşük | Yok | Dolaylı (türev) |
| C: czm_metersPerPixel | `positionToEyeEC` + `czm_metersPerPixel` | Evet (st.s kilitli) | Evet (mpp adapte) | Sıfır | Düşük | Yok | Dolaylı (metre) |
| D: Data Texture | `sampler2D` + `st.s` | Evet (st.s kilitli) | Evet (CPU kontrollü) | Yüksek (texture upload) | Yüksek | Yok | Örnekleme key'i |
| E: Eye-Space XY Delta | `positionToEyeEC.xy` + anchor delta | Evet (anchor delta) | Evet (piksel uniform) | Düşük | Orta | Yok | Yok (sadece st.t) |

---

## Tavsiye

- **En pratik ve düşük riskli:** **Algoritma B (dFdx/dFdy)** -- sıfır CPU, sıfır uniform, tamamen GPU'da. Derivative spike riski clamp ile yönetilebilir.
- **En doğru:** **Algoritma C (czm_metersPerPixel)** -- mevcut Kusursuz'un `gl_FragCoord.w` yerine `positionToEyeEC` kullanan temiz versiyonu.
- **En farklı paradigma:** **Algoritma D (Data Texture)** -- tam CPU kontrolü, ama Cesium Material fabric entegrasyonu zor.
- **En matematiksel:** **Algoritma A veya E (Eye-Space Projeksiyon)** -- `gl_FragCoord`'u sıfırdan yeniden türetiyor, anchor delta ile pan telafisi.

Her algoritma `gl_FragCoord`'u ve doğrudan `st.s` bazlı `repeatCount`'u elimine eder. Hepsi farklı trade-off'lar sunar.
