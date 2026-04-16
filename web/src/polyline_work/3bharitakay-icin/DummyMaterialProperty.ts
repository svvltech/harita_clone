
import * as Cesium from 'cesium';

// options : Kullanıcının dışarıdan gönderebileceği opsiyonların listesi.
// ?: "isteğe bağlı" olduğunu belirtir.

export class MasterDummyMaterialProperty implements Cesium.MaterialProperty {
    
    // --- ÖZEL RAFLAR ---
    private _renk: Cesium.Property;
    private _kalinlik: number;
    private _parlamaHizi: Cesium.Property;
    private _aktifMi: boolean;
    // private _aktifMi: boolean = true; -> burada da varsayilan deger atayabilirsin
    
    // DİKKAT: _seffaflik adında bir rafımız YOK!
    
    private _definitionChanged = new Cesium.Event();

    /* ****************** options ile constructor: *********************** */
    constructor(options: {
        renk?: Cesium.Property | Cesium.Color; // Hem sabit renk hem animasyonlu kutu kabul edelim!
        kalinlik?: number;
        parlamaHizi?: Cesium.Property;
        aktifMi: boolean;
        // DİKKAT: 'seffaflik' diye bir opsiyon buraya BİLEREK konulmadı.
    } // = {}  - Tüm opsiyonlar opsiyonelse en sona '= {}' koy ve  new Class() diye içi boş çağırabil
    ) {
        
        // 1. RENK (Hem Property hem Color gelebilme ihtimalini çözüyoruz)
        // Eğer dışarıdan bir şey gelmezse varsayılan olarak BEYAZ atıyoruz.
        const gelenRenk = options.renk ?? Cesium.Color.WHITE;
        this._renk = (gelenRenk instanceof Cesium.Property) ? gelenRenk : new Cesium.ConstantProperty(gelenRenk);

        // 2. SAYISAL VE BOOLEAN (Opsiyondan al, yoksa varsayılanı kullan)
        this._kalinlik = options.kalinlik ?? 2.0;
        this._aktifMi = options.aktifMi ?? true;

        // 3. SADECE PROPERTY BEKLEYENLER
        this._parlamaHizi = options.parlamaHizi ?? new Cesium.ConstantProperty(1.0);

     /* ****************** options olmadan constructor: *********************** 

     constructor(
        renk: Cesium.Color = Cesium.Color.WHITE,      // Varsayılan değerler hayati önem taşır
        kalinlik: number = 2.0,                       // 'undefined' hatasını daha kapıda engeller
        parlamaHizi: Cesium.Property = new Cesium.ConstantProperty(1.0), // Zaten kutu olarak gelebilir
        aktifMi: boolean 
    ) {
        // Çıplak gelen veriyi kutuya koyuyoruz (Ceket giydirme)
        this._renk = new Cesium.ConstantProperty(renk);
        
        // Zaten kutu (Property) olarak gelen veriyi direkt alıyoruz
        this._parlamaHizi = parlamaHizi;

        // Sabit kalacakları saf (primitive) olarak saklıyoruz (Performans)
        this._kalinlik = kalinlik;
        this._aktifMi = aktifMi ?? true;

      ***************************************************************************  */
    
        // 4. FABRİKA KALIBI VE "HAYALET" DEĞİŞKEN
        if (!(Cesium.Material as any)._materialCache._materials["MasterDummyMaterial"]) {
            (Cesium.Material as any)._materialCache.addMaterial("MasterDummyMaterial", {
                fabric: {
                    type: "MasterDummyMaterial",
                    uniforms: {
                        u_renk_uv: Cesium.Color.WHITE, 
                        u_kalinlik_piksel: 1.0, 
                        u_parlama_f: 1.0,
                        u_aktif_b: true,

                        // HAYALET DEĞİŞKEN (Constructor'da yok, getValue'da yok!)
                        // Bu değer GPU'da her zaman 0.5 olarak kalmaya mahkumdur.
                        u_fabrika_seffafligi: 0.5 
                    },
                    source: `
                        uniform vec4 u_renk_uv;
                        uniform float u_kalinlik_piksel;
                        uniform float u_parlama_f;
                        uniform bool u_aktif_b;
                        
                        uniform float u_fabrika_seffafligi; // Fabrikadan gelen hayalet değer

                        czm_material czm_getMaterial(czm_materialInput materialInput) {
                            czm_material m = czm_getDefaultMaterial(materialInput);
                            
                            m.diffuse = u_renk_uv.rgb;
                            
                            if (u_aktif_b) {
                                m.diffuse *= u_parlama_f;
                            }
                            
                            // Ekran kartı bu değeri mecburen fabrikadaki 0.5'ten okuyacak
                            m.alpha = u_fabrika_seffafligi; 
                            
                            return m;
                        }
                    `
                }
            });
        }
    }

    get isConstant(): boolean {
        return this._renk.isConstant && this._parlamaHizi.isConstant;
    }

    get definitionChanged() { return this._definitionChanged; }
    getType() { return "MasterDummyMaterial"; }
 
    // 5. GETVALUE (Kargo Teslimatı)
    getValue(time: Cesium.JulianDate, result: any = {}): any {
        result.u_renk_uv = this._renk.getValue(time);
        result.u_parlama_f = this._parlamaHizi.getValue(time);
        result.u_kalinlik_piksel = this._kalinlik; 
        result.u_aktif_b = this._aktifMi;

        // BİLEREK YAPILAN EKSİKLİK:
        // result.u_fabrika_seffafligi = ... YAZMADIK!
        // Cesium bu kargoyu GPU'ya götürdüğünde u_fabrika_seffafligi'ni bulamayacak.
        // Hata vermeyecek! Gidip fabric.uniforms içindeki 0.5'i kullanacak.

        return result;
    }

