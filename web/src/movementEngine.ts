import * as Cesium from "cesium";


export class MovementEngine {
    
    private Son_Gercek_Konum = new Cesium.Cartesian3();

    private Rota_Acisi: number = 0;     // trackAngle -Gerçek ilerleme rotası (Fiziksel)
    private Son_Rota_Acisi: number = 0; // lastTrackAngle -Bir önceki rotanın açısı
    private Rota_Donus_Hizi: number = 0;  // trackTurnRate -Rota üzerindeki dönüş hızı (rad/s)

    private Son_Pruva_Acisi: number = 0; // lastHeading
    private Pruva_Donus_Hizi: number = 0;    // turnRate - Dönüş hızı (rad/s) 

    private Son_Irtifa: number = 0;   // lastAlt (m)
    private Yunuslama_Acisi: number = 0; // lastPitch (rad)
    private Yatis_Acisi: number = 0;  // lastRoll (rad)

    private Yunuslama_Hizi: number = 0; // pitchRate rad/s
    private Yatis_Hizi: number = 0;  // rollRate rad/s
    private Dikey_Hiz: number = 0;      // Hesaplanan dikey hız (m/s)

    private Yatay_Hiz: number = 0;       // Yatay hız büyüklüğü (m/s) — ECEF vektöründen
    private Paket_Sayisi: number = 0; // Gelen paket sayısı — ilk 2 pakete kadar tahmin yapılmaz

    // visual state
    private Guncel_Gorsel_Konum = new Cesium.Cartesian3();
    private Guncel_Gorsel_Yonelim = new Cesium.Quaternion();

    // zaman senkronizasyonu
    private Son_Sunucu_Zamani: number = 0; // lastServerTime
    private Sunucu_Zaman_Farki: number = 0;  // serverClientOffset

    // Ağın Ritmi ve Hata Yönetimi
    private Son_Paket_Yerel_Zamanı: number = 0; // lastPacketLocalTime
    private Ortalama_Paket_Suresi: number = 0.2; // avgPacketDt - Ağın ortalama paket süresi (Varsayılan 200ms)
    private Konum_Hatasi = new Cesium.Cartesian3(); // Hedef ile Görsel arasındaki Konum Hatası
    private Yonelim_Hatasi = new Cesium.Quaternion(); // Hedef ile Görsel arasındaki Açı Hatası
    
    private Yonelim_Sapmasi: number = 0; // Radyan cinsinden görsel sapma (örn: 180 derece için Math.PI)

    // VERİ ZAMAN AŞIMI: 
    // MAKS_TAHMIN_SURESI saniye boyunca veri gelmezse ekstrapolasyon durur.
    // MAKS_TAHMIN_SURESI saniye sonra gelen veri forceSync ile aracı yeni konumdan başlatır.
    // MAKS_TAHMIN_SURESI saniye içinde gelen veri normal kabul edilir, süzülerek yetişir.
    private readonly MAKS_TAHMIN_SURESI = 5.0;
    
    //kullanılmadı daha
    private readonly MAKS_KACIRILAN_PAKET = 5; 

    private readonly MAKS_YATIS_RAD = Cesium.Math.toRadians(60);   // Maksimum roll: ±60°
    private readonly MAKS_YUNUSLAMA_RAD = Cesium.Math.toRadians(45);  // Maksimum pitch: ±45°
    private readonly YERCEKIMI = 9.81; // Yerçekimi ivmesi (m/s²)

