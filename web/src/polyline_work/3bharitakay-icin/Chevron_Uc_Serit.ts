import * as Cesium from "cesium";
export class ChevronArrowEdgeMaterialProperty_sandwichLine implements Cesium.MaterialProperty {
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

        if (!(Cesium.Material as any)._materialCache._materials["ChevronArrowEdgeMaterialProperty_sandwichLine"]) {
            (Cesium.Material as any)._materialCache.addMaterial("ChevronArrowEdgeMaterialProperty_sandwichLine", {
                fabric: {
                    type: "ChevronArrowEdgeMaterialProperty_sandwichLine",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.fromBytes(239, 12, 249, 255),
                        dashLength: 48.0,
                        arrowLength: 12.0,
                        minV: 0.30, 
                        maxV: 0.70  
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

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material material = czm_getDefaultMaterial(materialInput);
                            vec2 st = materialInput.st;

                            vec2 pos = rotate(v_polylineAngle) * gl_FragCoord.xy;
                            float pixelDashLength  = max(dashLength  * czm_pixelRatio, 1.0);
                            float pixelArrowLength = max(arrowLength * czm_pixelRatio, 1.0);
                            float pixelSegmentLength = pixelDashLength + pixelArrowLength;

                            float xInSeg = modp(pos.x, pixelSegmentLength);

                            float fwX = max(fwidth(pos.x), 1e-5);
                            float blurX = fwX * 0.5;
                            float inArrow = smoothstep(pixelDashLength - blurX, pixelDashLength + blurX, xInSeg);

                            float u = clamp((xInSeg - pixelDashLength) / pixelArrowLength, 0.0, 1.0);
                            float v = st.t;
                            
                            float foldV = abs(v - 0.5) * 2.0;
                            
                            float fwU = max(fwidth(u), 1e-5); 
                            float fwV = max(fwidth(v) * 2.0, 1e-5); 
                            
                            float blurU = fwU * 0.5; 
                            float blurV = fwV * 0.5;

                            // ==========================================
                            // 1D ANALİTİK CHEVRON (KUSURSUZ PARALELLİK)
                            // ==========================================
                            // BÜYÜK DÜZELTME 1: Tüm çizgiler aynı eğime (0.4) sahip!
                            float slope = 0.4; 

                            // Dış Sınırlar (Kalınlık = 0.6)
                            float leftOutU  = 0.4 - slope * foldV;
                            float rightOutU = 1.0 - slope * foldV;
                            
                            // İç Sınırlar (Soldan ve Sağdan tam 0.1 birim içeride)
                            float leftInnU  = 0.5 - slope * foldV;
                            float rightInnU = 0.9 - slope * foldV;

                            float outerU = smoothstep(leftOutU - blurU, leftOutU + blurU, u) * (1.0 - smoothstep(rightOutU - blurU, rightOutU + blurU, u));
                            float innerU = smoothstep(leftInnU - blurU, leftInnU + blurU, u) * (1.0 - smoothstep(rightInnU - blurU, rightInnU + blurU, u));
                            
                            // BÜYÜK DÜZELTME 2: Uç kesiğini SADECE iç oka uyguluyoruz.
                            // Dış siyah çerçeve foldV=1.0 (en tepeye) kadar çıkıyor.
                            float innerCapV = 1.0 - smoothstep(0.8 - blurV, 0.8 + blurV, foldV);

                            // Dış çerçeve serbest, iç ok tepeden (0.8) tıraşlı.
                            float alphaOuter = outerU * inArrow;
                            float alphaInner = innerU * innerCapV * inArrow;

                            vec4 dashCol = dashColor;
                            vec4 arrowCol = arrowColor;
                            vec4 blackCol = vec4(0.0, 0.0, 0.0, 1.0);
                            
                            // --- ARKA PLAN (Sandviç Çizgi) ---
                            float blurZemin = max(fwidth(v), 1e-5) * 0.5;
                            float midV = (minV + maxV) * 0.5;
                            float stripeThickness = (maxV - minV) * 0.2;
                            float bStart = midV - (stripeThickness * 0.5);
                            float bEnd = midV + (stripeThickness * 0.5);

                            float blackFactor = smoothstep(bStart - blurZemin, bStart + blurZemin, v) - smoothstep(bEnd - blurZemin, bEnd + blurZemin, v);
                            vec4 baseColor = mix(dashCol, blackCol, blackFactor);
                            
                            float edgeAlpha = smoothstep(minV - blurZemin, minV + blurZemin, v) * (1.0 - smoothstep(maxV - blurZemin, maxV + blurZemin, v));
                            baseColor.a *= edgeAlpha;

                            // --- KATMANLI RENK BİRLEŞTİRME ---
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
    getType(_time: Cesium.JulianDate): string { return "ChevronArrowEdgeMaterialProperty_sandwichLine"; }

    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.arrowColor = this._arrowColor.getValue(time);
        result.dashColor = this._dashColor.getValue(time);
        return result;
    }

    equals(other: Cesium.MaterialProperty): boolean {
        return (
            other instanceof ChevronArrowEdgeMaterialProperty_sandwichLine &&
            (other as any)._arrowColor?.equals?.(this._arrowColor) === true &&
            (other as any)._dashColor?.equals?.(this._dashColor) === true
        );
    }
}