    equals(other: any): boolean {
        return (
            other instanceof MasterDummyMaterialProperty &&
            this._renk.equals(other._renk) &&
            this._kalinlik === other._kalinlik &&
            this._parlamaHizi.equals(other._parlamaHizi) &&
            this._aktifMi === other._aktifMi
        );
    }
}

// "options" kullandığında sınıfı parametre adları vererek çağırdığın için sıralamasına dikkat etmen gerekmez 
// new MasterDummy({ kalinlik: 5.0, aktifMi: false })

/**
 
1. isConstant (Karar Mekanizması)
Görevi: Cesium'a "Bu materyal animasyonlu mu, yoksa her karede aynı mı kalacak?" bilgisini verir.
Çalışma Mantığı: Eğer true dönerse, Cesium materyali bir kez hesaplar ve önbelleğe (cache) alır. false dönerse, saniyede 60 kez getValue metodunu çalıştırır.
Püf Noktası: Sadece Cesium.Property tipindeki (yani ConstantProperty veya CallbackProperty gibi) değişkenleri burada kontrol etmelisin. Saf sayılar (number) veya boolean değerler zaten doğası gereği sabittir.

2. getValue (Veri Köprüsü)
Görevi: İşlemci (CPU/TypeScript) üzerindeki verileri, ekran kartına (GPU/GLSL) taşıyan kargo uçağıdır.
Zaman Parametresi (time): İçerideki Property kutularına "Şu anki saat itibarıyla değerin nedir?" diye sormak için kullanılır.
Eşleşme Kuralı: result.degisken_adi şeklinde atadığın isim, GLSL kodundaki uniform ismiyle karakteri karakterine aynı olmalıdır.
 
3.
-Uniform: O kare (frame) çizilirken, o objenin tüm pikselleri için aynı kalan veridir. Örneğin; bir ok çizgisinin kalınlığı, o anki tüm pikseller için 2.0'dır. Pikselden piksele değişmez.
-Varying (in): Her piksel için farklı olan veridir (UV koordinatları gibi).

4. uniforms değerleri neden hem shader kodu hem fabric.uniforms icinde yazariz?

"fabric.uniforms" bloğundaki kısım :
JS/TS kodun İşlemci'de (CPU) çalışır. fabric.uniforms bloğuna yazdığın kısım, Cesium'a (ve WebGL'e) verdiğin bir kargo paketleme listesidir.
İşlemci tarafında (RAM'de) bu değişkenler için yer ayırtmak, başlangıç (varsayılan) değerlerini ve tipini  (float, vec4, bool)  belirlemek ve ekran kartına gönderilecek kargoyu hazırlamaktır.

"GLSL Tarafı" :
Ekran kartın (GPU) ise JS/TS bilmez.
GPU'nun belleğinde yer açması için, gelecek kargonun tipini ve boyutunu milimetresine kadar önceden bilmesi gerekir.

Uygulama ilk açıldığında WebGL (tarayıcının grafik motoru) iki kodu da okur ve bu iki kısım arası eşleştirme (Binding) işlemini yapar

Uniform Eşleşmesi: result.u_aktif_b ismiyle GLSL'deki uniform vec4 u_aktif_b; isminin karakteri karakterine aynı olması gerekir.

5. fabric.uniforms vs. constructor Ataması: 
*fabric.uniforms (Fabrika Ayarı):  Sadece 1 kez (materyal ilk tanımlandığında) çalışır.
 Amacı: GPU'da hangi tipte (sayı mı, renk mi?) yer ayrılacağını belirlemektir.
Buradaki değerler "yedek lastik" gibidir; getValue'dan veri gelmezse kullanılır.
*constructor + getValue (Kişisel Ayar): Her yeni nesne (new) oluşturulduğunda çalışır.
 Amacı: Her objeye özel (bir ok kırmızı, diğeri mavi) veriyi hafızada tutmak ve her karede GPU'ya taze veriyi basmaktır.
Öncelik: getValue içindeki değer her zaman fabrikadaki (uniforms) değeri ezer ve o geçerli olur

6. Hayalet Değişken (Secret Uniform)
Eğer bir değişkeni sadece fabric.uniforms içine yazıp getValue ile göndermezsen:
O değişken dışarıdan (TypeScript'ten) asla değiştirilemez hale gelir.
Ekran kartı mecburen fabrikadaki sabit değeri kullanır. Bu, kodun içine "hard-coded" ama ekran kartının anlayacağı sabitler gömmek için harika bir yöntemdir.

7. definitionChanged() - Dinamik Değişim Bildirimi
Kural: Eğer isConstant değeri true olan bir değişkeni (örneğin saf bir number olan _kalinlik değerini) sınıf dışından bir metodla sonradan değiştirirsen, Cesium bunu fark etmez çünkü isConstant: true olduğu için önbelleğe bakmaya devam eder.
Çözüm: Sabit bir değeri manuel olarak güncellediğinde this._definitionChanged.raiseEvent(this); satırını tetiklemen gerekir. Bu, Cesium'a "Önbelleği temizle ve değerleri bir kez daha oku!" emrini verir.


*/