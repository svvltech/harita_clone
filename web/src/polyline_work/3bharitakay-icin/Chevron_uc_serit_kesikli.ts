import * as Cesium from "cesium";

export class ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli implements Cesium.MaterialProperty {
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

        if (!(Cesium.Material as any)._materialCache._materials["ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli"]) {
            (Cesium.Material as any)._materialCache.addMaterial("ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli", {
                fabric: {
                    type: "ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli",
                    uniforms: {
                        arrowColor: Cesium.Color.WHITE,
                        dashColor: Cesium.Color.fromBytes(239, 12, 249, 255),
                        dashLength: 100.0,
                        arrowLength: 25.0,
                        minV: 0.30, 
                        maxV: 0.70,
                        middleDashColor: Cesium.Color.BLACK,
                        dashCount: 4.0 // 3 ise 7 parçaya (3 çizgi 4 boşluk), 2 ise 5 parçaya böler.
                    },
                    source: `
                        uniform vec4 arrowColor;
                        uniform vec4 dashColor;
                        uniform vec4 middleDashColor;
                        uniform float dashLength;
                        uniform float arrowLength;
                        uniform float minV;
                        uniform float maxV;
                        uniform float dashCount; // Kaç adet kesikli çizgi istendiği
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
                            float inArrow = smoothstep(pixelDashLength - blurX, pixelDashLength + blurX, xInSeg) * (1.0 - smoothstep(pixelSegmentLength - blurX, pixelSegmentLength + blurX, xInSeg));

                            float u = clamp((xInSeg - pixelDashLength) / pixelArrowLength, 0.0, 1.0);
                            float v = st.t;
                            
                            float foldV = abs(v - 0.5) * 2.0;
                            
                            float fwU = max(fwX / pixelArrowLength, 1e-5); 
                            float fwV = max(fwidth(v) * 2.0, 1e-5); 
                            
                            float blurU = fwU * 0.5; 
                            float blurV = fwV * 0.5;

                            // ==========================================
                            // 1D ANALİTİK CHEVRON (KUSURSUZ PARALELLİK)
                            float slope = 0.4; 

                            float leftOutU  = 0.4 - slope * foldV;
                            float rightOutU = 1.0 - slope * foldV;
                            
                            float leftInnU  = 0.6 - slope * foldV;
                            float rightInnU = 0.8 - slope * foldV;

                            float outerU = smoothstep(leftOutU - blurU, leftOutU + blurU, u) * (1.0 - smoothstep(rightOutU - blurU, rightOutU + blurU, u));
                            float innerU = smoothstep(leftInnU - blurU, leftInnU + blurU, u) * (1.0 - smoothstep(rightInnU - blurU, rightInnU + blurU, u));
                            
                            float innerCapV = 1.0 - smoothstep(0.7 - blurV, 0.7 + blurV, foldV);

                            float alphaOuter = outerU * inArrow;
                            float alphaInner = innerU * innerCapV * inArrow;

                            vec4 dashCol = dashColor;
                            vec4 arrowCol = arrowColor;
                            vec4 blackCol = vec4(0.0, 0.0, 0.0, 1.0);
                            
                            // --- ARKA PLAN (Kesikli Şerit) ---
                            float blurZemin = max(fwidth(v), 1e-5) * 0.5;
                            float midV = (minV + maxV) * 0.5;
                            float stripeThickness = (maxV - minV) * 0.4;
                            float bStart = midV - (stripeThickness * 0.5);
                            float bEnd = midV + (stripeThickness * 0.5);

                            // Orta şeridin v eksenindeki dikey sınırları
                            float verticalStripeMask = smoothstep(bStart - blurZemin, bStart + blurZemin, v) - smoothstep(bEnd - blurZemin, bEnd + blurZemin, v);

                            // ==========================================
                            // 2N+1 MATEMATİK YÖNTEMİ (Statik Rakam Yok, Tam Oran)
                            // ==========================================
                            // GÖRSEL BOŞLUK HESABI (HARİKA DETAY!):
                            // Okun kuyruğu düz bir duvar değil, "V" şeklinde içeri kıvrıktır.
                            // Merkez eksende (v=0.5) ok u=0.4'ten itibaren çizilmeye başlar.
                            // Bu da pixelDashLength sınırına ek olarak merkeze doğru (0.4 * pixelArrowLength) 
                            // kadar ekstra görsel boşluk yaratır. Gerçek boşluk bu ikisinin toplamıdır!
                            float visualGap = pixelDashLength + 0.4 * pixelArrowLength;

                            // Eğer N (dashCount) = 3 ise N tane çizgi, N+1 tane boşluk olur (Toplam 7 eşit parça).
                            float dCount = max(floor(dashCount), 1.0); 
                            float totalParts = 2.0 * dCount + 1.0;
                            
                            // İşte şimdi iki ok arasındaki bu GERÇEK GÖRSEL ALANI 7 eşit parçaya bölüyoruz:
                            float unitLength = visualGap / totalParts;

                            // Kaydırma ve modüler mesafe
                            float x_shifted = xInSeg - 0.5 * unitLength;
                            float m = modp(x_shifted, 2.0 * unitLength);
                            float distToDashEdge = 0.5 * unitLength - abs(m - unitLength);
                            
                            // Maske çizgileri çizer.
                            // inArrow makaslaması İPTAL EDİLMİŞTİR!
                            // Neden? Çünkü matematiğimiz o kadar kusursuz ki, 4. çizgiyi (ok alanına sızan çizgiyi)
                            // tam mili milimetresine okun gövdesinin (alphaOuter) başladığı yere denk getirir!
                            // Okun kendi katmanı, onun üzerine çizilip o istenmeyen 4. çizgiyi zaten yutacaktır.
                            float horizontalStripeMask = smoothstep(-blurX, blurX, distToDashEdge);

                            // Dikey kalınlıkla kesişimi tam bir kesikli çizgiyi verir.
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
    getType(_time: Cesium.JulianDate): string { return "ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli"; }

    getValue(time: Cesium.JulianDate, result?: any): any {
        if (!result) result = {};
        result.arrowColor = this._arrowColor.getValue(time);
        result.dashColor = this._dashColor.getValue(time);
        return result;
    }

    equals(other: Cesium.MaterialProperty): boolean {
        return (
            other instanceof ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli &&
            (other as any)._arrowColor?.equals?.(this._arrowColor) === true &&
            (other as any)._dashColor?.equals?.(this._dashColor) === true
        );
    }
}