    // --- PERFORMANS SCRATCHPAD (Sıfır Çöp Üretimi) ---
    private static readonly _sMoveEnu = new Cesium.Cartesian3();
    private static readonly _sMoveEcef = new Cesium.Cartesian3();
    private static readonly _sTargetPos = new Cesium.Cartesian3();
    private static readonly _sEnuMatrix = new Cesium.Matrix4();
    private static readonly _sHpr = new Cesium.HeadingPitchRoll();
    private static readonly _sNewQuat = new Cesium.Quaternion();
    private static readonly _sInvEnuMatrix = new Cesium.Matrix4();
    private static readonly _sTrackDiff = new Cesium.Cartesian3(); // Track hesabı için (onPacketReceived)
    private static readonly _sTrackEnu = new Cesium.Cartesian3();  // Track ENU dönüşümü için
    private static readonly _sNewPos = new Cesium.Cartesian3();    // onPacketReceived için ayrı konum scratchpad
    private static readonly _sInvNewQuat = new Cesium.Quaternion();
    private static readonly _sDecayedOriError = new Cesium.Quaternion();

    
    constructor(initialLon: number, initialLat: number, initialHeight: number, initialH: number = 0, initialP: number = 0, initialR: number = 0) {
        // Verilen derece cinsinden coğrafi konumu Cesium'un kullandığı ECEF koordinatlarına çevirir
        Cesium.Cartesian3.fromDegrees(initialLon, initialLat, initialHeight, Cesium.Ellipsoid.WGS84, this.Guncel_Gorsel_Konum);
        Cesium.Cartesian3.clone(this.Guncel_Gorsel_Konum, this.Son_Gercek_Konum);

        // Başlangıç yönelimini (HPR) Quaternion'a çevir ve ayarla
        MovementEngine._sHpr.heading = initialH;
        MovementEngine._sHpr.pitch = initialP;
        MovementEngine._sHpr.roll = initialR;
        Cesium.Transforms.headingPitchRollQuaternion(this.Guncel_Gorsel_Konum, MovementEngine._sHpr, Cesium.Ellipsoid.WGS84, Cesium.Transforms.eastNorthUpToFixedFrame, this.Guncel_Gorsel_Yonelim);

        this.Son_Irtifa = initialHeight;
        this.Son_Pruva_Acisi = initialH;
        this.Yunuslama_Acisi = initialP;
        this.Yatis_Acisi = initialR;
        this.Rota_Acisi = initialH;
        this.Son_Rota_Acisi = initialH;

        this.Son_Paket_Yerel_Zamanı = Date.now();
        Cesium.Cartesian3.ZERO.clone(this.Konum_Hatasi);
        Cesium.Quaternion.IDENTITY.clone(this.Yonelim_Hatasi);
    }

    private getMaxPredictionTime(): number {
        // 5 packets * average interval. 
        // Minimum safety floor of 1.0s to handle initial startup or very high-frequency bursts.
        return Math.max(1.5, this.Ortalama_Paket_Suresi * this.MAKS_KACIRILAN_PAKET);
    }

    public setOrientationOffset(offsetRad: number): void {
        this.Yonelim_Sapmasi = offsetRad;
    }

