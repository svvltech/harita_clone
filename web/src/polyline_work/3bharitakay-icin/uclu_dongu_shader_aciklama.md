# Uclu_dongu_ChevronArrowEdgeMaterialProperty_kesik_serit_mesafeli Sınıfı ve GLSL Shader Mantığı

Bu materyal, dinamik bir ok (chevron) ve kesik çizgili şerit efektini Cesium çizgi (polyline) nesnesi üzerine çizmek için yüksek performanslı matematiksel yaklaşımlar (grafik hesaplamaları) kullanır. Kodun içindeki **GLSL (OpenGL Shading Language)** kısmının adım adım ne yaptığı aşağıda açıklanmıştır:

## 1. Temel Uniformlar ve Değişkenler
```glsl
uniform vec4 arrowColor;               // Okların (Chevron'ların) ana boyası (beyaz)
uniform vec4 dashColor;                // Kesik çizginin boyası (mor, yeşil vb.)
uniform vec4 middleDashColor;          // Kesikler arasındaki boşluğun boyası (genelde siyah/şeffaf)
uniform float dashLength;              // Arka plandaki tek bir çizgi ve boşluk alanının toplam baz genliği
uniform float arrowLength;             // YALNIZCA BİR adet okun yatay piksel genişliği
uniform float minV, maxV;              // Orta şeridin dikey hizadaki başlama ve bitme koordinatları
uniform float dashCount;               // Kullanıcının görmek istediği kesik siyah çizgi döngü sayısı
uniform float arrowCount;              // Ok sayısını belirten değişken (ör: 3 ok çizilecek)
in float v_polylineAngle;              // Cesium'dan gelen ve çizginin dünyadaki o anki dönüş/yön açısı
```
* Uniform değerleri ekran kartına CPU'dan iletilen dişarıdan gelen yapılandırmalardır. Çizilecek birimlerin boyutunu ve rengini temsil eder.

## 2. Koordinat ve Geometri Hazırlığı
```glsl
mat2 rotate(float rad) { ... }
float modp(float x, float len) { ... }
```
* **rotate**: Piksel koordinatlarını çizgilerin dönüş yönüne kitlemek için 2x2 rotasyon matrisi oluşturur.
* **modp**: Matematiksel mod (kalan) alma işlemini yapar fakat sonucu her zaman pozitif verir. Eksi yöne giden çizgilerde hata olmasını veya çizimlerin ters kaymasını engeller.

```glsl
vec2 pos = rotate(v_polylineAngle) * gl_FragCoord.xy;
float pixelDashLength  = max(dashLength  * czm_pixelRatio, 1.0);
float pixelArrowLength = max(arrowLength * czm_pixelRatio, 1.0);
float pixelSegmentLength = pixelDashLength + (pixelArrowLength * arrowCount);
```
* Ekranda işlenen her bir piksel (gl_FragCoord), çizgi açısına göre döndürülerek lokal **(x,y) (pos)** düzleminde hizalanır.
* **czm_pixelRatio**: Ekran kalitesine (örneğin Retina ekranlar) göre çizgi ve ok kalınlıklarını hesaplayıp uygun piksellere ölçekler. 
* **pixelSegmentLength**: Bir döngünün toplam desen uzunluğudur. (Boşluk uzunluğu + (Ok uzunluğu * ok sayısı)) şeklinde komple parçanın toplam piksel boyutunu verir.

```glsl
float xInSeg = modp(pos.x, pixelSegmentLength);
```
* Sonsuz defa uzayan harita çizgisi üzerinde, mevcut piksel koordinatının **[0]** ile **[pixelSegmentLength]** arasındaki periyot döngüsünde tam olarak nereye düştüğü hesaplanır. `modp` SDF döngüsü kurar (tekrar eden desen mantığı).

## 3. Ok (Chevron) Çizimi İçin Zemin Hazırlığı
```glsl
float inArrow = smoothstep(pixelDashLength - blurX, pixelDashLength + blurX, xInSeg) * 
                (1.0 - smoothstep(pixelSegmentLength - blurX, pixelSegmentLength + blurX, xInSeg));
```
* **inArrow**: Geçerli pikselin matematiksel olarak "ok bölgesinde" mi (`1.0`) yoksa "şerit bölgesinde" mi (`0.0`) olduğunu bulduğumuz maskedir. `smoothstep` pürüzsüzleştirme uygular.

```glsl
float u_full = clamp((xInSeg - pixelDashLength) / pixelArrowLength, 0.0, 3.0);
float v = st.t;
float foldV = abs(v - 0.5) * 2.0;
```
* **u_full**: Normalde bir oku çizmek için x koordinatı 0'dan 1'e ölçümlenirdi. Burada 3 tane ok olduğu için u_full yatayda 0'dan 3'e ilerliyor demektir.
* **foldV**: Dikey koordinat olan `v` yi merkeze katlar. Çizginin merkezinde `0`, uzaklaştıkça yanal kenarlara doğru simetrik olarak `1` değerine varır. Okun sivri o V-geometrisini yatay eksende geriye alarak katlanma yanılsaması yaratmanın kilit hesaplamasıdır.

