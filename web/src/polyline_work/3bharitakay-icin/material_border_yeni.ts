import * as Cesium from 'cesium';


export class ArrowEdgeMaterialProperty_Border_Ekle implements Cesium.MaterialProperty {
    private _arrowColor: Cesium.Property;
    private _dashColor: Cesium.Property;
    private _definitionChanged: Cesium.Event;

    private _borderColor: Cesium.Property;
    private _borderWidth: number;

    constructor(
        arrowColor: Cesium.Color,
        dashColor: Cesium.CallbackProperty,

        borderColor: Cesium.Color = Cesium.Color.BLACK, // Varsayılan kenarlık siyah
        borderWidth: number = 0.02   //varsayılan
    ) {
        this._arrowColor = new Cesium.ConstantProperty(arrowColor);
        this._dashColor = dashColor;
        this._definitionChanged = new Cesium.Event();

        this._borderColor = new Cesium.ConstantProperty(borderColor);
        this._borderWidth = borderWidth;

        if (!(Cesium.Material as any)._materialCache._materials["ArrowEdgeMaterialProperty_Border_Ekle"]) {
            (Cesium.Material as any)._materialCache.addMaterial("ArrowEdgeMaterialProperty_Border_Ekle", {
                fabric: {
                    type: "ArrowEdgeMaterialProperty_Border_Ekle",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.fromBytes(239, 12, 249, 255),
                        dashLength: 48.0,
                        arrowLength: 16.0,
                        minV: 0.40, // Alt sınır
                        maxV: 0.60,  // Üst sınır

                        borderColor: Cesium.Color.BLACK,
                        borderWidth: 0.02
                    },
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

                        vec2 arrowMask(float u, float v, float bWidth) {
                            // 1. FWIDTH SİHRİ (Piksel kalınlığını u ve v oranlarına çeviriyoruz)
                            float bWidthU = bWidth * max(fwidth(u), 1e-6);
                            float bWidthV = bWidth * max(fwidth(v), 1e-6);

                            // 2. SAFESCALE (Dışa büyürken tuvalden taşmamak için orantılı küçültme)
                            float safeScale = max(1.0 - (bWidthV * 3.0), 0.1);

                            // U ekseninde sağa-sola çarpmamak için tuvali daraltıp kaydırıyoruz
                            float uStart = bWidthU;
                            float uLen = 1.0 - (bWidthU * 2.0);
                            float localU = (u - uStart) / max(uLen, 1e-6);
                            
                            // Eğer u alanı tamamen dışarıdaysa (clipping mask) sıfır dön
                            if (u < 0.0 || u > 1.0) return vec2(0.0);

                            // Senin orijinal estetik oranların (Sadece safeScale ile çarpıldı)
                            const float bodyFrac = 0.30;
                            const float bodyH    = 0.35;
                            float halfBody = (bodyH * 0.5) * safeScale;
                            float c = abs(v - 0.5);

                            // --- İÇ MASKE HESAPLAMASI (Orijinal formumuz) ---
                            float inBodyUInner = step(0.0, localU) * (1.0 - step(bodyFrac, localU));
                            float inBodyVInner = 1.0 - step(halfBody, c);
                            float alphaBodyInner = inBodyUInner * inBodyVInner;

                            float b = clamp((localU - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
                            float halfHead = (0.5 * safeScale) * (1.0 - b);
                            
                            float inHeadUInner = step(bodyFrac, localU) * step(localU, 1.0);
                            float inHeadVInner = 1.0 - step(halfHead, c);
                            float alphaHeadInner = inHeadUInner * inHeadVInner;

                            float innerMask = clamp(max(alphaBodyInner, alphaHeadInner), 0.0, 1.0);

                            // --- DIŞ MASKE HESAPLAMASI (İç maskenin dışa doğru şişirilmiş hali) ---
                            float outerHalfBody = halfBody + bWidthV;
                            float inBodyUOuter = step(-bWidthU/uLen, localU) * (1.0 - step(bodyFrac, localU));
                            float inBodyVOuter = 1.0 - step(outerHalfBody, c);
                            float alphaBodyOuter = inBodyUOuter * inBodyVOuter;

                            float outerHalfHead = halfHead + bWidthV;
                            // Kulakçık için geriye, sivri uç için ileriye esneme payı bırakıyoruz
                            float inHeadUOuter = step(bodyFrac - (bWidthU/uLen), localU) * step(localU, 1.0 + (bWidthU * 2.0)/uLen);
                            float inHeadVOuter = 1.0 - step(outerHalfHead, c);
                            float alphaHeadOuter = inHeadUOuter * inHeadVOuter;

                            float outerMask = clamp(max(alphaBodyOuter, alphaHeadOuter), 0.0, 1.0);
                            
                            // Güvenlik: Dış maske her zaman iç maskeyi kapsamak zorundadır
                            outerMask = max(outerMask, innerMask); 

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

                            // **** Maskeleri hesapla (DÜZELTME: getArrowMasks yerine arrowMask yazıldı) ****
                            vec2 masks = arrowMask(u, v, borderWidth);
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
                },
                translucent: () => true
            });
        }
    }

    get isConstant(): boolean {
        const ac = (this._arrowColor as any)?.isConstant ?? true;
        const dc = (this._dashColor as any)?.isConstant ?? true;
        const bc = (this._borderColor as any)?.isConstant ?? true; // YENİ: Kenarlığı da kontrol et
        return ac && dc && bc;
    }

    get definitionChanged(): Cesium.Event { return this._definitionChanged; }
    getType(_time: Cesium.JulianDate): string { return "ArrowEdgeMaterialProperty_Border_Ekle"; }

    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.arrowColor = this._arrowColor.getValue(time);
        result.dashColor = this._dashColor.getValue(time);
        result.borderColor = this._borderColor.getValue(time); // YENİ: Değeri Shader'a aktar
        result.borderWidth = this._borderWidth;                // YENİ: Kalınlığı Shader'a aktar
        return result;
    }

    equals(other: Cesium.MaterialProperty): boolean {
        return (
            other instanceof ArrowEdgeMaterialProperty_Border_Ekle &&
            (other as any)._arrowColor?.equals?.(this._arrowColor) === true &&
            (other as any)._dashColor?.equals?.(this._dashColor) === true &&
            (other as any)._borderColor?.equals?.(this._borderColor) === true && // YENİ: Eşitlik kontrolü
            (other as any)._borderWidth === this._borderWidth
        );
    }
}