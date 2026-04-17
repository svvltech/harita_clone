# Cember_Chevron_Material Sınıfı ve GLSL Shader Mantığı

Bu materyal, haritada çizilen bir dairesel veya kapalı poligonal çokgen çizgisinin (polyline) "uzunluğuna bağlı kalarak", ekran kartını yoran `for` döngüleri kurmadan chevron okları yerleştirmekle görevlidir. Ekranın o anki zoom miktarından piksel yoğunluğunu hesaplayıp okları her zaman sabit boyutta tutar.

Aşağıda bu kodun adım adım, satır satır yaptığı sihri okuyabilirsin.

## 1. Temel Uniformlar ve Çizgi (Polyline) İskeleti
```glsl
uniform vec4 ok_rengi;
uniform vec4 serit_rengi;
uniform float ok_sayisi;
uniform float ok_uzunlugu;
uniform float serit_kalinlik_orani;
```
* **Uniformlar:** Bilgisayarın ana işlemcisinden (CPU), ekran kartının kalbine (GPU) sabit gönderilen ön ayar değerleridir. Parametreleri dinamik olarak yapılandırmayı sağlar.

```glsl
vec2 st = materialInput.st;
```
* Tüm sır buradaki `st` matrisindedir. Bu, Cesium'un polylinelera atadığı yapısal iskelettir.
* `st.s` : Çizginin başından **(0.0)**, en son bitiş noktasına **(1.0)** kadar harita etrafında tur atan orantısal iskelet mesafesidir.
* `st.t` : Çizginin enidir (kalınlığı). Üst kenarından alt kenarına doğru **0.0**'dan **1.0**'a uzanır. Genelde dikey hizalamaları buradan anlarız.

## 2. Dinamik Türev Matematiği (En Krıtik Kısım)
Dairesel polygonlarda çizgisel uzunluk `(pos.x)` ile ölçülemez. Gerçekçi boyutu bulmak için o anki kamera açısındaki ekran piksellerinin türev dönüşümü kullanılmalıdır.

```glsl
float ds_dx = dFdx(st.s);
float ds_dy = dFdy(st.s);
```
* **dFdx ve dFdy:** 3D grafik dünyasında "yan yana duran iki piksel arasındaki rakamsal farkı" ölçer. Kamerayı sola/sağa kaydırdığımızda, çizgi oranı `st.s` in ne kadar azalıp arttığını anında hesaplar.

```glsl
ds_dx = abs(ds_dx) > 0.5 ? 0.0 : ds_dx;
ds_dy = abs(ds_dy) > 0.5 ? 0.0 : ds_dy;
```
* **Seam (Düğüm Yırtılması) Koruması:** Dairesel bir objenin çizim sonu başladığı yerle tekrar birleştiği için oradan geçerken `st.s` aniden **1.0'dan pat diye 0.0'a** ani "U dönüşü" yapar. 
* Bu patlama ekran kartında devasa bir türev atlamasını tetikler o piksel bozulur (Artifact). Bunu önlemek için "Eğer değişim %50'den büyük veya absürt ise, bu düğüm noktasıdır diyip işlemi bastır" diyoruz.

```glsl
float PikselBasina_S_Degisimi = max(length(vec2(ds_dx, ds_dy)), 1e-7);
float polyline_ekran_pikseli = 1.0 / PikselBasina_S_Degisimi;
```
* Haritaya zoom yaptın ve çember ekranda büyüdü! O zaman 1 pikseldeki oran çok az değişecektir.
* Türev sonucumuzu tam çember yörüngesine bölersek bize şöyle bir cevap döner: *"Gördüğünüz bu dairesel çemberin toplam çerçeve sınırı an itibariyle ekranda 2860 PIKSEL uzunluğundadır."*

## 3. O(1) Performanslı Çiçek Gibi Segmentasyon
Senin o eski koddaki gibi 8-10 adet if koşulu barındıran yorucu `for` döngülerine veda ettiğimiz yer burasıdır.
```glsl
float lokal_s = fract(st.s * ok_sayisi);
```
* **st.s * ok_sayisi:** Mesela 4 tam ok istedik. Çemberi turlarken o oranlar `0.0`'dan `4.0`'a tırmanır.
* **fract():** Sayının sadece ondalığını alır. 0.99 dan 1.0 a geçince sonuç SIFIR olur. Sayı adeta takla atar.
* Ekran kartımız şimdi bu işlemi tam kırpıp, çemberi **eşit ve özdeş 4 pasta dilimi üretti!** 4 tane pasta diliminde ne oluyorsa hepsinde birebir tekrar edecek demek. Ekrana ok bastırmak artık tek adımlık iştir.