    /**
     * Sunucudan yeni paket geldiğinde çalışır.
     * @param lon, lat, alt : Konum (Derece, Derece, Metre)
     * @param yatay_Hiz : Yatay hız (m/s)
     * @param h, p, r : Heading, Pitch, Roll (Radyan cinsinden)
     * @param serverTimestamp : Sunucu zaman damgası (ms)
     */
    public onPacketReceived(lon: number, lat: number, alt: number, yatay_Hiz: number, h: number, p: number, r: number, serverTimestamp: number) {

        if (!this.isValidPacket(lon, lat, alt, yatay_Hiz, h, p, r, serverTimestamp)) {
            return; // Geçersiz paket, işleme devam etme
        }

        const localNow = Date.now();
        const previousServerTime = this.Son_Sunucu_Zamani;

        // Saat senkronizasyonu için offset hesapla : paket verilerini alırken gecikme (ms)
        const currentOffset = localNow - serverTimestamp; 
        if (this.Sunucu_Zaman_Farki === 0) {
            this.Sunucu_Zaman_Farki = currentOffset;
        } else {
            this.Sunucu_Zaman_Farki = this.Sunucu_Zaman_Farki * 0.9 + currentOffset * 0.1;
        }
        this.Son_Sunucu_Zamani = serverTimestamp;


        // UZUN BOŞLUK KONTROLÜ (Timeout sonrası ilk paket)
        const dtPacket = (previousServerTime > 0) ? (serverTimestamp - previousServerTime) / 1000 : 0;

        if (dtPacket > this.MAKS_TAHMIN_SURESI) {
            // MAKS_TAHMIN_SURESI saniyeden uzun süre veri gelmemiş → aracı yeni konumdan başlat
            console.log(`[MovementEngine] ${dtPacket.toFixed(1)}s veri boşluğu → ForceSync yapılıyor.`);
            this.forceSync(lon, lat, alt, yatay_Hiz, h, p, r);
            return; // Bu paket işlendi (forceSync ile), normal akışa geçmeye gerek yok
        }

        // AĞIN RİTMİNİ (TICK RATE) ÖĞREN 
        if (this.Paket_Sayisi > 0) {
            const dtLocal = (localNow - this.Son_Paket_Yerel_Zamanı) / 1000.0;
            // Aşırı uçları kırparak (50ms - 2sn arası) ağın ortalama hızını buluyoruz
            const clampedDt = Math.max(0.05, Math.min(dtLocal, 2.0));
            this.Ortalama_Paket_Suresi = this.Ortalama_Paket_Suresi * 0.8 + clampedDt * 0.2;
        }
        this.Son_Paket_Yerel_Zamanı = localNow;


        // 3 saniyeden uzun süredir gelmiyorsa dönüşleri ve dalışları sıfırla,  ??????
        // uçağı sadece ileriye doğru DÜMDÜZ uçur                             
        if (dtPacket > 3.0 && previousServerTime > 0) {
            console.log(`[MovementEngine] ${dtPacket.toFixed(1)}s boşluk → Tahmin verileri sıfırlanıyor.`);
            this.Pruva_Donus_Hizi = 0;
            this.Rota_Donus_Hizi = 0;
            this.Yunuslama_Hizi = 0;
            this.Yatis_Hizi = 0;
            this.Dikey_Hiz = 0;
            this.Paket_Sayisi = 1; //sonraki pakette normal hesaplama başlamasını sağlar
        }
        
        // 1. Yeni Konum ve Yönelimi Dünya (ECEF) formatında hazırla
        this.Paket_Sayisi++;
        const newPos = Cesium.Cartesian3.fromDegrees(lon, lat, alt, Cesium.Ellipsoid.WGS84, MovementEngine._sNewPos);
        
        // ONCE FİZİK VE DÖNÜŞ HIZI HESAPLAMALARI 
        // 2. trackTurnRate + turnRate + Speed hesapla
        if (dtPacket > 0.01 && previousServerTime > 0) {
                       
            // İki paket arasındaki yer değiştirme vektörü (ECEF)
            const diff = Cesium.Cartesian3.subtract(newPos, this.Son_Gercek_Konum, MovementEngine._sTrackDiff);          
            // Bu vektörü ENU (Local) düzlemine çevirelim ki açıyı bulalım
            Cesium.Transforms.eastNorthUpToFixedFrame(this.Son_Gercek_Konum, Cesium.Ellipsoid.WGS84, MovementEngine._sEnuMatrix);
            const invEnu = Cesium.Matrix4.inverse(MovementEngine._sEnuMatrix, MovementEngine._sInvEnuMatrix);
            const localDiff = Cesium.Matrix4.multiplyByPointAsVector(invEnu, diff, MovementEngine._sTrackEnu);

            // --- trackTurnRate hesabı ---
            const moveDist = Cesium.Cartesian3.magnitude(localDiff);
            let rawTrackTurnRate = 0;

            // 1. DURMA KONTROLÜ
            if (this.Yatay_Hiz < 1.0) {
                // Araç duruyor veya park ediyor. Dönüş hızı kesinlikle SIFIR olmalı.
                rawTrackTurnRate = 0; 
            }
            // 2. GÜRÜLTÜ / BURST KONTROLÜ
            else if (moveDist < 1.5) {
                // Araç hızlı gidiyor ama 1.5 metreden az yol almış. Demek ki paket çok hızlı (Burst) geldi
                // Açı hesaplamak için mesafe çok kısa (gürültülü olur), bu yüzden ESKİ KAVİSİ KORU, sıfırlama
                rawTrackTurnRate = this.Rota_Donus_Hizi; 
            }
            // 3. NORMAL
            else {
                // Mesafe yeterince uzun, gerçek ve pürüzsüz açıyı hesapla
                this.Rota_Acisi = Math.atan2(localDiff.x, localDiff.y); //Doğuya ne kadar gittim? = X, Kuzeye ne kadar gittim? = Y 
                
                // 3. paketten önce dönüş hızı (kavis) HESAPLANAMAZ
                if (this.Paket_Sayisi > 2) {
                    // Track bazlı dönüş hızı (Manevra tahmini için)
                    let deltaT = this.Rota_Acisi - this.Son_Rota_Acisi;
                    if (deltaT > Math.PI) deltaT -= Math.PI * 2;
                    if (deltaT < -Math.PI) deltaT += Math.PI * 2;
                    rawTrackTurnRate = deltaT / dtPacket;
                }
            }       
            
            // İrtifa farkını geçen süreye bölüyoruz
            this.Dikey_Hiz = (alt - this.Son_Irtifa) / dtPacket;
            // Gereksiz titremeyi (jitter) önlemek için dikey hızı biraz sönümleyebilirsin (opsiyonel)
            // this.Dikey_Hiz = this.Dikey_Hiz * 0.8 + (newVz * 0.2);
            

            // --------- TEST KODU BAŞLANGICI (CANLIYA ÇIKARKEN BU BLOĞU SİL)----------
            // Eğer sunucu p ve r değerlerini 0 gönderiyorsa ve araç hareket ediyorsa
            // (Sadece testler için C# verisini eziyoruz)
            if (p === 0 && r === 0 && yatay_Hiz > 1.0) {
                r = Math.atan(yatay_Hiz * this.Pruva_Donus_Hizi / this.YERCEKIMI);
                p = Math.atan2(this.Dikey_Hiz, yatay_Hiz);
                
                // Limitleri (Clamp) uygula: 60 derece yatış (1.047 rad), 45 derece dalış (0.785 rad)
                r =  Math.max(-this.MAKS_YATIS_RAD, Math.min(this.MAKS_YATIS_RAD, r));
                p = Math.max(-this.MAKS_YUNUSLAMA_RAD, Math.min(this.MAKS_YUNUSLAMA_RAD, p));
                console.log("TEST KODU AKTİF");
            }
            else{
                console.log("TEST KODU PASİF");
            }
            // --------- TEST KODU BİTİŞİ ----------


            // --- turnRate hesabı ---
            let rawTurnRate = 0;
            let rawPitchRate = 0;
            let rawRollRate = 0;

            if (this.Paket_Sayisi > 2) {
                // YAW (Heading) Hızı  
                let deltaH = h - this.Son_Pruva_Acisi;
                if (deltaH > Math.PI) deltaH -= Math.PI * 2;
                if (deltaH < -Math.PI) deltaH += Math.PI * 2;
                rawTurnRate = deltaH / dtPacket;

                // PITCH (Yunuslama) Hızı
                let deltaP = p - this.Yunuslama_Acisi;
                if (deltaP > Math.PI) deltaP -= Math.PI * 2;
                if (deltaP < -Math.PI) deltaP += Math.PI * 2;
                rawPitchRate = deltaP / dtPacket;

                // ROLL (Yatış) Hızı
                let deltaR = r - this.Yatis_Acisi;
                if (deltaR > Math.PI) deltaR -= Math.PI * 2;
                if (deltaR < -Math.PI) deltaR += Math.PI * 2;
                rawRollRate = deltaR / dtPacket;
            }

            // --- LOW-PASS FILTER (Hareketli Ortalama) ---
            // Eğer uçak yeni doğduysa veya uzun süredir veri gelmiyorsa filtreyi sıfırla
            if (this.Paket_Sayisi <= 3 || dtPacket > 3.0) {
                this.Rota_Donus_Hizi = rawTrackTurnRate;
                this.Pruva_Donus_Hizi = rawTurnRate;
                this.Yunuslama_Hizi = rawPitchRate;
                this.Yatis_Hizi = rawRollRate;
            } else {
                // Ağdaki anlık kopmalara/patlamalara karşı eski istikrarı %80 koru, yeni hıza %20 güven
                this.Rota_Donus_Hizi = (this.Rota_Donus_Hizi * 0.8) + (rawTrackTurnRate * 0.2);
                this.Pruva_Donus_Hizi = (this.Pruva_Donus_Hizi * 0.8) + (rawTurnRate * 0.2);
                this.Yunuslama_Hizi = (this.Yunuslama_Hizi * 0.8) + (rawPitchRate * 0.2);
                this.Yatis_Hizi = (this.Yatis_Hizi * 0.8) + (rawRollRate * 0.2);
            }
        }

        MovementEngine._sHpr.heading = h + this.Yonelim_Sapmasi;
        MovementEngine._sHpr.pitch = p;
        MovementEngine._sHpr.roll = r;
        const newQuat = Cesium.Transforms.headingPitchRollQuaternion(newPos, MovementEngine._sHpr, Cesium.Ellipsoid.WGS84, Cesium.Transforms.eastNorthUpToFixedFrame, MovementEngine._sNewQuat);


        // 3. BAŞLANGIÇ KANCASINI (HOOK) ÖNLE VE HATA VEKTÖRÜNÜ YAKALA
        if (this.Paket_Sayisi <= 2) {
            // İlk 2 pakette yumuşatmayı iptal et, doğrudan ham veriye ışınla (Kancayı engeller)
            Cesium.Cartesian3.ZERO.clone(this.Konum_Hatasi);
            Cesium.Quaternion.IDENTITY.clone(this.Yonelim_Hatasi);
            Cesium.Cartesian3.clone(newPos, this.Guncel_Gorsel_Konum);
            Cesium.Quaternion.clone(newQuat, this.Guncel_Gorsel_Yonelim);
        } else {

            // 3. Paketten itibaren hata sönümlemesine (Error Blending) başla
            // HATA VEKTÖRÜNÜ YAKALA 
            // Yeni hedef konumu belirlemeden önce, görsel modelin ne kadar "yanlış" yerde kaldığını buluruz.
            Cesium.Cartesian3.subtract(this.Guncel_Gorsel_Konum, newPos, this.Konum_Hatasi);
            
            // Açı hatasını bul: oriError = currentVisual * inverse(newQuat)
            const invNewQuat = Cesium.Quaternion.inverse(newQuat, MovementEngine._sInvNewQuat);
            Cesium.Quaternion.multiply(this.Guncel_Gorsel_Yonelim, invNewQuat, this.Yonelim_Hatasi);

            // Güvenlik: Eğer ağda devasa bir lag olduysa ve hata 500 metreyi geçtiyse, 
            // sönümleme yapma, direkt ışınlan (lastik gibi çekilmesini önler).
            if (Cesium.Cartesian3.magnitude(this.Konum_Hatasi) > 500.0) {
                Cesium.Cartesian3.ZERO.clone(this.Konum_Hatasi);
                Cesium.Quaternion.IDENTITY.clone(this.Yonelim_Hatasi);
            }
        }

        this.Son_Rota_Acisi = this.Rota_Acisi;
        this.Son_Irtifa = alt;
        this.Son_Pruva_Acisi = h;
        this.Yunuslama_Acisi = p;
        this.Yatis_Acisi = r;
        this.Yatay_Hiz = yatay_Hiz; // Yatay hız doğrudan sunucudan geliyor

        // Serbest uçuş verileri doğrudan hedefe yaz
        Cesium.Cartesian3.clone(newPos, this.Son_Gercek_Konum);
    }


