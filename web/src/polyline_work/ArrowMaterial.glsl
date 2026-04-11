#include "./CommonMath.glsl"

uniform vec4 arrowColor;
uniform vec4 dashColor;
uniform float dashLength;
uniform float arrowLength;
uniform float minV;
uniform float maxV;
in float v_polylineAngle;

float arrowMask(float u, float v) {
    const float bodyFrac = 0.30;
    const float bodyH = 0.35;
    float halfBody = bodyH * 0.5;
    float c = abs(v - 0.5);

    float inBodyU = 1.0 - step(bodyFrac, u);
    float inBodyV = 1.0 - step(halfBody, c);
    float alphaBody = inBodyU * inBodyV;

    float b = clamp((u - bodyFrac) / max(1.0 - bodyFrac, 1e-6), 0.0, 1.0);
    float halfHead = 0.5 * (1.0 - b);
    float inHeadU = step(bodyFrac, u);
    float inHeadV = 1.0 - step(halfHead, c);
    float alphaHead = inHeadU * inHeadV;

    return clamp(max(alphaBody, alphaHead), 0.0, 1.0);
}

czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);
    vec2 st = materialInput.st;

    vec2 pos = rotate(v_polylineAngle) * gl_FragCoord.xy;
    float pixelDashLength = max(dashLength * czm_pixelRatio, 1.0);
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

    // Sadece arka plan (dash) kismi icin V araligi disinda alpha sifirla
    float vClip = step(minV, v) * step(v, maxV);
    if (a <= 0.0) {
        outColor.a *= vClip;
    }

    outColor = czm_antialias(vec4(0.0), outColor, outColor, min(st.t, 1.0 - st.t));
    outColor = czm_gammaCorrect(outColor);

    material.diffuse = outColor.rgb;
    material.alpha = outColor.a;
    return material;
}