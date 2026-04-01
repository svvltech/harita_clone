import * as Cesium from "cesium";

export class ArrowEdgeMaterialProperty1 implements Cesium.MaterialProperty {
    private _arrowColor: Cesium.Property;
    private _dashColor: Cesium.Property;
    private _definitionChanged: Cesium.Event;
    
    // YENİ: Çıpa noktası için değişkenler
    private _scene: Cesium.Scene;
    private _anchor3D: Cesium.Cartesian3;
    private _anchor2D: Cesium.Cartesian2;

    constructor(
        arrowColor: Cesium.Color,
        dashColor: Cesium.CallbackProperty,
        scene: Cesium.Scene,            // YENİ: Viewer'ın sahne objesi
        anchor3D: Cesium.Cartesian3     // YENİ: Rotanın başlangıç 3D koordinatı
    ) {
        this._arrowColor = new Cesium.ConstantProperty(arrowColor);
        this._dashColor = dashColor;
        this._scene = scene;
        this._anchor3D = anchor3D;
        this._anchor2D = new Cesium.Cartesian2(0, 0); // Varsayılan başlangıç
        this._definitionChanged = new Cesium.Event();

        if (!(Cesium.Material as any)._materialCache._materials["ArrowEdgeMaterialPropertyAnchored"]) {
            (Cesium.Material as any)._materialCache.addMaterial("ArrowEdgeMaterialPropertyAnchored", {
                fabric: {
                    type: "ArrowEdgeMaterialPropertyAnchored",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.fromBytes(239, 12, 249, 255),
                        anchorPoint: new Cesium.Cartesian2(0.0, 0.0), // YENİ: Uniform eklendi
                        dashLength: 48.0,
                        arrowLength: 16.0,
                        minV: 0.40,
                        maxV: 0.60
                    },
                    source: `
                        uniform vec4 arrowColor;   
                        uniform vec4 dashColor;
                        uniform vec2 anchorPoint; // YENİ: JavaScript'ten gelen çıpa pikselleri
                        uniform float dashLength;
                        uniform float arrowLength;
                        uniform float minV;
                        uniform float maxV;
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

                        float arrowMask(float u, float v) {
                            const float bodyFrac = 0.30;
                            const float bodyH    = 0.35;
                            float halfBody = bodyH * 0.5;
                            float c = abs(v - 0.5);

                            float inBodyU = 1.0 - step(bodyFrac, u);
                            float inBodyV = 1.0 - step(halfBody, c);
                            float alphaBody = inBodyU * inBodyV;

                            float b = clamp((u - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
                            float halfHead = 0.5 * (1.0 - b);
                            float inHeadU  = step(bodyFrac, u);
                            float inHeadV  = 1.0 - step(halfHead, c);
                            float alphaHead = inHeadU * inHeadV;

                            return clamp(max(alphaBody, alphaHead), 0.0, 1.0);
                        }

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            vec2 st = materialInput.st;

                            // SİHİRLİ DOKUNUŞ BURASI:
                            // gl_FragCoord'u doğrudan kullanmak yerine, ekranın neresinde olursak olalım 
                            // sıfır noktamızı rotanın başlangıç noktasına (anchorPoint) sabitliyoruz.
                            vec2 pos = gl_FragCoord.xy - anchorPoint;
                            pos = rotate(v_polylineAngle) * pos;
                            
                            float pixelDashLength  = max(dashLength  * czm_pixelRatio, 1.0);
                            float pixelArrowLength = max(arrowLength * czm_pixelRatio, 1.0);
                            float pixelSegmentLength = pixelDashLength + pixelArrowLength;

                            float xInSeg = modp(pos.x, pixelSegmentLength);

                            float inArrow = step(pixelDashLength, xInSeg);
                            float u = clamp((xInSeg - pixelDashLength) / pixelArrowLength, 0.0, 1.0);
                            float v = st.t;
                            float a = inArrow * arrowMask(u, v);

                            vec4 dashCol = dashColor;
                            vec4 arrowCol = arrowColor;

                            vec4 outColor = mix(dashCol, arrowCol, a);

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
                },

                translucent: () => true
            });
        }
    }

    get isConstant(): boolean { return false; } // Artık her karede güncelleneceği için false yaptık
    get definitionChanged(): Cesium.Event { return this._definitionChanged; }
    getType(_time: Cesium.JulianDate): string { return "ArrowEdgeMaterialPropertyAnchored"; }

    // Her karede Cesium burayı çağırır
    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        
        result.arrowColor = this._arrowColor.getValue(time);
        result.dashColor = this._dashColor.getValue(time);
        
        // 3D noktayı, o anki ekrandaki 2D piksel noktasına çeviriyoruz
        const windowPos = Cesium.SceneTransforms.worldToWindowCoordinates(this._scene, this._anchor3D);
        if (windowPos) {
            this._anchor2D.x = windowPos.x;
            this._anchor2D.y = windowPos.y;
        }
        
        result.anchorPoint = this._anchor2D; // Shader'a gönderiyoruz
        
        return result;
    }

    equals(other: Cesium.MaterialProperty): boolean {
        return this === other;
    }
}

export class ArrowEdgeMaterialProperty2son implements Cesium.MaterialProperty {
    private _arrowColor: Cesium.Property;
    private _dashColor: Cesium.Property;
    private _dashLength: number;   // YENİ: Çizgi uzunluğu parametresi
    private _arrowLength: number;  // YENİ: Ok uzunluğu parametresi
    private _totalLengthMeters: number;
    private _scene: Cesium.Scene;
    private _definitionChanged: Cesium.Event;

    constructor(
        arrowColor: Cesium.Color,
        dashColor: Cesium.CallbackProperty,
        dashLength: number = 115.0,  // Varsayılan değer (Toplamı 150 yapacak şekilde)
        arrowLength: number = 35.0,   // Varsayılan değer
        scene: Cesium.Scene,
        totalLengthMeters: number // JS'den gelen gerçek rota uzunluğu
    ) {
        this._arrowColor = new Cesium.ConstantProperty(arrowColor);
        this._dashColor = dashColor;
        this._dashLength = dashLength;
        this._arrowLength = arrowLength;
        this._scene = scene;
        this._totalLengthMeters = totalLengthMeters;
        this._definitionChanged = new Cesium.Event();

        if (!(Cesium.Material as any)._materialCache._materials["ArrowEdgeMaterialPropertyTransparentEdge"]) {
            (Cesium.Material as any)._materialCache.addMaterial("ArrowEdgeMaterialPropertyTransparentEdge", {
                fabric: {
                    type: "ArrowEdgeMaterialPropertyTransparentEdge",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.fromBytes(239, 12, 249, 255),
                        dashLength: 115.0, // Shader'a gidecek değişken
                        arrowLength: 35.0, // Shader'a gidecek değişken
                        repeatCount: 10.0, // ARTIK JS'DEN DİNAMİK OLARAK GELECEK
                        minV: 0.40,
                        maxV: 0.60
                    },
                    source: `
                        uniform vec4 arrowColor;   
                        uniform vec4 dashColor;
                        uniform float dashLength;  // JS'den gelen çizgi uzunluğu
                        uniform float arrowLength; // JS'den gelen ok uzunluğu
                        uniform float repeatCount; // JS'den gelen kusursuz katsayı
                        uniform float minV;
                        uniform float maxV;

                        float modp(float x, float len) {
                            float m = mod(x, len);
                            return m < 0.0 ? m + len : m;
                        }

                        float arrowMask(float u, float v) {
                            const float bodyFrac = 0.30;
                            const float bodyH    = 0.35;
                            float halfBody = bodyH * 0.5;
                            float c = abs(v - 0.5);

                            float inBodyU = 1.0 - step(bodyFrac, u);
                            float inBodyV = 1.0 - step(halfBody, c);
                            float alphaBody = inBodyU * inBodyV;

                            float b = clamp((u - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
                            float halfHead = 0.5 * (1.0 - b);
                            float inHeadU  = step(bodyFrac, u);
                            float inHeadV  = 1.0 - step(halfHead, c);
                            float alphaHead = inHeadU * inHeadV;

                            return clamp(max(alphaBody, alphaHead), 0.0, 1.0);
                        }

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            float s = materialInput.st.s;
                            float v = materialInput.st.t;

                            // BÜTÜN KAYMA VE BOZULMA SORUNLARI BURADA BİTTİ
                            // Çünkü s, dünyaya çakılıdır. repeatCount ise pan yaparken sabittir.
                            float xInSeg = modp(s * repeatCount, 1.0);

                            // --- DİNAMİK ORAN HESAPLAMALARI ---
                            float totalPixels = dashLength + arrowLength;
                            float dashRatio = dashLength / totalPixels; // Eski 0.75
                            float arrowRatio = arrowLength / totalPixels; // Eski 0.25

                            float inArrow = step(dashRatio, xInSeg); 
                            //float u = clamp((xInSeg - dashRatio) / arrowRatio, 0.0, 1.0);
                            float u = clamp((xInSeg - dashRatio) / max(arrowRatio, 0.001), 0.0, 1.0);
                            float a = inArrow * arrowMask(u, v);

                            vec4 outColor = mix(dashColor, arrowColor, a);
                            float vClip = step(minV, v) * step(v, maxV);
                            
                            material.diffuse = outColor.rgb;
                            material.alpha = outColor.a * mix(vClip, 1.0, a); 

                            return material;
                        }
                    `
                },
                translucent: () => true
            });
        }
    }

    get isConstant(): boolean { return false; } 
    get definitionChanged(): Cesium.Event { return this._definitionChanged; }
    getType(_time: Cesium.JulianDate): string { return "ArrowEdgeMaterialPropertyTransparentEdge"; }

    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.arrowColor = this._arrowColor.getValue(time);
        result.dashColor = this._dashColor.getValue(time);
        // Parametreleri GPU'ya iletiyoruz
        result.dashLength = this._dashLength;
        result.arrowLength = this._arrowLength;

        // --- MATEMATİĞİN KUSURSUZ ÇÖZÜLDÜĞÜ YER ---

        // 1. Kameranın yatay uzaklığını değil, doğrudan YÜKSEKLİĞİNİ (Altitude) alıyoruz!
        // Haritayı sağa sola kaydırdığında bu değer ASLA değişmez. Bu sayede oklar kaymaz.
        let cameraHeight = 1000.0;
        if (this._scene && this._scene.camera) {
            const carto = this._scene.globe.ellipsoid.cartesianToCartographic(this._scene.camera.positionWC);
            if (carto) {
                cameraHeight = Math.max(carto.height, 10.0); // Sıfıra inmeyi engelle
            }
        }

        // 2. Bu yükseklikten bakarken 1 pikselin dünyada kaç metre yer kapladığını buluyoruz
        const pixelSize = this._scene.camera.frustum.getPixelDimensions(
            this._scene.drawingBufferWidth,
            this._scene.drawingBufferHeight,
            cameraHeight, 
            window.devicePixelRatio,
            new Cesium.Cartesian2()
        );
        const mpp = pixelSize.x;

        // 3. 64 piksellik desen (48 çizgi + 16 ok) o an dünyada kaç metreye denk geliyor?
        const totalPixels = this._dashLength + this._arrowLength;
        const segmentMeters = totalPixels * mpp;

        // 4. Çizginin toplam uzunluğunu desenin boyutuna böl ve shader'a kesin emri ver.
        result.repeatCount = Math.max(this._totalLengthMeters / segmentMeters, 1.0);

        return result;
    }

    equals(other: Cesium.MaterialProperty): boolean {
        return this === other;
    }
}


export class ArrowEdgeMaterialProperty2 implements Cesium.MaterialProperty {
    private _arrowColor: Cesium.Property;
    private _dashColor: Cesium.Property;
    private _dashLength: number;
    private _arrowLength: number;
    private _totalLengthMeters: number;
    private _positions: Cesium.Cartesian3[]; // Geometriyi takip etmek için ekledik
    private _scene: Cesium.Scene;
    private _definitionChanged: Cesium.Event;

    constructor(
        arrowColor: Cesium.Color,
        dashColor: Cesium.Property, // CallbackProperty veya ConstantProperty
        scene: Cesium.Scene,
        totalLengthMeters: number,
        positions: Cesium.Cartesian3[], // Rotanın koordinatları
        dashLength: number = 115.0,
        arrowLength: number = 35.0
    ) {
        this._arrowColor = new Cesium.ConstantProperty(arrowColor);
        this._dashColor = dashColor;
        this._scene = scene;
        this._totalLengthMeters = totalLengthMeters;
        this._positions = positions;
        this._dashLength = dashLength;
        this._arrowLength = arrowLength;
        this._definitionChanged = new Cesium.Event();

        if (!(Cesium.Material as any)._materialCache._materials["ArrowEdgeMaterialPropertyTransparentEdge"]) {
           (Cesium.Material as any)._materialCache.addMaterial("ArrowEdgeMaterialPropertyTransparentEdge", {
                fabric: {
                    type: "ArrowEdgeMaterialPropertyTransparentEdge",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.PURPLE,
                        dashLength: 115.0,
                        arrowLength: 35.0,
                        repeatCount: 1.0,
                        minV: 0.40,
                        maxV: 0.60
                    },
                    source: `
                        uniform vec4 arrowColor;   
                        uniform vec4 dashColor;
                        uniform float dashLength;
                        uniform float arrowLength;
                        uniform float repeatCount;
                        uniform float minV;
                        uniform float maxV;

                        float modp(float x, float len) {
                            float m = mod(x, len);
                            return m < 0.0 ? m + len : m;
                        }

                        float arrowMask(float u, float v) {
                            const float bodyFrac = 0.35;
                            const float bodyH    = 0.35;
                            float halfBody = bodyH * 0.5;
                            float c = abs(v - 0.5);

                            float inBodyU = 1.0 - step(bodyFrac, u);
                            float inBodyV = 1.0 - step(halfBody, c);
                            float alphaBody = inBodyU * inBodyV;

                            float b = clamp((u - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
                            float halfHead = 0.5 * (1.0 - b);
                            float inHeadU  = step(bodyFrac, u);
                            float inHeadV  = 1.0 - step(halfHead, c);
                            float alphaHead = inHeadU * inHeadV;

                            return clamp(max(alphaBody, alphaHead), 0.0, 1.0);
                        }

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            float s = materialInput.st.s;
                            float v = materialInput.st.t;

                            float xInSeg = modp(s * repeatCount, 1.0);

                            float totalPixels = dashLength + arrowLength;
                            float dashRatio = dashLength / totalPixels;
                            float arrowRatio = arrowLength / totalPixels;

                            float inArrow = step(dashRatio, xInSeg); 
                            float u = clamp((xInSeg - dashRatio) / max(arrowRatio, 0.001), 0.0, 1.0);
                            float a = inArrow * arrowMask(u, v);

                            vec4 outColor = mix(dashColor, arrowColor, a);
                            float vClip = step(minV, v) * step(v, maxV);
                            
                            material.diffuse = outColor.rgb;
                            material.alpha = outColor.a * mix(vClip, 1.0, a); 

                            return material;
                        }
                    `
                },
                translucent: () => true
            });
        }
    }

    get isConstant(): boolean { return false; }
    get definitionChanged(): Cesium.Event { return this._definitionChanged; }
    getType(_time: Cesium.JulianDate): string { return "ArrowEdgeMaterialPropertyTransparentEdge"; }

getValue(time: Cesium.JulianDate, result?: any): any {
    if (!result) result = {};
    result.arrowColor = this._arrowColor.getValue(time);
    result.dashColor = this._dashColor.getValue(time);
    result.dashLength = this._dashLength;
    result.arrowLength = this._arrowLength;

    // 1. Kameranın Rotaya Olan Gerçek Uzaklığı (Derinlik Dengesi)
    let viewDistance = 1000.0;
    if (this._scene && this._scene.camera && this._positions.length >= 2) {
        // Tüm rotayı içine alan hayali bir kürenin merkezini referans alıyoruz.
        // Bu, kameranın rotanın neresine baktığından bağımsız genel bir 'uzaklık' verir.
        const boundingSphere = Cesium.BoundingSphere.fromPoints(this._positions);
        viewDistance = Cesium.Cartesian3.distance(this._scene.camera.positionWC, boundingSphere.center);
        viewDistance = Math.max(viewDistance, 10.0);
    }

    // 2. Piksel Başına Metre (MPP) Hesabı
    const pixelSize = this._scene.camera.frustum.getPixelDimensions(
        this._scene.drawingBufferWidth,
        this._scene.drawingBufferHeight,
        viewDistance,
        window.devicePixelRatio,
        new Cesium.Cartesian2()
    );
    const mpp = pixelSize.x;

    // 3. Desen Uzunluğu (Örn: 115px çizgi + 35px ok = 150px)
    const totalPatternPixels = this._dashLength + this._arrowLength;
    const patternMeters = totalPatternPixels * mpp;

    // 4. Kurşun Geçirmez Yuvarlama
    // Çizginin toplam uzunluğunu, bir desenin dünyada kapladığı metreye bölüyoruz.
    // Sonucu tam sayıya yuvarlayarak çizginin sonunda okların kesilmesini engelliyoruz.
    const rawRepeat = this._totalLengthMeters / patternMeters;
    result.repeatCount = Math.max(Math.round(rawRepeat), 1.0);

    return result;
}

    equals(other: Cesium.MaterialProperty): boolean {
        return this === other;
    }
}


export class ArrowEdgeMaterialProperty2duzgun_1 implements Cesium.MaterialProperty {
    private _arrowColor: Cesium.Property;
    private _dashColor: Cesium.Property;
    private _dashLength: number;
    private _arrowLength: number;
    private _totalLengthMeters: number;
    private _positions: Cesium.Cartesian3[]; // Geometriyi takip etmek için ekledik
    private _scene: Cesium.Scene;
    private _definitionChanged: Cesium.Event;

    constructor(
        arrowColor: Cesium.Color,
        dashColor: Cesium.Property, // CallbackProperty veya ConstantProperty
        scene: Cesium.Scene,
        totalLengthMeters: number,
        positions: Cesium.Cartesian3[], // Rotanın koordinatları
        dashLength: number = 115.0,
        arrowLength: number = 35.0
    ) {
        this._arrowColor = new Cesium.ConstantProperty(arrowColor);
        this._dashColor = dashColor;
        this._scene = scene;
        this._totalLengthMeters = totalLengthMeters;
        this._positions = positions;
        this._dashLength = dashLength;
        this._arrowLength = arrowLength;
        this._definitionChanged = new Cesium.Event();

        if (!(Cesium.Material as any)._materialCache._materials["ArrowEdgeMaterialPropertyTransparentEdge"]) {
           (Cesium.Material as any)._materialCache.addMaterial("ArrowEdgeMaterialPropertyTransparentEdge", {
                fabric: {
                    type: "ArrowEdgeMaterialPropertyTransparentEdge",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.PURPLE,
                        dashLength: 115.0,
                        arrowLength: 35.0,
                        repeatCount: 1.0,
                        minV: 0.40,
                        maxV: 0.60
                    },
                    source: `
                        uniform vec4 arrowColor;   
                        uniform vec4 dashColor;
                        uniform float dashLength;
                        uniform float arrowLength;
                        uniform float repeatCount;
                        uniform float minV;
                        uniform float maxV;

                        float modp(float x, float len) {
                            float m = mod(x, len);
                            return m < 0.0 ? m + len : m;
                        }

                        float arrowMask(float u, float v) {
                            const float bodyFrac = 0.35;
                            const float bodyH    = 0.35;
                            float halfBody = bodyH * 0.5;
                            float c = abs(v - 0.5);

                            float inBodyU = 1.0 - step(bodyFrac, u);
                            float inBodyV = 1.0 - step(halfBody, c);
                            float alphaBody = inBodyU * inBodyV;

                            float b = clamp((u - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
                            float halfHead = 0.5 * (1.0 - b);
                            float inHeadU  = step(bodyFrac, u);
                            float inHeadV  = 1.0 - step(halfHead, c);
                            float alphaHead = inHeadU * inHeadV;

                            return clamp(max(alphaBody, alphaHead), 0.0, 1.0);
                        }

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            float s = materialInput.st.s;
                            float v = materialInput.st.t;

                            float xInSeg = modp(s * repeatCount, 1.0);

                            float totalPixels = dashLength + arrowLength;
                            float dashRatio = dashLength / totalPixels;
                            float arrowRatio = arrowLength / totalPixels;

                            float inArrow = step(dashRatio, xInSeg); 
                            float u = clamp((xInSeg - dashRatio) / max(arrowRatio, 0.001), 0.0, 1.0);
                            float a = inArrow * arrowMask(u, v);

                            vec4 outColor = mix(dashColor, arrowColor, a);
                            float vClip = step(minV, v) * step(v, maxV);
                            
                            material.diffuse = outColor.rgb;
                            material.alpha = outColor.a * mix(vClip, 1.0, a); 

                            return material;
                        }
                    `
                },
                translucent: () => true
            });
        }
    }

    get isConstant(): boolean { return false; }
    get definitionChanged(): Cesium.Event { return this._definitionChanged; }
    getType(_time: Cesium.JulianDate): string { return "ArrowEdgeMaterialPropertyTransparentEdge"; }

getValue(time: Cesium.JulianDate, result?: any): any {
    if (!result) result = {};
    result.arrowColor = this._arrowColor.getValue(time);
    result.dashColor = this._dashColor.getValue(time);
    result.dashLength = this._dashLength;
    result.arrowLength = this._arrowLength;

    // 1. Kameranın YÜKSEKLİĞİNİ (Altitude) alıyoruz.
    // Altitude, yatay pan sırasında ASLA değişmez → kayma olmaz.
    let cameraHeight = 1000.0;
    if (this._scene && this._scene.camera) {
        const carto = this._scene.globe.ellipsoid.cartesianToCartographic(this._scene.camera.positionWC);
        if (carto) {
            cameraHeight = Math.max(carto.height, 10.0);
        }
    }

    // 2. Tilt (Eğim) Düzeltmesi:
    // Sadece altitude kullanmak, kamera eğildiğinde (tilt) bozulma yaratır.
    // Çözüm: Kameranın pitch açısından gerçek bakış mesafesini türetiyoruz.
    // Dik bakış (pitch = -90°) → effectiveDistance = altitude (düzeltme yok)
    // Eğik bakış (pitch = -45°) → effectiveDistance = altitude / sin(45°) ≈ 1.41 * altitude
    const pitch = this._scene.camera.pitch; // Radyan, aşağı bakınca negatif
    const sinPitch = Math.abs(Math.sin(pitch));
    const tiltFactor = Math.max(sinPitch, 0.1); // Ufka çok yakın bakışta sınırla
    const effectiveDistance = cameraHeight / tiltFactor;

    // 3. Piksel Başına Metre (MPP) Hesabı
    const pixelSize = this._scene.camera.frustum.getPixelDimensions(
        this._scene.drawingBufferWidth,
        this._scene.drawingBufferHeight,
        effectiveDistance,
        window.devicePixelRatio,
        new Cesium.Cartesian2()
    );
    const mpp = pixelSize.x;

    // 3. Desen Uzunluğu (Örn: 115px çizgi + 35px ok = 150px)
    const totalPatternPixels = this._dashLength + this._arrowLength;
    const patternMeters = totalPatternPixels * mpp;

    // 4. Kurşun Geçirmez Yuvarlama
    // Çizginin toplam uzunluğunu, bir desenin dünyada kapladığı metreye bölüyoruz.
    // Sonucu tam sayıya yuvarlayarak çizginin sonunda okların kesilmesini engelliyoruz.
    const rawRepeat = this._totalLengthMeters / patternMeters;
    result.repeatCount = Math.max(Math.round(rawRepeat), 1.0);

    return result;
}

    equals(other: Cesium.MaterialProperty): boolean {
        return this === other;
    }
}

export class ArrowEdgeMaterialProperty2duzgun_2 implements Cesium.MaterialProperty {
    private _arrowColor: Cesium.Property;
    private _dashColor: Cesium.Property;
    private _dashLength: number;
    private _arrowLength: number;
    private _positions: Cesium.Cartesian3[];
    private _totalLengthMeters: number;
    private _scene: Cesium.Scene;
    private _definitionChanged: Cesium.Event;

    constructor(
        arrowColor: Cesium.Color,
        dashColor: Cesium.Property, // CallbackProperty veya ConstantProperty
        scene: Cesium.Scene,
        positions: Cesium.Cartesian3[],
        totalLengthMeters: number,
        dashLength: number = 115.0,
        arrowLength: number = 35.0
    ) {
        this._arrowColor = new Cesium.ConstantProperty(arrowColor);
        this._dashColor = dashColor;
        this._scene = scene;
        this._positions = positions;
        this._totalLengthMeters = totalLengthMeters;
        this._dashLength = dashLength;
        this._arrowLength = arrowLength;
        this._definitionChanged = new Cesium.Event();

        if (!(Cesium.Material as any)._materialCache._materials["ArrowEdgeMaterialPropertyTransparentEdge"]) {
           (Cesium.Material as any)._materialCache.addMaterial("ArrowEdgeMaterialPropertyTransparentEdge", {
                fabric: {
                    type: "ArrowEdgeMaterialPropertyTransparentEdge",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.PURPLE,
                        dashLength: 115.0,
                        arrowLength: 35.0,
                        repeatCount: 1.0,
                        minV: 0.40,
                        maxV: 0.60
                    },
                    source: `
                        uniform vec4 arrowColor;   
                        uniform vec4 dashColor;
                        uniform float dashLength;
                        uniform float arrowLength;
                        uniform float repeatCount;
                        uniform float minV;
                        uniform float maxV;

                        float modp(float x, float len) {
                            float m = mod(x, len);
                            return m < 0.0 ? m + len : m;
                        }

                        float arrowMask(float u, float v) {
                            const float bodyFrac = 0.35;
                            const float bodyH    = 0.35;
                            float halfBody = bodyH * 0.5;
                            float c = abs(v - 0.5);

                            float inBodyU = 1.0 - step(bodyFrac, u);
                            float inBodyV = 1.0 - step(halfBody, c);
                            float alphaBody = inBodyU * inBodyV;

                            float b = clamp((u - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
                            float halfHead = 0.5 * (1.0 - b);
                            float inHeadU  = step(bodyFrac, u);
                            float inHeadV  = 1.0 - step(halfHead, c);
                            float alphaHead = inHeadU * inHeadV;

                            return clamp(max(alphaBody, alphaHead), 0.0, 1.0);
                        }

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            float s = materialInput.st.s;
                            float v = materialInput.st.t;

                            float xInSeg = modp(s * repeatCount, 1.0);

                            float totalPixels = dashLength + arrowLength;
                            float dashRatio = dashLength / totalPixels;
                            float arrowRatio = arrowLength / totalPixels;

                            float inArrow = step(dashRatio, xInSeg); 
                            float u = clamp((xInSeg - dashRatio) / max(arrowRatio, 0.001), 0.0, 1.0);
                            float a = inArrow * arrowMask(u, v);

                            vec4 outColor = mix(dashColor, arrowColor, a);
                            float vClip = step(minV, v) * step(v, maxV);
                            
                            material.diffuse = outColor.rgb;
                            material.alpha = outColor.a * mix(vClip, 1.0, a); 

                            return material;
                        }
                    `
                },
                translucent: () => true
            });
        }
    }

    get isConstant(): boolean { return false; }
    get definitionChanged(): Cesium.Event { return this._definitionChanged; }
    getType(_time: Cesium.JulianDate): string { return "ArrowEdgeMaterialPropertyTransparentEdge"; }

getValue(time: Cesium.JulianDate, result?: any): any {
    if (!result) result = {};
    result.arrowColor = this._arrowColor.getValue(time);
    result.dashColor = this._dashColor.getValue(time);
    result.dashLength = this._dashLength;
    result.arrowLength = this._arrowLength;

    // 1. Kameranın SADECE Yüksekliğini (Altitude) Alıyoruz
    // Pan (sağa sola kaydırma) sırasında yükseklik değişmez, böylece oklar kaymaz/titremez.
    let alt = 100000.0;
    if (this._scene && this._scene.camera) {
        const carto = this._scene.globe.ellipsoid.cartesianToCartographic(this._scene.camera.positionWC);
        if (carto) {
            alt = carto.height;
            console.log("alt", alt);
        }
    }

    // 2. Rotadaki Segment Sayısını Bul (Örn: Senin Z rotanda 3 segment var)
    const segmentCount = Math.max(this._positions.length - 1, 1);
/*
    let arrowsPerSegment = 1;

    // 3. KESİN VE NET ZOOM (LOD) ADIMLARI
    // Metre/Piksel hesabını bırakıp kameranın yüksekliğine göre doğrudan sayıyı biz veriyoruz.
    if (alt > 200000.0) {
        // 200 km'den yüksekteyken: Her parçada 1 ok (Senin resimdeki gibi)
        arrowsPerSegment = 1;
    } else if (alt > 100000.0) {
        // 100 km - 200 km arasında: Her parçada 2 ok
        arrowsPerSegment = 2;
    } else if (alt > 40000.0) {
        // 40 km - 100 km arasında: Her parçada 4 ok
        arrowsPerSegment = 4;
    } else if (alt > 15000.0) {
        // 15 km - 40 km arasında: Her parçada 8 ok
        arrowsPerSegment = 8;
    } else {
        // 15 km'den daha yakındayken (Çok Zoom In): Her parçada 16 ok
        arrowsPerSegment = 16;
    }
*/

// 1. Referans Yüksekliği (Tam olarak 1 ok görmek istediğimiz tepe noktası)
    const baseAltitude = 400000.0; // 200 km

    // 2. Ters Orantı Hesabı
    // Yükseklik (alt) azaldıkça, bölme işleminin sonucu doğal olarak büyüyecek.
    // Sıfıra bölünme hatasını önlemek için Math.max(alt, 1.0) yapıyoruz.
    let arrowsPerSegment = Math.round(baseAltitude / Math.max(alt, 1.0));

    // 3. Kelepçe (Clamp) - Güvenlik Sınırları
    // Uzaya çıkınca ok sayısı 0'a düşmesin, yere çakılınca milyonlara çıkmasın.
    const MIN_ARROWS = 1;
    const MAX_ARROWS = 16;
    
    arrowsPerSegment = Math.max(MIN_ARROWS, Math.min(arrowsPerSegment, MAX_ARROWS));
    // 4. Sonuç
    // Toplam repeatCount, segment sayısının KESİN bir katı olur.
    // Bu, eşit uzunluktaki yatay ve çapraz parçalarda okların %100 aynı sayıda olmasını garanti eder.
    result.repeatCount = arrowsPerSegment * segmentCount;

    return result;
}

    equals(other: Cesium.MaterialProperty): boolean {
        return this === other;
    }
}

export class ArrowEdgeMaterialProperty2duzgun_3 implements Cesium.MaterialProperty {
    private _arrowColor: Cesium.Property;
    private _dashColor: Cesium.Property;
    private _dashLength: number;
    private _arrowLength: number;
    private _positions: Cesium.Cartesian3[];
    private _totalLengthMeters: number;
    private _scene: Cesium.Scene;
    private _definitionChanged: Cesium.Event;

    constructor(
        arrowColor: Cesium.Color,
        dashColor: Cesium.Property, // CallbackProperty veya ConstantProperty
        scene: Cesium.Scene,
        positions: Cesium.Cartesian3[],
        totalLengthMeters: number,
        dashLength: number = 115.0,
        arrowLength: number = 35.0
    ) {
        this._arrowColor = new Cesium.ConstantProperty(arrowColor);
        this._dashColor = dashColor;
        this._scene = scene;
        this._positions = positions;
        this._totalLengthMeters = totalLengthMeters;
        this._dashLength = dashLength;
        this._arrowLength = arrowLength;
        this._definitionChanged = new Cesium.Event();

        if (!(Cesium.Material as any)._materialCache._materials["ArrowEdgeMaterialPropertyTransparentEdge"]) {
           (Cesium.Material as any)._materialCache.addMaterial("ArrowEdgeMaterialPropertyTransparentEdge", {
                fabric: {
                    type: "ArrowEdgeMaterialPropertyTransparentEdge",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.PURPLE,
                        dashLength: 115.0,
                        arrowLength: 35.0,
                        repeatCount: 1.0,
                        minV: 0.40,
                        maxV: 0.60
                    },
                    source: `
                        uniform vec4 arrowColor;   
                        uniform vec4 dashColor;
                        uniform float dashLength;
                        uniform float arrowLength;
                        uniform float repeatCount;
                        uniform float minV;
                        uniform float maxV;

                        float modp(float x, float len) {
                            float m = mod(x, len);
                            return m < 0.0 ? m + len : m;
                        }

                        float arrowMask(float u, float v) {
                            const float bodyFrac = 0.35;
                            const float bodyH    = 0.35;
                            float halfBody = bodyH * 0.5;
                            float c = abs(v - 0.5);

                            float inBodyU = 1.0 - step(bodyFrac, u);
                            float inBodyV = 1.0 - step(halfBody, c);
                            float alphaBody = inBodyU * inBodyV;

                            float b = clamp((u - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
                            float halfHead = 0.5 * (1.0 - b);
                            float inHeadU  = step(bodyFrac, u);
                            float inHeadV  = 1.0 - step(halfHead, c);
                            float alphaHead = inHeadU * inHeadV;

                            return clamp(max(alphaBody, alphaHead), 0.0, 1.0);
                        }

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            float s = materialInput.st.s;
                            float v = materialInput.st.t;

                            float xInSeg = modp(s * repeatCount, 1.0);

                            float totalPixels = dashLength + arrowLength;
                            float dashRatio = dashLength / totalPixels;
                            float arrowRatio = arrowLength / totalPixels;

                            float inArrow = step(dashRatio, xInSeg); 
                            float u = clamp((xInSeg - dashRatio) / max(arrowRatio, 0.001), 0.0, 1.0);
                            float a = inArrow * arrowMask(u, v);

                            vec4 outColor = mix(dashColor, arrowColor, a);
                            float vClip = step(minV, v) * step(v, maxV);
                            
                            material.diffuse = outColor.rgb;
                            material.alpha = outColor.a * mix(vClip, 1.0, a); 

                            return material;
                        }
                    `
                },
                translucent: () => true
            });
        }
    }

    get isConstant(): boolean { return false; }
    get definitionChanged(): Cesium.Event { return this._definitionChanged; }
    getType(_time: Cesium.JulianDate): string { return "ArrowEdgeMaterialPropertyTransparentEdge"; }

    dontgetValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.arrowColor = this._arrowColor.getValue(time);
        result.dashColor = this._dashColor.getValue(time);
        result.dashLength = this._dashLength;
        result.arrowLength = this._arrowLength;

        // 1. Kameranın Yüksekliğini Al (LOD için)
        let alt = 100000.0;
        if (this._scene && this._scene.camera) {
            const carto = this._scene.globe.ellipsoid.cartesianToCartographic(this._scene.camera.positionWC);
            if (carto) {
                alt = Math.max(carto.height, 100.0);
            }
        }

        // --- SENİN FİKRİN: EN KISA SEGMENT REFERANS MANTIĞI ---

        // 2. En Kısa Segmentin Uzunluğunu Bulalım
        let minSegmentLength = Number.MAX_VALUE;
        if (this._positions && this._positions.length >= 2) {
            for (let i = 0; i < this._positions.length - 1; i++) {
                const dist = Cesium.Cartesian3.distance(this._positions[i], this._positions[i+1]);
                if (dist > 0 && dist < minSegmentLength) {
                    minSegmentLength = dist;
                }
            }
        }
        // Güvenlik: Eğer tek nokta varsa veya mesafe 0 ise fallback
        if (minSegmentLength === Number.MAX_VALUE) minSegmentLength = 1000.0; 

        // 3. EN KISA Segment İçin LOD (Zoom) Hesabı
        // "Kamera bu yükseklikteyken, en kısa parçada kaç ok görmek istiyorum?"
        // baseAltitude (örneğin 50.000 metre) yükseklikteyken en kısa parçada 1 ok olsun.
        const BASE_ALTITUDE = 5000000.0; 
        let arrowsOnMinSegment = BASE_ALTITUDE / alt;

        // En kısa segmentte bile en az 1 ok olsun ki çizgi boş kalmasın
        // Dibine girince de çok fazla sıkışmasın (Max 10 ok)
        arrowsOnMinSegment = Math.max(1.0, Math.min(arrowsOnMinSegment, 10.0));

        // 4. Yoğunluk (Density) Hesabı
        // "Eğer en kısa parçada bu kadar ok varsa, metre başına kaç ok düşüyor?"
        const arrowsPerMeter = arrowsOnMinSegment / minSegmentLength;

        // 5. TOPLAM Repeat Count ve Oran-Orantı Dağılımı
        // Metre başına düşen ok sayısını toplam rotanın uzunluğu ile çarpıyoruz.
        // Shader bu toplamı alacak ve uzun parçaya çok, kısa parçaya az oku OTOMATİK dizecek!
        const rawTotalArrows = this._totalLengthMeters * arrowsPerMeter;

        // Oklar yarım kalmasın diye tam sayıya yuvarlıyoruz
        result.repeatCount = Math.max(Math.round(rawTotalArrows), 1.0);

        return result;
    }

    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.arrowColor = this._arrowColor.getValue(time);
        result.dashColor = this._dashColor.getValue(time);
        result.dashLength = this._dashLength;
        result.arrowLength = this._arrowLength;

        // 1. Kameranın Yüksekliğini Al (LOD için)
        let alt = 100000.0;
        if (this._scene && this._scene.camera) {
            const carto = this._scene.globe.ellipsoid.cartesianToCartographic(this._scene.camera.positionWC);
            if (carto) {
                alt = Math.max(carto.height, 100.0);
            }
        }

        // --- SENİN FİKRİN: EN KISA SEGMENT REFERANS MANTIĞI ---

        // 2. En Kısa Segmentin Uzunluğunu Bulalım
        let minSegmentLength = Number.MAX_VALUE;
        if (this._positions && this._positions.length >= 2) {
            for (let i = 0; i < this._positions.length - 1; i++) {
                const dist = Cesium.Cartesian3.distance(this._positions[i], this._positions[i+1]);
                if (dist > 0 && dist < minSegmentLength) {
                    minSegmentLength = dist;
                }
            }
        }
        if (minSegmentLength === Number.MAX_VALUE) minSegmentLength = 1000.0; 

        // ---------------------------------------------------------
        // --- GÜNCELLENEN KISIM: İHA İÇİN YUMUŞATILMIŞ LOD ---
        // ---------------------------------------------------------

        // 3. EN KISA Segment İçin LOD (Zoom) Hesabı
        // İHA rotasını bütünüyle görmek için ideal yükseklik 50 km'dir.
        const BASE_ALTITUDE = 50000.0; 
        
        // Doğrudan bölmek (lineer) yerine Math.sqrt (Karekök) kullanıyoruz.
        // Bu sayede zoom in yaparken oklar birdenbire patlamaz, "abartmadan" yumuşakça artar.
        const zoomMultiplier = Math.sqrt(BASE_ALTITUDE / alt);
        
        // 50 km yüksekteyken en kısa parçada (15 km'lik tırmanış) 1 ok görmek istiyoruz
        let arrowsOnMinSegment = 1.0 * zoomMultiplier;

        // Kelepçe: En kısa segmentte en az 1 ok olsun (boş kalmasın).
        // Ne kadar yaklaşırsak yaklaşalım en fazla 8 ok olsun (karınca duasına dönmesin).
        arrowsOnMinSegment = Math.max(1.0, Math.min(arrowsOnMinSegment, 8.0));

        // ---------------------------------------------------------

        // 4. Yoğunluk (Density) Hesabı
        const arrowsPerMeter = arrowsOnMinSegment / minSegmentLength;

        // 5. TOPLAM Repeat Count ve Oran-Orantı Dağılımı
        const rawTotalArrows = this._totalLengthMeters * arrowsPerMeter;

        // Oklar yarım kalmasın diye tam sayıya yuvarlıyoruz
        result.repeatCount = Math.max(Math.round(rawTotalArrows), 1.0);

        return result;
    }
    equals(other: Cesium.MaterialProperty): boolean {
        return this === other;
    }
}


export class ArrowEdgeMaterialProperty2duzgun_4 implements Cesium.MaterialProperty {
    private _arrowColor: Cesium.Property;
    private _dashColor: Cesium.Property;
    private _dashLength: number;
    private _arrowLength: number;
    private _positions: Cesium.Cartesian3[];
    private _totalLengthMeters: number;
    private _scene: Cesium.Scene;
    private _definitionChanged: Cesium.Event;

    constructor(
        arrowColor: Cesium.Color,
        dashColor: Cesium.Property, // CallbackProperty veya ConstantProperty
        scene: Cesium.Scene,
        positions: Cesium.Cartesian3[],
        totalLengthMeters: number,
        dashLength: number = 115.0,
        arrowLength: number = 35.0
    ) {
        this._arrowColor = new Cesium.ConstantProperty(arrowColor);
        this._dashColor = dashColor;
        this._scene = scene;
        this._positions = positions;
        this._totalLengthMeters = totalLengthMeters;
        this._dashLength = dashLength;
        this._arrowLength = arrowLength;
        this._definitionChanged = new Cesium.Event();

        if (!(Cesium.Material as any)._materialCache._materials["ArrowEdgeMaterialPropertyTransparentEdge"]) {
           (Cesium.Material as any)._materialCache.addMaterial("ArrowEdgeMaterialPropertyTransparentEdge", {
                fabric: {
                    type: "ArrowEdgeMaterialPropertyTransparentEdge",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.PURPLE,
                        dashLength: 115.0,
                        arrowLength: 35.0,
                        repeatCount: 1.0,
                        minV: 0.40,
                        maxV: 0.60
                    },
                    source: `
                        uniform vec4 arrowColor;   
                        uniform vec4 dashColor;
                        uniform float dashLength;
                        uniform float arrowLength;
                        uniform float repeatCount;
                        uniform float minV;
                        uniform float maxV;

                        float modp(float x, float len) {
                            float m = mod(x, len);
                            return m < 0.0 ? m + len : m;
                        }

                        float arrowMask(float u, float v) {
                            const float bodyFrac = 0.35;
                            const float bodyH    = 0.35;
                            float halfBody = bodyH * 0.5;
                            float c = abs(v - 0.5);

                            float inBodyU = 1.0 - step(bodyFrac, u);
                            float inBodyV = 1.0 - step(halfBody, c);
                            float alphaBody = inBodyU * inBodyV;

                            float b = clamp((u - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
                            float halfHead = 0.5 * (1.0 - b);
                            float inHeadU  = step(bodyFrac, u);
                            float inHeadV  = 1.0 - step(halfHead, c);
                            float alphaHead = inHeadU * inHeadV;

                            return clamp(max(alphaBody, alphaHead), 0.0, 1.0);
                        }

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            float s = materialInput.st.s;
                            float v = materialInput.st.t;

                            float xInSeg = modp(s * repeatCount, 1.0);

                            float totalPixels = dashLength + arrowLength;
                            float dashRatio = dashLength / totalPixels;
                            float arrowRatio = arrowLength / totalPixels;

                            float inArrow = step(dashRatio, xInSeg); 
                            float u = clamp((xInSeg - dashRatio) / max(arrowRatio, 0.001), 0.0, 1.0);
                            float a = inArrow * arrowMask(u, v);

                            vec4 outColor = mix(dashColor, arrowColor, a);
                            float vClip = step(minV, v) * step(v, maxV);
                            
                            material.diffuse = outColor.rgb;
                            material.alpha = outColor.a * mix(vClip, 1.0, a); 

                            return material;
                        }
                    `
                },
                translucent: () => true
            });
        }
    }

    get isConstant(): boolean { return false; }
    get definitionChanged(): Cesium.Event { return this._definitionChanged; }
    getType(_time: Cesium.JulianDate): string { return "ArrowEdgeMaterialPropertyTransparentEdge"; }

getValue(time: Cesium.JulianDate, result?: any): any {
    if (!result) result = {};
    result.arrowColor = this._arrowColor.getValue(time);
    result.dashColor = this._dashColor.getValue(time);
    result.dashLength = this._dashLength;
    result.arrowLength = this._arrowLength;

    // 1. Kameranın Yüksekliğini Al
    let alt = 100000.0;
    if (this._scene && this._scene.camera) {
        const carto = this._scene.globe.ellipsoid.cartesianToCartographic(this._scene.camera.positionWC);
        if (carto) {
            alt = Math.max(carto.height, 500.0); // Yere çakılma payı (500m)
        }
    }

    // --- SHADER BEST PRACTICE: LOGARİTMİK LOD MANTIĞI ---

    // 2. Referans Yoğunluğu (Ana Çıpa)
    // "Kamera 100 km yukarıdayken, her 20 kilometrede 1 ok olsun"
    const REF_ALTITUDE = 100000.0; 
    const BASE_METERS_PER_ARROW = 20000.0; 

    // 3. Logaritmik Zoom Seviyesi (Sihirli Kısım)
    // Math.log2 kullanımı, harita sektörünün altın kuralıdır.
    // Yükseklik her yarıya düştüğünde (100k -> 50k -> 25k) zoomLevel tam 1 artar.
    const altRatio = REF_ALTITUDE / alt;
    const zoomLevel = Math.log2(Math.max(altRatio, 0.1)); 

    // 4. "Abartmadan" Çoğaltma Çarpanı
    // Eğer 2.0 kullanırsak her zoom'da ok sayısı 2'ye katlanır (Çok abartılı olur).
    // 1.3 ile 1.6 arası bir değer kullanmak, gözü yormayan o "tatlı" geçişi sağlar.
    const scaleFactor = Math.pow(1.5, zoomLevel); 

    // 5. O Anki İdeal Boşluk (Mesafe)
    let currentMetersPerArrow = BASE_METERS_PER_ARROW / scaleFactor;

    // 6. Güvenlik Kelepçesi (Sınırlar)
    // Ne kadar yaklaşırsan yaklaş oklar arası 2 km'den daha fazla sıkışmasın.
    // Ne kadar uzaklaşırsan uzaklaş oklar arası 100 km'den daha fazla açılmasın.
    currentMetersPerArrow = Math.max(2000.0, Math.min(currentMetersPerArrow, 100000.0));

    // 7. Toplam Rota Üzerinden Tek Hesap (Segment İnadı Yok!)
    // Toplam uzunluğu, o anki ideal ok boşluğuna bölüyoruz.
    const rawRepeat = this._totalLengthMeters / currentMetersPerArrow;

    // 8. Sonuç
    // Yarım ok çıkmasını engellemek için tam sayıya yuvarlıyoruz.
    result.repeatCount = Math.max(Math.round(rawRepeat), 1.0);

    return result;
}
    equals(other: Cesium.MaterialProperty): boolean {
        return this === other;
    }
}


export class ArrowEdgeMaterialProperty22 implements Cesium.MaterialProperty {
    private _arrowColor: Cesium.Property;
    private _dashColor: Cesium.Property;
    private _totalLengthMeters: number; // YENİ: Gerçek uzunluk
    private _definitionChanged: Cesium.Event;

    constructor(
        arrowColor: Cesium.Color,
        dashColor: Cesium.CallbackProperty,
        totalLengthMeters: number // YENİ: Parametre olarak alıyoruz
    ) {
        this._arrowColor = new Cesium.ConstantProperty(arrowColor);
        this._dashColor = dashColor;
        this._totalLengthMeters = totalLengthMeters;
        this._definitionChanged = new Cesium.Event();

        if (!(Cesium.Material as any)._materialCache._materials["ArrowEdgeMaterialPropertyTransparentEdge"]) {
            (Cesium.Material as any)._materialCache.addMaterial("ArrowEdgeMaterialPropertyTransparentEdge", {
                // fabric objesi Cesium'a özel GLSL (ekran kartı dili) kodumuzu sisteme enjekte ettiğimiz yerdir
                // Ekran kartı (GPU), pikselleri boyarken source içindeki metni okur.
                fabric: {
                    type: "ArrowEdgeMaterialPropertyTransparentEdge",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.fromBytes(239, 12, 249, 255),
                        dashLength: 48.0,
                        arrowLength: 16.0,
                        totalLength: 1000.0, // JS'den dinamik beslenecek
                        minV: 0.40, // Alt sınır
                        maxV: 0.60  // Üst sınır
                    },                    
                    source: `
                        uniform vec4 arrowColor;   
                        uniform vec4 dashColor;
                        uniform float dashLength;
                        uniform float arrowLength;
                        uniform float totalLength; // GERÇEK ÇİZGİ UZUNLUĞU
                        uniform float minV;
                        uniform float maxV;
                        in float v_polylineAngle;

                        // Ekrandaki piksellerin koordinatlarını, çizginin ekrandaki açısına göre döndürmek için 
                        // bir rotasyon matrisi oluşturur.
                        mat2 rotate(float rad) {
                            float c = cos(rad);
                            float s = sin(rad);
                            return mat2(c, s, -s, c);
                        }

                        // Klasik mod (bölümünden kalan) alma işlemidir. 
                        // Çizgi boyunca "48px çizgi, 16px ok" desenini sürekli tekrar ettirmek (loop) için kullanılır.
                        float modp(float x, float len) {
                            float m = mod(x, len);
                            return m < 0.0 ? m + len : m;
                        }

                        // Ok Şeklini Çizen Fonksiyon
                        // Poligon hep devasa bir dikdörtgen şerit olarak kalıyor.
                        // sadece o şeridin içine bir ok resmi çizip,
                        // resmin dışında kalan tüm piksellerin saydamlığını (alpha) sıfıra indirerek şekli elde ediyoruz.
                        float arrowMask(float u, float v) {
                            const float bodyFrac = 0.30;
                            const float bodyH    = 0.35;
                            float halfBody = bodyH * 0.5;
                            float c = abs(v - 0.5);

                            float inBodyU = 1.0 - step(bodyFrac, u);
                            float inBodyV = 1.0 - step(halfBody, c);
                            float alphaBody = inBodyU * inBodyV;

                            float b = clamp((u - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
                            float halfHead = 0.5 * (1.0 - b);
                            float inHeadU  = step(bodyFrac, u);
                            float inHeadV  = 1.0 - step(halfHead, c);
                            float alphaHead = inHeadU * inHeadV;

                            return clamp(max(alphaBody, alphaHead), 0.0, 1.0);
                        }

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            
                            // Çizginin o anki noktasındaki (0.0 - 1.0 arası) ilerlemesi
                            float s = materialInput.st.s;
                            float v = materialInput.st.t;

                            // gl_FragCoord.w bize o anki pikselin kameraya ne kadar uzak olduğunu (derinliğini) verir.
                            float distToCamera = 1.0 / gl_FragCoord.w;

                            // Bu derinlikte 1 ekran pikseli gerçek dünyada kaç metre yer kaplıyor?
                            float mpp = czm_metersPerPixel(vec4(0.0, 0.0, -distToCamera, 1.0));

                            // EKRANDAKİ DESEN BOYUTUNU METREYE ÇEVİR
                            float segmentPixels = (dashLength + arrowLength) * czm_pixelRatio; // 64px
                            float segmentMeters = segmentPixels * mpp; // 64 pikselin o anki metre karşılığı

                            // KESİN TEKRAR SAYISI (Senin dediğin gerçek matematik)
                            // Toplam uzunluğu, bir desenin metre cinsinden uzunluğuna böleriz.
                            float repeatCount = max(totalLength / max(segmentMeters, 0.001), 1.0);

                            float xInSeg = modp(s * repeatCount, 1.0); 

                            // 48/64 = 0.75 dash oranı
                            float dashLimit = dashLength / (dashLength + arrowLength); 
                            float inArrow = step(dashLimit, xInSeg);

                            float u = clamp((xInSeg - dashLimit) / (1.0 - dashLimit), 0.0, 1.0);                            
                            float a = inArrow * arrowMask(u, v);

                            vec4 dashCol = dashColor;
                            vec4 arrowCol = arrowColor;
                            vec4 outColor = mix(dashCol, arrowCol, a);

                            float vClip = step(minV, v) * step(v, maxV);
                            
                            material.diffuse = outColor.rgb;
                            material.alpha = outColor.a * mix(vClip, 1.0, a); 

                            return material;
                        }`
                },
                translucent: () => true
            });
        }
    }

    // Bunları doğrudan Cesium'un ana render döngüsü (Event Loop) çağırır.


    // Cesium'a performans tüyosu.
    // true : bu materyalin özellikleri zamanla değişmiyor,  getValue metodunu her saniye çağırma bir kere oku yeter
    // false (veya renkler CallbackProperty ise) dönersen, Cesium getValue'yu sürekli çağırıp verileri GPU'ya akıtır.
    get isConstant(): boolean { return false; } // Zoom yapıldıkça mpp değişeceği için false

    get definitionChanged(): Cesium.Event { return this._definitionChanged; }

    // Cesium sorar "Bu materyalin GLSL kodu (shader) hangisi?".
    // metot "ArrowEdgeMaterialPropertyTransparentEdge" stringini döner.
    // Cesium da gidip önbellekten o GLSL kodunu bulur.
    getType(_time: Cesium.JulianDate): string { return "ArrowEdgeMaterialPropertyTransparentEdge"; }

    // Cesium, kamerayı her hareket ettirdiğinde veya her yeni saniyede (time) bu metodu çağırır.
    // tanımladığın arrowColor ve dashColor değerlerini (Property) okur ve bunları GLSL tarafındaki uniform değişkenlere (köprülere) enjekte eder.
    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.arrowColor = this._arrowColor.getValue(time);
        result.dashColor = this._dashColor.getValue(time);
        result.totalLength = this._totalLengthMeters; // Gerçek uzunluğu GPU'ya gönderiyoruz
        return result;
    }

    equals(other: Cesium.MaterialProperty): boolean {
        return this === other;
    }
}


export class ArrowEdgeMaterialPropertyIlk implements Cesium.MaterialProperty {
    private _arrowColor: Cesium.Property;
    private _dashColor: Cesium.Property;
    private _definitionChanged: Cesium.Event;

    constructor(
        arrowColor: Cesium.Color,
        dashColor: Cesium.CallbackProperty
    ) {
        this._arrowColor = new Cesium.ConstantProperty(arrowColor);
        this._dashColor = dashColor;
        this._definitionChanged = new Cesium.Event();

        if (!(Cesium.Material as any)._materialCache._materials["ArrowEdgeMaterialPropertyTransparentEdge"]) {
            (Cesium.Material as any)._materialCache.addMaterial("ArrowEdgeMaterialPropertyTransparentEdge", {
                // fabric objesi Cesium'a özel GLSL (ekran kartı dili) kodumuzu sisteme enjekte ettiğimiz yerdir
                // Ekran kartı (GPU), pikselleri boyarken source içindeki metni okur.
                fabric: {
                    type: "ArrowEdgeMaterialPropertyTransparentEdge",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.fromBytes(239, 12, 249, 255),
                        dashLength: 48.0,
                        arrowLength: 16.0,
                        minV: 0.40, // Alt sınır
                        maxV: 0.60  // Üst sınır
                    },
                    source: `
                        uniform vec4 arrowColor;   
                        uniform vec4 dashColor;
                        uniform float dashLength;
                        uniform float arrowLength;
                        uniform float minV;
                        uniform float maxV;
                        in float v_polylineAngle;

                        // Ekrandaki piksellerin koordinatlarını, çizginin ekrandaki açısına göre döndürmek için 
                        // bir rotasyon matrisi oluşturur.
                        mat2 rotate(float rad) {
                            float c = cos(rad);
                            float s = sin(rad);
                            return mat2(c, s, -s, c);
                        }

                        // Klasik mod (bölümünden kalan) alma işlemidir. 
                        // Çizgi boyunca "48px çizgi, 16px ok" desenini sürekli tekrar ettirmek (loop) için kullanılır.
                        float modp(float x, float len) {
                            float m = mod(x, len);
                            return m < 0.0 ? m + len : m;
                        }

                        // Ok Şeklini Çizen Fonksiyon
                        // Poligon hep devasa bir dikdörtgen şerit olarak kalıyor.
                        // sadece o şeridin içine bir ok resmi çizip,
                        // resmin dışında kalan tüm piksellerin saydamlığını (alpha) sıfıra indirerek şekli elde ediyoruz.
                        float arrowMask(float u, float v) {
                            const float bodyFrac = 0.30;
                            const float bodyH    = 0.35;
                            float halfBody = bodyH * 0.5;
                            float c = abs(v - 0.5);

                            float inBodyU = 1.0 - step(bodyFrac, u);
                            float inBodyV = 1.0 - step(halfBody, c);
                            float alphaBody = inBodyU * inBodyV;

                            float b = clamp((u - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
                            float halfHead = 0.5 * (1.0 - b);
                            float inHeadU  = step(bodyFrac, u);
                            float inHeadV  = 1.0 - step(halfHead, c);
                            float alphaHead = inHeadU * inHeadV;

                            return clamp(max(alphaBody, alphaHead), 0.0, 1.0);
                        }

                        // GPU, ekrana bir poligon (örneğin senin uçuş rotan) çizerken,
                        // o poligonun içini dolduracak her bir mikroskobik piksel için bu fonksiyonu çağırır.
                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            // materialInput: Cesium'un GPU'ya gönderdiği bir veri paketidir. 
                            // İçinde o an boyanacak pikselin 3D dünyadaki konumu,
                            // en önemlisi doku koordinatları (st) bulunur
                            // czm_getDefaultMaterial(): Boş, renksiz, standart bir materyal objesi oluşturur. 
                            // o boş objeyi (material) alıp, kendi hesaplamalarımızla renklendirip (diffuse ve alpha vererek) geriye döndürcez
                            czm_material material = czm_getDefaultMaterial(materialInput);

                            // st, çizginin doku koordinatıdır. s yatayda 0'dan 1'e ilerler (başlangıçtan bitişe),
                            // t ise dikeyde 0'dan 1'e ilerler (çizginin alt kenarından üst kenarına)
                            vec2 st = materialInput.st;

                            // - gl_FragCoord.xy: O an boyanan pikselin monitöründeki fiziksel koordinatıdır 
                            // (Örn: Ekranın 800. pikseli, 600. pikseli). Haritayla hiçbir ilgisi yoktur, cama çizilir gibi davranır.
                            // - rotate(v_polylineAngle): Çizgi ekranda çapraz duruyorsa,ekranı o anki çizginin açısına göre döndürür. 
                            // Böylece pos.x bize her zaman çizginin başından sonuna doğru akan mesafeyi verir.
                            vec2 pos = rotate(v_polylineAngle) * gl_FragCoord.xy;

                            // Ekrandaki o anki pikselin (pos.x), toplam desen uzunluğunun (48+16 = 64 piksel) 
                            // neresinde olduğunu bulur. Deseni ekrana döşer.
                            float pixelDashLength  = max(dashLength  * czm_pixelRatio, 1.0);
                            float pixelArrowLength = max(arrowLength * czm_pixelRatio, 1.0);
                            float pixelSegmentLength = pixelDashLength + pixelArrowLength;
                            float xInSeg = modp(pos.x, pixelSegmentLength);

                            // Eğer 64 piksellik döngünün son 16 pikselindeysek (inArrow), 
                            // arrowMask fonksiyonunu çağırıp o pikseli okun bir parçası olarak çizer.
                            float inArrow = step(pixelDashLength, xInSeg); // Çizgide miyiz, Okta mıyız?
                            // Eğer ok çizeceksek, okun başından sonuna kadar olan 16 piksellik alanı 0.0 ile 1.0 arasına (u ekseni) sıkıştırırız 
                            // ki arrowMask fonksiyonu (okun şeklini çizen fonskiyon) düzgün çalışabilsin. v ise dikey (kalınlık) koordinatımızdır (0.0 alt kenar, 1.0 üst kenar, 0.5 tam orta).
                            float u = clamp((xInSeg - pixelDashLength) / pixelArrowLength, 0.0, 1.0);
                            float v = st.t;
                            float a = inArrow * arrowMask(u, v);

                            // a değeri 1 ise okun rengini (arrowColor), 0 ise arka plan çizgisinin rengini (dashColor) kullanır.
                            vec4 dashCol = dashColor;
                            vec4 arrowCol = arrowColor;

                            // piksel ok bölgesinde mi yoksa boşluk/çizgi bölgesinde mi
                            // Okun içindeyse a=1.0, dışındaysa a=0.0
                            vec4 outColor = mix(dashCol, arrowCol, a);

                            // minV (0.40) ve maxV (0.60) kullanılarak, çizginin (dash) kalınlığı daraltılır. Çizgi tüm genişliği kaplamak yerine sadece ortadaki %20'lik ince kısımda görünür.
                            // Oklar (a > 0.0) ise bu kırpmadan etkilenmez ve dışarı taşıyormuş gibi büyük görünür.
                            // Sadece arka plan (dash) kısmı için V aralığı dışında alpha sıfırla
                            float vClip = step(minV, v) * step(v, maxV); // 1.0 veya 0.0
                            // Eğer a <= 0 ise (yani o an oku değil, sadece arka plan çizgisini boyuyorsak) içeri gir.
                            // Eğer bu 0.40-0.60 aralığın dışındaysak (vClip = 0.0): outColor.a sıfırla çarpılır, o piksel tamamen şeffaf (transparan) olur.
                            if (a <= 0.0) {
                                outColor.a *= vClip;
                            }

                            // czm_antialias: Kenar yumuşatma.
                            outColor = czm_antialias(vec4(0.0), outColor, outColor, min(st.t, 1.0 - st.t));
                            outColor = czm_gammaCorrect(outColor);

                            // diffuse (temel renk) kanalına, saydamlığını (a) ise alpha kanalına atıyoruz.
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

    // Bunları doğrudan Cesium'un ana render döngüsü (Event Loop) çağırır.


    // Cesium'a performans tüyosu.
    // true : bu materyalin özellikleri zamanla değişmiyor,  getValue metodunu her saniye çağırma bir kere oku yeter
    // false (veya renkler CallbackProperty ise) dönersen, Cesium getValue'yu sürekli çağırıp verileri GPU'ya akıtır.
    get isConstant(): boolean {
        const ac = (this._arrowColor as any)?.isConstant ?? true;
        const dc = (this._dashColor as any)?.isConstant ?? true;
        return ac && dc;
    }

    get definitionChanged(): Cesium.Event { return this._definitionChanged; }

    // Cesium sorar "Bu materyalin GLSL kodu (shader) hangisi?".
    // metot "ArrowEdgeMaterialPropertyTransparentEdge" stringini döner.
    // Cesium da gidip önbellekten o GLSL kodunu bulur.
    getType(_time: Cesium.JulianDate): string { return "ArrowEdgeMaterialPropertyTransparentEdge"; }

    // Cesium, kamerayı her hareket ettirdiğinde veya her yeni saniyede (time) bu metodu çağırır.
    // tanımladığın arrowColor ve dashColor değerlerini (Property) okur ve bunları GLSL tarafındaki uniform değişkenlere (köprülere) enjekte eder.
    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.arrowColor = this._arrowColor.getValue(time);
        result.dashColor = this._dashColor.getValue(time);
        return result;
    }

    equals(other: Cesium.MaterialProperty): boolean {
        return (
            other instanceof ArrowEdgeMaterialPropertyIlk &&
            (other as any)._arrowColor?.equals?.(this._arrowColor) === true &&
            (other as any)._dashColor?.equals?.(this._dashColor) === true
        );
    }
}


export class ArrowEdgeMaterialProperty implements Cesium.MaterialProperty {
    private _arrowColor: Cesium.Property;
    private _dashColor: Cesium.Property;
    private _definitionChanged: Cesium.Event;

    constructor(
        arrowColor: Cesium.Color,
        dashColor: Cesium.CallbackProperty
    ) {
        this._arrowColor = new Cesium.ConstantProperty(arrowColor);
        this._dashColor = dashColor;
        this._definitionChanged = new Cesium.Event();

        if (!(Cesium.Material as any)._materialCache._materials["ArrowEdgeMaterialPropertyTransparentEdge"]) {
            (Cesium.Material as any)._materialCache.addMaterial("ArrowEdgeMaterialPropertyTransparentEdge", {
                fabric: {
                    type: "ArrowEdgeMaterialPropertyTransparentEdge",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.fromBytes(239, 12, 249, 255),
                        dashLength: 48.0,
                        arrowLength: 16.0,
                        minV: 0.40, // Alt sınır
                        maxV: 0.60  // Üst sınır
                    },
                    source: `
                        uniform vec4 arrowColor;   
                        uniform vec4 dashColor;
                        uniform float dashLength;
                        uniform float arrowLength;
                        uniform float minV;
                        uniform float maxV;
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

                        float arrowMask(float u, float v) {
                            const float bodyFrac = 0.30;
                            const float bodyH    = 0.35;
                            float halfBody = bodyH * 0.5;
                            float c = abs(v - 0.5);

                            float inBodyU = 1.0 - step(bodyFrac, u);
                            float inBodyV = 1.0 - step(halfBody, c);
                            float alphaBody = inBodyU * inBodyV;

                            float b = clamp((u - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
                            float halfHead = 0.5 * (1.0 - b);
                            float inHeadU  = step(bodyFrac, u);
                            float inHeadV  = 1.0 - step(halfHead, c);
                            float alphaHead = inHeadU * inHeadV;

                            return clamp(max(alphaBody, alphaHead), 0.0, 1.0);
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
                            float a = inArrow * arrowMask(u, v);

                            vec4 dashCol = dashColor;
                            vec4 arrowCol = arrowColor;

                            vec4 outColor = mix(dashCol, arrowCol, a);

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
    getType(_time: Cesium.JulianDate): string { return "ArrowEdgeMaterialPropertyTransparentEdge"; }

    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.arrowColor = this._arrowColor.getValue(time);
        result.dashColor = this._dashColor.getValue(time);
        return result;
    }

    equals(other: Cesium.MaterialProperty): boolean {
        return (
            other instanceof ArrowEdgeMaterialProperty &&
            (other as any)._arrowColor?.equals?.(this._arrowColor) === true &&
            (other as any)._dashColor?.equals?.(this._dashColor) === true
        );
    }
}


/*

export class ChevronArrowEdgeMaterialProperty implements Cesium.MaterialProperty {
    private _arrowColor: Cesium.Property;
    private _dashColor: Cesium.Property;
    private _definitionChanged: Cesium.Event;

    constructor(
        arrowColor: Cesium.Color,
        dashColor: Cesium.CallbackProperty
    ) {
        this._arrowColor = new Cesium.ConstantProperty(arrowColor);
        this._dashColor = dashColor;
        this._definitionChanged = new Cesium.Event();

        if (!(Cesium.Material as any)._materialCache._materials["ChevronArrowMaterialPropertyVClipBackgroundOnly"]) {
            (Cesium.Material as any)._materialCache.addMaterial("ChevronArrowMaterialPropertyVClipBackgroundOnly", {
                fabric: {
                    type: "ChevronArrowMaterialPropertyVClipBackgroundOnly",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.fromBytes(239, 12, 249, 255),
                        dashLength: 48.0,
                        arrowLength: 12.0,
                        minV: 0.40, // Alt sınır
                        maxV: 0.60  // Üst sınır
                    },
                    source: `
                        uniform vec4 arrowColor;
                        uniform vec4 dashColor;
                        uniform float dashLength;
                        uniform float arrowLength;
                        uniform float minV;
                        uniform float maxV;
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

                        bool pointInParallelogram(vec2 p, vec2 topStart, vec2 bottomStart, vec2 topEnd) {
                            vec2 v1 = bottomStart - topStart;
                            vec2 v2 = topEnd - topStart;
                            vec2 vP = p - topStart;

                            float dot00 = dot(v1, v1);
                            float dot01 = dot(v1, v2);
                            float dot11 = dot(v2, v2);
                            float dotP0 = dot(vP, v1);
                            float dotP1 = dot(vP, v2);

                            float denom = dot00 * dot11 - dot01 * dot01;
                            if (denom == 0.0) return false;
                            float u = (dot11 * dotP0 - dot01 * dotP1) / denom;
                            float v = (dot00 * dotP1 - dot01 * dotP0) / denom;

                            return (u > 0.0) && (u < 1.0) && (v > 0.0) && (v < 1.0);
                        }

                        float chevronMask(float u, float v) {
                            float totalThickness = 0.6;
                            float edgeThickness = 0.1;
                            vec2 p = vec2(u, v);

                            vec2 leftOuterTopStart = vec2(0.0, 1.0);
                            vec2 leftOuterTopEnd = vec2(totalThickness, 1.0);
                            vec2 leftOuterBottomStart = vec2(1.0 - totalThickness, 0.5);

                            vec2 rightOuterTopStart = vec2(1.0 - totalThickness, 0.5);
                            vec2 rightOuterTopEnd = vec2(1.0, 0.5);
                            vec2 rightOuterBottomStart = vec2(0.0, 0.0);

                            vec2 leftInnerTopStart = vec2(edgeThickness, 1.0 - edgeThickness);
                            vec2 leftInnerTopEnd = vec2(totalThickness - edgeThickness, 1.0 - edgeThickness);
                            vec2 leftInnerBottomStart = vec2(1.0 - totalThickness + edgeThickness, 0.5);

                            vec2 rightInnerTopStart = vec2(1.0 - totalThickness + edgeThickness, 0.5);
                            vec2 rightInnerTopEnd = vec2(1.0 - edgeThickness, 0.5);
                            vec2 rightInnerBottomStart = vec2(edgeThickness, edgeThickness);

                            bool inLeftOuter = pointInParallelogram(p, leftOuterTopStart, leftOuterBottomStart, leftOuterTopEnd);
                            bool inRightOuter = pointInParallelogram(p, rightOuterTopStart, rightOuterBottomStart, rightOuterTopEnd);

                            bool inLeftInner = pointInParallelogram(p, leftInnerTopStart, leftInnerBottomStart, leftInnerTopEnd);
                            bool inRightInner = pointInParallelogram(p, rightInnerTopStart, rightInnerBottomStart, rightInnerTopEnd);

                            if ((inLeftOuter || inRightOuter) && !(inLeftInner || inRightInner)) {
                                return 2.0; // Sadece dışta
                            }
                            if (inLeftInner || inRightInner) {
                                return 1.0; // İçte
                            }
                            return 0.0; // Hiçbirinde değil
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
                            float mask = inArrow * chevronMask(u, v);

                            vec4 dashCol = dashColor;
                            vec4 arrowCol = arrowColor;
                            vec4 outColor = dashCol;

                            if (mask == 1.0) {
                                outColor = arrowCol;
                            } else if (mask == 2.0) {
                                outColor = vec4(0.0, 0.0, 0.0, 1.0); // Siyah kenar
                            }

                            // Sadece arka plan (dash ve siyah kenar) için V aralığı dışında alpha sıfırla
                            float vClip = step(minV, v) * step(v, maxV);
                            if (mask != 1.0) {
                                outColor.a *= vClip;
                            }
                            // Ok maskesi varsa alpha tam opak kalır

                            outColor = czm_antialias(vec4(0.0), outColor, outColor, min(st.t, 1.0 - st.t));
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
    getType(_time: Cesium.JulianDate): string { return "ChevronArrowMaterialPropertyVClipBackgroundOnly"; }

    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.arrowColor = this._arrowColor.getValue(time);
        result.dashColor = this._dashColor.getValue(time);
        return result;
    }

    equals(other: Cesium.MaterialProperty): boolean {
        return (
            other instanceof ChevronArrowMaterialProperty &&
            (other as any)._arrowColor?.equals?.(this._arrowColor) === true &&
            (other as any)._dashColor?.equals?.(this._dashColor) === true
        );
    }
}

export class ChevronDoubleArrowEdgeMaterialProperty implements Cesium.MaterialProperty {
    private _arrowColor: Cesium.Property;
    private _dashColor: Cesium.Property;
    private _definitionChanged: Cesium.Event;

    constructor(
        arrowColor: Cesium.Color,
        dashColor: Cesium.CallbackProperty
    ) {
        this._arrowColor = new Cesium.ConstantProperty(arrowColor);
        this._dashColor = dashColor;
        this._definitionChanged = new Cesium.Event();

        if (!(Cesium.Material as any)._materialCache._materials["ChevronDoubleArrowMaterialPropertyVClipBackgroundOnly"]) {
            (Cesium.Material as any)._materialCache.addMaterial("ChevronDoubleArrowMaterialPropertyVClipBackgroundOnly", {
                fabric: {
                    type: "ChevronDoubleArrowMaterialPropertyVClipBackgroundOnly",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.fromBytes(239, 12, 249, 255),
                        dashLength: 48.0,
                        arrowLength: 24.0,
                        minV: 0.40, // Alt sınır
                        maxV: 0.60  // Üst sınır
                    },
                    source: `
                        uniform vec4 arrowColor;
                        uniform vec4 dashColor;
                        uniform float dashLength;
                        uniform float arrowLength;
                        uniform float minV;
                        uniform float maxV;
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

                        bool pointInParallelogram(vec2 p, vec2 topStart, vec2 bottomStart, vec2 topEnd) {
                            vec2 v1 = bottomStart - topStart;
                            vec2 v2 = topEnd - topStart;
                            vec2 vP = p - topStart;

                            float dot00 = dot(v1, v1);
                            float dot01 = dot(v1, v2);
                            float dot11 = dot(v2, v2);
                            float dotP0 = dot(vP, v1);
                            float dotP1 = dot(vP, v2);

                            float denom = dot00 * dot11 - dot01 * dot01;
                            if (denom == 0.0) return false;
                            float u = (dot11 * dotP0 - dot01 * dotP1) / denom;
                            float v = (dot00 * dotP1 - dot01 * dotP0) / denom;

                            return (u > 0.0) && (u < 1.0) && (v > 0.0) && (v < 1.0);
                        }

                        float doubleChevronMask(float u, float v) {
                            float totalThickness = 0.3;
                            float edgeThickness = 0.1;
                            float edgeThicknessU = 0.05;
                            vec2 p = vec2(u, v);

                            // İlk chevron (sol)
                            float chevron1Start = 0.1;
                            float chevron1End = 0.6;

                            // İkinci chevron (sağ)
                            float chevron2Start = 0.4;
                            float chevron2End = 0.9;

                            // --- 1. Chevron paralelkenarları ---
                            vec2 leftOuterTopStart1 = vec2(chevron1Start, 1.0);
                            vec2 leftOuterTopEnd1 = vec2(chevron1Start + totalThickness, 1.0);
                            vec2 leftOuterBottomStart1 = vec2(chevron1End - totalThickness, 0.5);

                            vec2 rightOuterTopStart1 = vec2(chevron1End - totalThickness, 0.5);
                            vec2 rightOuterTopEnd1 = vec2(chevron1End, 0.5);
                            vec2 rightOuterBottomStart1 = vec2(chevron1Start, 0.0);

                            vec2 leftInnerTopStart1 = vec2(chevron1Start + edgeThicknessU, 1.0 - edgeThickness);
                            vec2 leftInnerTopEnd1 = vec2(chevron1Start + totalThickness - edgeThicknessU, 1.0 - edgeThickness);
                            vec2 leftInnerBottomStart1 = vec2(chevron1End - totalThickness + edgeThicknessU, 0.5);

                            vec2 rightInnerTopStart1 = vec2(chevron1End - totalThickness + edgeThicknessU, 0.5);
                            vec2 rightInnerTopEnd1 = vec2(chevron1End - edgeThicknessU, 0.5);
                            vec2 rightInnerBottomStart1 = vec2(chevron1Start + edgeThicknessU, edgeThickness);

                            // --- 2. Chevron paralelkenarları ---
                            vec2 leftOuterTopStart2 = vec2(chevron2Start, 1.0);
                            vec2 leftOuterTopEnd2 = vec2(chevron2Start + totalThickness, 1.0);
                            vec2 leftOuterBottomStart2 = vec2(chevron2End - totalThickness, 0.5);

                            vec2 rightOuterTopStart2 = vec2(chevron2End - totalThickness, 0.5);
                            vec2 rightOuterTopEnd2 = vec2(chevron2End, 0.5);
                            vec2 rightOuterBottomStart2 = vec2(chevron2Start, 0.0);

                            vec2 leftInnerTopStart2 = vec2(chevron2Start + edgeThicknessU, 1.0 - edgeThickness);
                            vec2 leftInnerTopEnd2 = vec2(chevron2Start + totalThickness - edgeThicknessU, 1.0 - edgeThickness);
                            vec2 leftInnerBottomStart2 = vec2(chevron2End - totalThickness + edgeThicknessU, 0.5);

                            vec2 rightInnerTopStart2 = vec2(chevron2End - totalThickness + edgeThicknessU, 0.5);
                            vec2 rightInnerTopEnd2 = vec2(chevron2End - edgeThicknessU, 0.5);
                            vec2 rightInnerBottomStart2 = vec2(chevron2Start + edgeThicknessU, edgeThickness);

                            // --- Mask kontrolü ---
                            bool inLeftOuter1 = pointInParallelogram(p, leftOuterTopStart1, leftOuterBottomStart1, leftOuterTopEnd1);
                            bool inRightOuter1 = pointInParallelogram(p, rightOuterTopStart1, rightOuterBottomStart1, rightOuterTopEnd1);
                            bool inLeftInner1 = pointInParallelogram(p, leftInnerTopStart1, leftInnerBottomStart1, leftInnerTopEnd1);
                            bool inRightInner1 = pointInParallelogram(p, rightInnerTopStart1, rightInnerBottomStart1, rightInnerTopEnd1);

                            bool inLeftOuter2 = pointInParallelogram(p, leftOuterTopStart2, leftOuterBottomStart2, leftOuterTopEnd2);
                            bool inRightOuter2 = pointInParallelogram(p, rightOuterTopStart2, rightOuterBottomStart2, rightOuterTopEnd2);
                            bool inLeftInner2 = pointInParallelogram(p, leftInnerTopStart2, leftInnerBottomStart2, leftInnerTopEnd2);
                            bool inRightInner2 = pointInParallelogram(p, rightInnerTopStart2, rightInnerBottomStart2, rightInnerTopEnd2);

                            float mask1 = 0.0;
                            if ((inLeftOuter1 || inRightOuter1) && !(inLeftInner1 || inRightInner1)) mask1 = 2.0;
                            if (inLeftInner1 || inRightInner1) mask1 = 1.0;

                            float mask2 = 0.0;
                            if ((inLeftOuter2 || inRightOuter2) && !(inLeftInner2 || inRightInner2)) mask2 = 2.0;
                            if (inLeftInner2 || inRightInner2) mask2 = 1.0;

                            return max(mask1, mask2);
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
                            float mask = inArrow * doubleChevronMask(u, v);

                            vec4 dashCol = dashColor;
                            vec4 arrowCol = arrowColor;
                            vec4 outColor = dashCol;

                            if (mask == 1.0) {
                                outColor = arrowCol;
                            } else if (mask == 2.0) {
                                outColor = vec4(0.0, 0.0, 0.0, 1.0); // Siyah kenar
                            }

                            // Sadece arka plan (dash ve siyah kenar) için V aralığı dışında alpha sıfırla
                            float vClip = step(minV, v) * step(v, maxV);
                            if (mask != 1.0) {
                                outColor.a *= vClip;
                            }

                            outColor = czm_antialias(vec4(0.0), outColor, outColor, min(st.t, 1.0 - st.t));
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
    getType(_time: Cesium.JulianDate): string { return "ChevronDoubleArrowMaterialPropertyVClipBackgroundOnly"; }

    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.arrowColor = this._arrowColor.getValue(time);
        result.dashColor = this._dashColor.getValue(time);
        return result;
    }

    equals(other: Cesium.MaterialProperty): boolean {
        return (
            other instanceof ChevronDoubleArrowEdgeMaterialProperty &&
            (other as any)._arrowColor?.equals?.(this._arrowColor) === true &&
            (other as any)._dashColor?.equals?.(this._dashColor) === true
        );
    }
}
*/

// ============================================================================
// HİBRİT YAKLAŞIM: Dünya-Çakılı Pozisyon + Ekran-Uzayı Şekil Boyutlandırma
// ============================================================================
// Bu sınıf 3 hedefe aynı anda ulaşır:
// 1. Oklar polyline üzerinde eşit mesafeli → st.s (mesafe bazlı, 0→1)
// 2. Pan sırasında kaymaz → repeatCount SABİT (kamera ile değişmez)
// 3. Perspektifte bozulmaz → czm_metersPerPixel per-piksel hesap (shader'da)
// ============================================================================
export class ArrowEdgeMaterialPropertySabit implements Cesium.MaterialProperty {
    private _arrowColor: Cesium.Property;
    private _dashColor: Cesium.Property;
    private _repeatCount: number;          // SABİT — kamera ile DEĞİŞMEZ
    private _totalLengthMeters: number;    // Polyline'ın gerçek uzunluğu (metre)
    private _arrowPixelSize: number;       // Okun hedef ekran boyutu (piksel)
    private _definitionChanged: Cesium.Event;

    constructor(
        arrowColor: Cesium.Color,
        dashColor: Cesium.Property,
        totalLengthMeters: number,
        positions: Cesium.Cartesian3[],
        desiredSpacingMeters: number = 15000.0,  // Her 15 km'de bir ok
        arrowPixelSize: number = 20.0            // Ok boyutu (piksel)
    ) {
        this._arrowColor = new Cesium.ConstantProperty(arrowColor);
        this._dashColor = dashColor;
        this._totalLengthMeters = totalLengthMeters;
        this._arrowPixelSize = arrowPixelSize;
        this._definitionChanged = new Cesium.Event();

        // ÖNEMLİ: repeatCount BİR KEZ hesaplanır, bir daha DEĞİŞMEZ.
        // Bu sayede oklar pan/zoom sırasında ASLA kaymaz.
        this._repeatCount = Math.max(Math.round(totalLengthMeters / desiredSpacingMeters), 1);

        // Materyal tanımı — Cesium'un cache'ine sadece 1 kez eklenir
        if (!(Cesium.Material as any)._materialCache._materials["ArrowEdgeSabitMaterial"]) {
            (Cesium.Material as any)._materialCache.addMaterial("ArrowEdgeSabitMaterial", {
                fabric: {
                    type: "ArrowEdgeSabitMaterial",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.PURPLE,
                        repeatCount: 1.0,
                        totalLengthMeters: 1000.0,
                        arrowPixelSize: 20.0,
                        minV: 0.40,
                        maxV: 0.60
                    },
                    source: `
                        uniform vec4 arrowColor;
                        uniform vec4 dashColor;
                        uniform float repeatCount;        // SABİT ok sayısı
                        uniform float totalLengthMeters;  // Polyline gerçek uzunluğu
                        uniform float arrowPixelSize;     // Ok hedef piksel boyutu
                        uniform float minV;
                        uniform float maxV;

                        // Ok şekli: Gövde (dikdörtgen) + Baş (üçgen)
                        float arrowMask(float u, float v) {
                            const float bodyFrac = 0.35;
                            const float bodyH    = 0.35;
                            float halfBody = bodyH * 0.5;
                            float c = abs(v - 0.5);

                            float inBodyU = 1.0 - step(bodyFrac, u);
                            float inBodyV = 1.0 - step(halfBody, c);
                            float alphaBody = inBodyU * inBodyV;

                            float b = clamp((u - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
                            float halfHead = 0.5 * (1.0 - b);
                            float inHeadU  = step(bodyFrac, u);
                            float inHeadV  = 1.0 - step(halfHead, c);
                            float alphaHead = inHeadU * inHeadV;

                            return clamp(max(alphaBody, alphaHead), 0.0, 1.0);
                        }

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            float s = materialInput.st.s;
                            float v = materialInput.st.t;

                            // Hücre tespiti (dünya-çakılı)
                            float cellCoord = s * repeatCount;
                            float cellIndex = floor(cellCoord);
                            float cellProgress = fract(cellCoord);

                            // Sabit oran
                            const float DASH_RATIO = 0.75;

                            // st.s → piksel dönüşüm katsayısı
                            // noperspective ile segment içinde sabit
                            // ama doğru piksel dönüşümü veriyor
                            float gradLen = length(vec2(dFdx(cellCoord), dFdy(cellCoord)));

                            // Ok bölgesi tespiti
                            float inArrow = step(DASH_RATIO, cellProgress);
                            float progress = cellProgress - DASH_RATIO;
                            float pixels = progress / max(gradLen, 1e-6);
                            float u = clamp(pixels / max(arrowPixelSize, 1.0), 0.0, 1.0);
                            float a = inArrow * arrowMask(u, v);

                            // Renkleme
                            vec4 outColor = mix(dashColor, arrowColor, a);
                            material.diffuse = outColor.rgb;
                            material.alpha = outColor.a;

                            return material;
                        }
                    `
                },
                translucent: () => true
            });
        }
    }

    get isConstant(): boolean { return false; }
    get definitionChanged(): Cesium.Event { return this._definitionChanged; }
    getType(_time: Cesium.JulianDate): string { return "ArrowEdgeSabitMaterial"; }

    // getValue: Sabit değerleri shader'a gönderir — kamera hesabı YOK
    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.arrowColor = this._arrowColor.getValue(time);
        result.dashColor = this._dashColor.getValue(time);
        result.repeatCount = this._repeatCount;
        result.totalLengthMeters = this._totalLengthMeters;
        result.arrowPixelSize = this._arrowPixelSize;
        return result;
    }

    equals(other: Cesium.MaterialProperty): boolean {
        return this === other;
    }
}