    public Guncel_Konumu_Getir(result: Cesium.Cartesian3): Cesium.Cartesian3 {
        const localNow = Date.now();
        const estimatedServerNow = localNow - this.Sunucu_Zaman_Farki;
        let dtSincePacket = (estimatedServerNow - this.Son_Sunucu_Zamani) / 1000;
        
        // Guvenlik
        if (dtSincePacket < 0) dtSincePacket = 0;
        if (dtSincePacket > this.MAKS_TAHMIN_SURESI) dtSincePacket = this.MAKS_TAHMIN_SURESI;

        // HEADING + TRACK ANGLE TAHMİNİ: Basit ama sağlam ekstrapolasyon
        const targetPos = Cesium.Cartesian3.clone(this.Son_Gercek_Konum, MovementEngine._sTargetPos);

        if (dtSincePacket > 0 && this.Yatay_Hiz > 0.01 && this.Paket_Sayisi >= 2) {

            const moveEnu = MovementEngine._sMoveEnu;
            
            // Eğer dönüş hızı çok küçükse (düz uçuş), sıfıra bölme hatasını önlemek için klasik doğrusal (kiriş) formül
            if (Math.abs(this.Rota_Donus_Hizi) < 0.001) {
                const predictedTrack = this.Rota_Acisi + (this.Rota_Donus_Hizi * dtSincePacket);
                moveEnu.x = Math.sin(predictedTrack) * this.Yatay_Hiz * dtSincePacket; // East
                moveEnu.y = Math.cos(predictedTrack) * this.Yatay_Hiz * dtSincePacket; // North
            } 
            // Eğer uçak virajdaysa YAY İNTEGRALİ (CTRV - Sabit Dönüş Hızı ve Hız Modeli)
            else {
                const theta0 = this.Rota_Acisi;
                const theta1 = theta0 + (this.Rota_Donus_Hizi * dtSincePacket);
                const R = this.Yatay_Hiz / this.Rota_Donus_Hizi; // Dönüş Yarıçapı (V / w)

                // Vx=Sin integrali -Cos. Vy=Cos integrali Sin.
                moveEnu.x = R * (Math.cos(theta0) - Math.cos(theta1)); // East
                moveEnu.y = R * (Math.sin(theta1) - Math.sin(theta0)); // North
            }

            // DİKEY TAHMİN
            // Uçak paketler arasında Dikey_Hiz hızıyla yükseliyor veya alçalıyor
            moveEnu.z = this.Dikey_Hiz * dtSincePacket;

            // ENU → ECEF dönüşüm matrisi
            // moveEnu = (100m doğu, 50m kuzey, 10m yukarı)  →  ECEF = (dx, dy, dz)
            Cesium.Transforms.eastNorthUpToFixedFrame(this.Son_Gercek_Konum, Cesium.Ellipsoid.WGS84, MovementEngine._sEnuMatrix);
            Cesium.Matrix4.multiplyByPointAsVector(MovementEngine._sEnuMatrix, moveEnu, MovementEngine._sMoveEcef);
            Cesium.Cartesian3.add(targetPos, MovementEngine._sMoveEcef, targetPos);
        }

        // 2. HATA VEKTÖRÜNÜ ERİT (ERROR BLENDING)
        // Son paketten bu yana ne kadar zaman geçtiğini kendi yerel saatimizle ölçüyoruz.
        const timeSinceLastUpdate = (Date.now() - this.Son_Paket_Yerel_Zamanı) / 1000.0;
        
        // Ağın ritmine göre sönümleme katsayısı (Ortalama sürede hatanın %95'i erir)
        // GÜVENLİK : Ağ 50ms atsa bile amortisör hatayı en az 0.5 saniyede eritsin ki uçak zıplamasın!
        const safeBlendDuration = Math.max(this.Ortalama_Paket_Suresi, 0.2); // 0.5
        const Sonumleme_Hizi = 3.0 / safeBlendDuration; // decayRate
        const Sonumleme_Katsayisi = Math.exp(-Sonumleme_Hizi * timeSinceLastUpdate);

        // 3. Görsel Konum = Kusursuz Konum + Eriyen Hata
        const currentError = Cesium.Cartesian3.multiplyByScalar(this.Konum_Hatasi, Sonumleme_Katsayisi, MovementEngine._sMoveEcef);
        Cesium.Cartesian3.add(targetPos, currentError, this.Guncel_Gorsel_Konum);

        return Cesium.Cartesian3.clone(this.Guncel_Gorsel_Konum, result);
    }
    