```glsl
float ok_kaplama_s_orani = piksel_ok_uzunlugu / polyline_ekran_pikseli;
float ok_baslangic_s = 0.5 - (ok_kaplama_s_orani * 0.5);
```
* 25 px okun, o 2860 piksellik çemberin bütünü etrafından tek başına yüzde kaç `.s` işgal ettiğini bulduk ve kendi o özdeş "fract pasta dilimi"nin %50 oranındaki tam ortasına hizaladık.

## 4. Chevron (V Şekilli Ok) Çizimi Mimarisi
```glsl
float ok_u_koordinati = clamp((lokal_s - ok_baslangic_s) / max(ok_kaplama_s_orani, 1e-5), 0.0, 1.0);
float v_merkezden_sapma_orani = abs(v - 0.5) * 2.0;
```
* Yatay alanda `U=0'dan 1'e` ilerleriz.
* `v_merkezden_sapma_orani`: Şeridin göbeğinde değer(0) dır. Kenarlara yattıkça (U'dan uzaklaştıkça) katlanıp 1 birimine çıkar.

```glsl
float sol_ic_sinir = 0.5 - ok_yatiklik_derecesi * v_merkezden_sapma_orani;
float sag_ic_sinir = 0.8 - ok_yatiklik_derecesi * v_merkezden_sapma_orani;
```
* **ok_yatiklik_derecesi**: Uçlara yayıldıkça pikseller (örneğin 0.4 oranında) U düzleminde geriye doğru sürüklenir. Ekran kartı sana dikdörtken değil kusursuz bir yatık ok `(>)` boyamış olur. Sınırlar sadece `ok_kalınlığı == %0.3` (0.8 - 0.5) aralığında çizilir.

```glsl
float ok_sivri_ucu_kirpma = 1.0 - smoothstep(0.8 - blurV, 0.8 + blurV, v_merkezden_sapma_orani);
```
* Ok kolları geriye doğru x eksenine kıvrıldıkça merkeze denk gelen o tavan burnu sinyal kaybından iğne kadar incelir. Maskeden destek alıp onu belli bir sivrilikten ötesini kırparız ki ok başı pofuduk/kalın tam bir üçgen görünsün. 

## 5. Zemin Çemberini (Ring) Çizmek
```glsl
float yari_kalinlik = serit_kalinlik_orani * 0.5;
float serit_ust = 0.5 - yari_kalinlik;
float serit_alt = 0.5 + yari_kalinlik;
float serit_maskesi = smoothstep(serit_ust - zemin_bulaniklik, serit_ust + zemin_bulaniklik, v) * 
                      (1.0 - smoothstep(serit_alt - zemin_bulaniklik, serit_alt + zemin_bulaniklik, v));
```
* Bu, senin bana fotoğrafta gösterdiğin o "Siyah Düz Çizgi" yi yapmamızı sağlar. Resimdeki çizgi inceydi bu oran sayesine merkeze bağlı bir dairesel alan oluşur (%20). O alanda mıyım değil miyim deriz. `smoothstep` kenar tırtıklarını düzeltip pikselleştirir.

## 6. Görüntüyü Süzme ve Katmanlama
```glsl
vec4 cikis_rengi = mix(vec4(0.0), serit_rengi, serit_maskesi);
cikis_rengi = mix(cikis_rengi, ok_rengi, nihai_ok_maskesi);
cikis_rengi = czm_gammaCorrect(cikis_rengi);
```
* Hesapladığımız maske şablonlarının üstüne mix (boyama fırçası) vuruyoruz:
1. Şeffaflık tuvali koyuyoruz.
2. Üzerine hesapladığımız zemin seridini kaplıyoruz.
3. Sonuna kadar kırpıp, biçip pürüzsüzleştirdiğimiz Chevron piksellerini (mavi) üzerine çakıyoruz.
* Düzeltilmiş doğru ışık (Gamma) ayarları ile Cesium dünyasına teslim edip çizimi mutlu sonlandırıyoruz!