## 4. Dinamik Chevron Gövdesi Hesaplamaları
```glsl
float slope = 0.4; 
float lOut = 0.4 - slope * foldV;
float rOut = 1.0 - slope * foldV;
float lInn = 0.5 - slope * foldV;
float rInn = 0.9 - slope * foldV;
```
* **slope (Eğim)**: Okun kollarının ne kadar geriye yatacağını belirler. Merkezi koordinattan kenara giderken `slope * foldV` çarpanı kadar x ekseninde geriye öteleyip o meşhur kanatları oluşturur.
* **lOut / rOut**: Siyah dış çerçevenin başladığı ve bittiği sınır bölgeleridir (Kalınlık = 0.6).
* **lInn / rInn**: Beyaz iç boyanın başlangıç sınırıdır. Kasıtlı olarak siyahlardan 0.1 puan içeriden başlatılarak otomatik bir siyah kenarlık görünümü yaratılır (Kalınlık = 0.4).

```glsl
for (int i = 0; i < 3; i++) {
    if (float(i) >= arrowCount) break;
    float shift = float(i);
    float outer = smoothstep(lOut + shift ... u_full);
    float inner = smoothstep(lInn + shift ... u_full);
    alphaOuter += outer;
    alphaInner += inner;
}
```
* Birden çok ok çizmek tek bir döngü ile çok basittir. Oku çizdiğimiz sınırlar, kaçıncı iterasyondaysak ok uzunluğu (shift=1, 2) oranında ileri öteleyerek (`lOut + shift`) sıradaki alana maske atar. `alphaOuter` (siyah dış çerçeve toplamı) ve `alphaInner` (beyaz gövde maskesi toplamı) ardışık sıralanır.

```glsl
float innerCapV = 1.0 - smoothstep(0.8 - blurV, 0.8 + blurV, foldV);
alphaOuter = clamp(alphaOuter, 0.0, 1.0) * inArrow;
alphaInner = clamp(alphaInner, 0.0, 1.0) * innerCapV * inArrow;
```
* **innerCapV**: Okun "V" şeklinde merkezden geriye yatmasından dolayı ucu gereksiz miktarda keskinleşip uzar. `%80` sonrasını "kep/kapak" gibi hafifçe tıraşlıyoruz.
* Taşan değerleri maskelemek ve birbirleriyle karışıp "şerit alanına" sızmalarını engellemek için `inArrow` gibi genel doğrulama maskesiyle çarpıyoruz.

## 5. Kesikli Çizgi Arka Planı Üretimi
```glsl
float verticalStripeMask = smoothstep(bStart - blurZemin, bStart + blurZemin, v) - smoothstep(bEnd - blurZemin, bEnd + blurZemin, v);
```
* Bu maske şeridin dikey hizalamasını (V ekseni) gerçekleştirir. Çizginin kenarlarını taşmadan (bStart ile bEnd) boyunca uzanmasını garantiler.

```glsl
float visualGap = pixelDashLength + 0.4 * pixelArrowLength;
```
* Göz yanılmasını düzeltme: Ok kanatları V şeklinde sarktığı için şeride olan optik mesafe asimetrik görünür. Bunu dengelemek için kanat sarkma genliği olan `%40` kadar piksel boşluğu eklentisi yapılır.

```glsl
float distToDashEdge = unitLength * (0.5 - abs(fract(xInSeg / (2.0 * unitLength) - 0.25) * 2.0 - 1.0));
float horizontalStripeMask = smoothstep(-blurX, blurX, distToDashEdge);
```
* Grafik dünyasının gizli gücü olan **SDF fonksiyonu!** `fract` (kesir alma) kullanılarak alan sonsuz eşit ızgaralara bölünür. O anki `x` noktasının ait olduğu ızgaradaki merkez sınırından ne kadar uzakta (+/-) olduğu hesaplanır (`distToDashEdge`). 
* Mesafe eğer sıfırdan büyükse şeridin boyanması için içindeyiz demektir. Aksi takdirde boşluktayız.

```glsl
float finalStripeFactor = verticalStripeMask * horizontalStripeMask;
vec4 baseColor = mix(dashCol, middleDashColor, finalStripeFactor);
```
* Pikseller eğer hem dikey zemin yolundayken hem de boşluğa gelmeyip yatay iz düşümüne basıyorsa (`finalStripeFactor`), şeridi arka plan rengiyle boyar. EdgeAlpha hesaplaması şeridin kenarlarına tatlı bir saydam geçiş atar.

## 6. Son Katmanlama
```glsl
vec4 outColor = baseColor;
outColor = mix(outColor, blackCol, alphaOuter); 
outColor = mix(outColor, arrowCol, alphaInner); 
outColor = czm_gammaCorrect(outColor);
```
Tıpkı Photoshop'ta katmanları üst üste koyur gibi renderlanır:
1. En alta şerit ve şerit kesik boşlukları.
2. Üzerine okların incecik ve pürüzsüz siyah dış çerçeveleri.
3. En üste de saf beyazı yansıtacak okların iç gövdeleri yerleştirilir.
4. Monitörler arası gerçekçi ışık oranları taşınması için Gamma Color Düzeltmesi atılarak Cesium grafiğine teslim edilir.