    // HEADING + ROLL + PITCH EKSTRAPOLASYONU
    public Guncel_Yonelimi_Getir(result: Cesium.Quaternion): Cesium.Quaternion {

        const localNow = Date.now();
        const estimatedServerNow = localNow - this.Sunucu_Zaman_Farki;
        let dtSincePacket = (estimatedServerNow - this.Son_Sunucu_Zamani) / 1000;
        if (dtSincePacket < 0) dtSincePacket = 0;

        if (dtSincePacket > this.MAKS_TAHMIN_SURESI) dtSincePacket = this.MAKS_TAHMIN_SURESI;

        // Heading'i turnRate ile tahmin et (pozisyon için trackAngle, görsel için heading)
        const predictedHeading = this.Son_Pruva_Acisi + (this.Pruva_Donus_Hizi * dtSincePacket) + this.Yonelim_Sapmasi;
        const predictedPitch = this.Yunuslama_Acisi + (this.Yunuslama_Hizi * dtSincePacket);
        const predictedRoll = this.Yatis_Acisi + (this.Yatis_Hizi * dtSincePacket);

        MovementEngine._sHpr.heading = predictedHeading;
        MovementEngine._sHpr.pitch = predictedPitch;
        MovementEngine._sHpr.roll = predictedRoll;

        // Modelin ekrandaki konumunda ENU çerçevesinden quaternion hesapla
        const predictedQuat = Cesium.Transforms.headingPitchRollQuaternion(
            this.Guncel_Gorsel_Konum, MovementEngine._sHpr,
            Cesium.Ellipsoid.WGS84, Cesium.Transforms.eastNorthUpToFixedFrame,
            MovementEngine._sNewQuat
        );

        // HATA VEKTÖRÜNÜ ERİT (ERROR BLENDING)
        const timeSinceLastUpdate = (Date.now() - this.Son_Paket_Yerel_Zamanı) / 1000.0;
        // GÜVENLİK (Aynı şekilde buraya da ekliyoruz) //0.5 yapabilirsin 
        const safeBlendDuration = Math.max(this.Ortalama_Paket_Suresi, 0.2);
        const Sonumleme_Hizi = 3.0 / safeBlendDuration; //decayRate
        const Sonumleme_Katsayisi = Math.exp(-Sonumleme_Hizi * timeSinceLastUpdate);

        // Açı hatasını sıfıra (IDENTITY) doğru küçült
        // slerp : İki yön arasındaki en kısa yolu izleyen küresel yumuşatma fonksiyonudur.
        const decayedOriError = Cesium.Quaternion.slerp(Cesium.Quaternion.IDENTITY, this.Yonelim_Hatasi, Sonumleme_Katsayisi, MovementEngine._sDecayedOriError);
        
        // Görsel Yönelim = Eriyen Hata * Kusursuz Yönelim
        Cesium.Quaternion.multiply(decayedOriError, predictedQuat, this.Guncel_Gorsel_Yonelim);

        return Cesium.Quaternion.clone(this.Guncel_Gorsel_Yonelim, result);
    }


