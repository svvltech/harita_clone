mat2 rotate(float rad) {
    float c = cos(rad);
    float s = sin(rad);
    return mat2(c, s, -s, c);
}

float modp(float x, float len){
    float m = mod(x, len);
    return m < 0.0 ? m + len : m;
}