    private isValidPacket(lon: number, lat: number, alt: number, speed: number, h: number, p: number, r: number, serverTimestamp: number): boolean {
        // 1. Zaman Kontrolü (Gecikmiş veya mükerrer veri tespiti)
        if (this.Son_Sunucu_Zamani > 0 && serverTimestamp <= this.Son_Sunucu_Zamani) {
            console.warn(`[MovementEngine] Eski/Mükerrer Paket: ${serverTimestamp} <= ${this.Son_Sunucu_Zamani}`);
            return false;
        }

        // 2. Sayısal Güvenlik (NaN/Sonsuz veri tespiti)
        if (![lon, lat, alt, speed, h, p, r].every(Number.isFinite)) {
            console.warn(`[MovementEngine] Geçersiz Sayı (NaN/Inf) Tespit Edildi!`);
            return false;
        }

        // 3. Sabit Coğrafi Sınırlar (WGS84)
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            console.warn(`[MovementEngine] Coğrafi Sınır Dışı: Lat:${lat}, Lon:${lon}`);
            return false;
        }

        // Tüm kontroller geçildi
        return true;
    }

    /**
     * Uçağı anında yeni bir konuma ve yöne ışınlar.
     * this.Guncel_Gorsel_Konum ve this.Guncel_Gorsel_Yonelim'ı günceller.
     * Yumuşatma (smoothing) ve tahmini (prediction) devre dışı bırakır.
     */
    private forceSync(lon: number, lat: number, alt: number, speed: number, h: number, p: number, r: number) {
        // 1. Sadece GÖRSEL durumu anında eşitle (Işınlanma efekti için)
        const posEcef = Cesium.Cartesian3.fromDegrees(lon, lat, alt, Cesium.Ellipsoid.WGS84, MovementEngine._sNewPos);
        
        // 2. Referans konumu güncelle (Son_Gercek_Konum)
        Cesium.Cartesian3.clone(posEcef, this.Son_Gercek_Konum);
        // Görsel konumu da anında eşitle
        Cesium.Cartesian3.clone(posEcef, this.Guncel_Gorsel_Konum);
        
        const quat = this.calculateQuaternion(posEcef, h, p, r);
        Cesium.Quaternion.clone(quat, this.Guncel_Gorsel_Yonelim);

        // 2. TAHMİN MOTORUNU SIFIRLA
        // packetCount'u 0 yapmak, getLatestPosition içindeki 'if (packetCount >= 2)' 
        // kontrolü sayesinde yeni paketler gelene kadar hatalı tahmin yapılmasını engeller.
        this.Paket_Sayisi = 0;

        ////
        this.Pruva_Donus_Hizi = 0;
        this.Rota_Donus_Hizi = 0;
        this.Yunuslama_Hizi = 0;
        this.Yatis_Hizi = 0;
        this.Dikey_Hiz = 0;
        this.Yatay_Hiz = speed;
        this.Son_Irtifa = alt;
        this.Son_Pruva_Acisi = h;
        this.Yunuslama_Acisi = p;
        this.Yatis_Acisi = r;
        ////

        // Işınlanmada hataları sıfırla ki yumuşatmaya kalkmasın
        Cesium.Cartesian3.ZERO.clone(this.Konum_Hatasi);
        Cesium.Quaternion.IDENTITY.clone(this.Yonelim_Hatasi);
        
        console.log(`[MovementEngine] Işınlanma (ForceSync) tamamlandı: ${lon.toFixed(5)}, ${lat.toFixed(5)}`);
    }

    /**
    * Belirli bir konum ve HPR açısı için Cesium Quaternion üretir.
    * Scratchpad kullanarak bellek yönetimini optimize eder.
    */
    private calculateQuaternion(position: Cesium.Cartesian3, h: number, p: number, r: number): Cesium.Quaternion {
        const hpr = MovementEngine._sHpr;
        hpr.heading = h + this.Yonelim_Sapmasi;
        hpr.pitch = p;
        hpr.roll = r;

        // Cesium'un yerel ENU (East-North-Up) çerçevesinden dünya çerçevesine dönüşüm
        return Cesium.Transforms.headingPitchRollQuaternion(
            position,
            hpr,
            Cesium.Ellipsoid.WGS84,
            Cesium.Transforms.eastNorthUpToFixedFrame,
            MovementEngine._sNewQuat // Mevcut scratchpad'i kullanıyoruz
        );
    }

    /**
    * Debug bilgilerini döndürür (ekran üstü HUD için).
    */
    public getDebugInfo(): { timeSincePacket: number; yatay_Hiz: number; paket_Sayisi: number; status: string } {
        const localNow = Date.now();
        const estimatedServerNow = localNow - this.Sunucu_Zaman_Farki;
        const timeSincePacket = this.Son_Sunucu_Zamani > 0 ? (estimatedServerNow - this.Son_Sunucu_Zamani) / 1000 : 0;

        let status = "BEKLENIYOR";
        if (this.Son_Sunucu_Zamani === 0) {
            status = "ILK_PAKET";
        } else if (timeSincePacket > this.MAKS_TAHMIN_SURESI) {
            status = "TIMEOUT";
        } else if (timeSincePacket > 3.0) {
            status = "UZUN_BOSLUK";
        } else {
            status = "VERI_ALINIYOR";
        }

        return {
            timeSincePacket: Math.max(0, timeSincePacket),
            yatay_Hiz: this.Yatay_Hiz,
            paket_Sayisi: this.Paket_Sayisi,
            status
        };
    }

    // uçak ve ham kayıt izi için 
    public isTimeout(): boolean {
        const localNow = Date.now();
        const estimatedServerNow = localNow - this.Sunucu_Zaman_Farki;
        const timeSincePacket = this.Son_Sunucu_Zamani > 0 ? (estimatedServerNow - this.Son_Sunucu_Zamani) / 1000 : 0;
        return timeSincePacket > this.MAKS_TAHMIN_SURESI;
    }
}