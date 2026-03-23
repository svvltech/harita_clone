import * as Cesium from "cesium";


export class MovementEngine {
    
    private lastRealPos = new Cesium.Cartesian3();

    private trackAngle: number = 0;     // Gerçek ilerleme rotası (Fiziksel)
    private lastTrackAngle: number = 0; // Bir önceki rotanın açısı
    private trackTurnRate: number = 0;  // Rota üzerindeki dönüş hızı (rad/s)

    private lastHeading: number = 0; 
    private turnRate: number = 0;    // Dönüş hızı (rad/s) 

    private lastAlt: number = 0;   // irtifa (m)
    private lastPitch: number = 0; // yunuslama (rad)
    private lastRoll: number = 0;  // yatma (rad)

    private pitchRate: number = 0; // rad/s
    private rollRate: number = 0;  // rad/s
    private vz: number = 0;      // Hesaplanan dikey hız (m/s)

    private speed: number = 0;       // Yatay hız büyüklüğü (m/s) — ECEF vektöründen
    private packetCount: number = 0; // Gelen paket sayısı — ilk 2 pakete kadar tahmin yapılmaz

    // visual state
    private currentVisualPos = new Cesium.Cartesian3();
    private currentVisualQuat = new Cesium.Quaternion();

    // zaman senkronizasyonu
    private lastServerTime: number = 0; 
    private serverClientOffset: number = 0; 

    // Ağın Ritmi ve Hata Yönetimi
    private lastPacketLocalTime: number = 0; 
    private avgPacketDt: number = 0.2; // Ağın ortalama paket süresi (Varsayılan 200ms)
    private posError = new Cesium.Cartesian3(); // Hedef ile Görsel arasındaki Konum Hatası
    private oriError = new Cesium.Quaternion(); // Hedef ile Görsel arasındaki Açı Hatası
    
    private orientationOffset: number = 0; // Radyan cinsinden görsel sapma (örn: 180 derece için Math.PI)

    // VERİ ZAMAN AŞIMI: 
    // PREDICTION_MAX_SEC saniye boyunca veri gelmezse ekstrapolasyon durur.
    // PREDICTION_MAX_SEC saniye sonra gelen veri forceSync ile aracı yeni konumdan başlatır.
    // PREDICTION_MAX_SEC saniye içinde gelen veri normal kabul edilir, süzülerek yetişir.
    private readonly PREDICTION_MAX_SEC = 5.0;
    
    //kullanılmadı daha
    private readonly MAX_MISSED_PACKETS = 5; 

    private readonly MAX_ROLL_RAD = Cesium.Math.toRadians(60);   // Maksimum roll: ±60°
    private readonly MAX_PITCH_RAD = Cesium.Math.toRadians(45);  // Maksimum pitch: ±45°
    private readonly GRAVITY = 9.81; // Yerçekimi ivmesi (m/s²)

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
        Cesium.Cartesian3.fromDegrees(initialLon, initialLat, initialHeight, Cesium.Ellipsoid.WGS84, this.currentVisualPos);
        Cesium.Cartesian3.clone(this.currentVisualPos, this.lastRealPos);

        // Başlangıç yönelimini (HPR) Quaternion'a çevir ve ayarla
        MovementEngine._sHpr.heading = initialH;
        MovementEngine._sHpr.pitch = initialP;
        MovementEngine._sHpr.roll = initialR;
        Cesium.Transforms.headingPitchRollQuaternion(this.currentVisualPos, MovementEngine._sHpr, Cesium.Ellipsoid.WGS84, Cesium.Transforms.eastNorthUpToFixedFrame, this.currentVisualQuat);

        this.lastAlt = initialHeight;
        this.lastHeading = initialH;
        this.lastPitch = initialP;
        this.lastRoll = initialR;
        this.trackAngle = initialH;
        this.lastTrackAngle = initialH;

        this.lastPacketLocalTime = Date.now();
        Cesium.Cartesian3.ZERO.clone(this.posError);
        Cesium.Quaternion.IDENTITY.clone(this.oriError);
    }

    private getMaxPredictionTime(): number {
        // 5 packets * average interval. 
        // Minimum safety floor of 1.0s to handle initial startup or very high-frequency bursts.
        return Math.max(1.5, this.avgPacketDt * this.MAX_MISSED_PACKETS);
    }

    public setOrientationOffset(offsetRad: number): void {
        this.orientationOffset = offsetRad;
    }

    /**
     * Sunucudan yeni paket geldiğinde çalışır.
     * @param lon, lat, alt : Konum (Derece, Derece, Metre)
     * @param speed : Yatay hız (m/s)
     * @param h, p, r : Heading, Pitch, Roll (Radyan cinsinden)
     * @param serverTimestamp : Sunucu zaman damgası (ms)
     */
    public onPacketReceived(lon: number, lat: number, alt: number, speed: number, h: number, p: number, r: number, serverTimestamp: number) {

        if (!this.isValidPacket(lon, lat, alt, speed, h, p, r, serverTimestamp)) {
            return; // Geçersiz paket, işleme devam etme
        }

        const localNow = Date.now();
        const previousServerTime = this.lastServerTime;

        // Saat senkronizasyonu için offset hesapla : paket verilerini alırken gecikme (ms)
        const currentOffset = localNow - serverTimestamp; 
        if (this.serverClientOffset === 0) {
            this.serverClientOffset = currentOffset;
        } else {
            this.serverClientOffset = this.serverClientOffset * 0.9 + currentOffset * 0.1;
        }
        this.lastServerTime = serverTimestamp;


        // UZUN BOŞLUK KONTROLÜ (Timeout sonrası ilk paket)
        const dtPacket = (previousServerTime > 0) ? (serverTimestamp - previousServerTime) / 1000 : 0;

        if (dtPacket > this.PREDICTION_MAX_SEC) {
            // PREDICTION_MAX_SEC saniyeden uzun süre veri gelmemiş → aracı yeni konumdan başlat
            console.log(`[MovementEngine] ${dtPacket.toFixed(1)}s veri boşluğu → ForceSync yapılıyor.`);
            this.forceSync(lon, lat, alt, speed, h, p, r);
            return; // Bu paket işlendi (forceSync ile), normal akışa geçmeye gerek yok
        }

        // AĞIN RİTMİNİ (TICK RATE) ÖĞREN 
        if (this.packetCount > 0) {
            const dtLocal = (localNow - this.lastPacketLocalTime) / 1000.0;
            // Aşırı uçları kırparak (50ms - 2sn arası) ağın ortalama hızını buluyoruz
            const clampedDt = Math.max(0.05, Math.min(dtLocal, 2.0));
            this.avgPacketDt = this.avgPacketDt * 0.8 + clampedDt * 0.2;
        }
        this.lastPacketLocalTime = localNow;


        // 3 saniyeden uzun süredir gelmiyorsa dönüşleri ve dalışları sıfırla,  ??????
        // uçağı sadece ileriye doğru DÜMDÜZ uçur                             
        if (dtPacket > 3.0 && previousServerTime > 0) {
            console.log(`[MovementEngine] ${dtPacket.toFixed(1)}s boşluk → Tahmin verileri sıfırlanıyor.`);
            this.turnRate = 0;
            this.trackTurnRate = 0;
            this.pitchRate = 0;
            this.rollRate = 0;
            this.vz = 0;
            this.packetCount = 1; //sonraki pakette normal hesaplama başlamasını sağlar
        }
        
        // 1. Yeni Konum ve Yönelimi Dünya (ECEF) formatında hazırla
        this.packetCount++;
        const newPos = Cesium.Cartesian3.fromDegrees(lon, lat, alt, Cesium.Ellipsoid.WGS84, MovementEngine._sNewPos);
        
        // ONCE FİZİK VE DÖNÜŞ HIZI HESAPLAMALARI 
        // 2. trackTurnRate + turnRate + Speed hesapla
        if (dtPacket > 0.01 && previousServerTime > 0) {
                       
            // İki paket arasındaki yer değiştirme vektörü (ECEF)
            const diff = Cesium.Cartesian3.subtract(newPos, this.lastRealPos, MovementEngine._sTrackDiff);          
            // Bu vektörü ENU (Local) düzlemine çevirelim ki açıyı bulalım
            Cesium.Transforms.eastNorthUpToFixedFrame(this.lastRealPos, Cesium.Ellipsoid.WGS84, MovementEngine._sEnuMatrix);
            const invEnu = Cesium.Matrix4.inverse(MovementEngine._sEnuMatrix, MovementEngine._sInvEnuMatrix);
            const localDiff = Cesium.Matrix4.multiplyByPointAsVector(invEnu, diff, MovementEngine._sTrackEnu);

            // --- trackTurnRate hesabı ---
            const moveDist = Cesium.Cartesian3.magnitude(localDiff);
            let rawTrackTurnRate = 0;

            // 1. DURMA KONTROLÜ
            if (this.speed < 1.0) {
                // Araç duruyor veya park ediyor. Dönüş hızı kesinlikle SIFIR olmalı.
                rawTrackTurnRate = 0; 
            }
            // 2. GÜRÜLTÜ / BURST KONTROLÜ
            else if (moveDist < 1.5) {
                // Araç hızlı gidiyor ama 1.5 metreden az yol almış. Demek ki paket çok hızlı (Burst) geldi
                // Açı hesaplamak için mesafe çok kısa (gürültülü olur), bu yüzden ESKİ KAVİSİ KORU, sıfırlama
                rawTrackTurnRate = this.trackTurnRate; 
            }
            // 3. NORMAL
            else {
                // Mesafe yeterince uzun, gerçek ve pürüzsüz açıyı hesapla
                this.trackAngle = Math.atan2(localDiff.x, localDiff.y); //Doğuya ne kadar gittim? = X, Kuzeye ne kadar gittim? = Y 
                
                // 3. paketten önce dönüş hızı (kavis) HESAPLANAMAZ
                if (this.packetCount > 2) {
                    // Track bazlı dönüş hızı (Manevra tahmini için)
                    let deltaT = this.trackAngle - this.lastTrackAngle;
                    if (deltaT > Math.PI) deltaT -= Math.PI * 2;
                    if (deltaT < -Math.PI) deltaT += Math.PI * 2;
                    rawTrackTurnRate = deltaT / dtPacket;
                }
            }       
            
            // İrtifa farkını geçen süreye bölüyoruz
            this.vz = (alt - this.lastAlt) / dtPacket;
            // Gereksiz titremeyi (jitter) önlemek için dikey hızı biraz sönümleyebilirsin (opsiyonel)
            // this.vz = this.vz * 0.8 + (newVz * 0.2);
            

            // --------- TEST KODU BAŞLANGICI (CANLIYA ÇIKARKEN BU BLOĞU SİL)----------
            // Eğer sunucu p ve r değerlerini 0 gönderiyorsa ve araç hareket ediyorsa
            // (Sadece testler için C# verisini eziyoruz)
            if (p === 0 && r === 0 && speed > 1.0) {
                r = Math.atan(speed * this.turnRate / this.GRAVITY);
                p = Math.atan2(this.vz, speed);
                
                // Limitleri (Clamp) uygula: 60 derece yatış (1.047 rad), 45 derece dalış (0.785 rad)
                r =  Math.max(-this.MAX_ROLL_RAD, Math.min(this.MAX_ROLL_RAD, r));
                p = Math.max(-this.MAX_PITCH_RAD, Math.min(this.MAX_PITCH_RAD, p));
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

            if (this.packetCount > 2) {
                // YAW (Heading) Hızı  
                let deltaH = h - this.lastHeading;
                if (deltaH > Math.PI) deltaH -= Math.PI * 2;
                if (deltaH < -Math.PI) deltaH += Math.PI * 2;
                rawTurnRate = deltaH / dtPacket;

                // PITCH (Yunuslama) Hızı
                let deltaP = p - this.lastPitch;
                if (deltaP > Math.PI) deltaP -= Math.PI * 2;
                if (deltaP < -Math.PI) deltaP += Math.PI * 2;
                rawPitchRate = deltaP / dtPacket;

                // ROLL (Yatış) Hızı
                let deltaR = r - this.lastRoll;
                if (deltaR > Math.PI) deltaR -= Math.PI * 2;
                if (deltaR < -Math.PI) deltaR += Math.PI * 2;
                rawRollRate = deltaR / dtPacket;
            }

            // --- LOW-PASS FILTER (Hareketli Ortalama) ---
            // Eğer uçak yeni doğduysa veya uzun süredir veri gelmiyorsa filtreyi sıfırla
            if (this.packetCount <= 3 || dtPacket > 3.0) {
                this.trackTurnRate = rawTrackTurnRate;
                this.turnRate = rawTurnRate;
                this.pitchRate = rawPitchRate;
                this.rollRate = rawRollRate;
            } else {
                // Ağdaki anlık kopmalara/patlamalara karşı eski istikrarı %80 koru, yeni hıza %20 güven
                this.trackTurnRate = (this.trackTurnRate * 0.8) + (rawTrackTurnRate * 0.2);
                this.turnRate = (this.turnRate * 0.8) + (rawTurnRate * 0.2);
                this.pitchRate = (this.pitchRate * 0.8) + (rawPitchRate * 0.2);
                this.rollRate = (this.rollRate * 0.8) + (rawRollRate * 0.2);
            }
        }

        MovementEngine._sHpr.heading = h + this.orientationOffset;
        MovementEngine._sHpr.pitch = p;
        MovementEngine._sHpr.roll = r;
        const newQuat = Cesium.Transforms.headingPitchRollQuaternion(newPos, MovementEngine._sHpr, Cesium.Ellipsoid.WGS84, Cesium.Transforms.eastNorthUpToFixedFrame, MovementEngine._sNewQuat);


        // 3. BAŞLANGIÇ KANCASINI (HOOK) ÖNLE VE HATA VEKTÖRÜNÜ YAKALA
        if (this.packetCount <= 2) {
            // İlk 2 pakette yumuşatmayı iptal et, doğrudan ham veriye ışınla (Kancayı engeller)
            Cesium.Cartesian3.ZERO.clone(this.posError);
            Cesium.Quaternion.IDENTITY.clone(this.oriError);
            Cesium.Cartesian3.clone(newPos, this.currentVisualPos);
            Cesium.Quaternion.clone(newQuat, this.currentVisualQuat);
        } else {

            // 3. Paketten itibaren hata sönümlemesine (Error Blending) başla
            // HATA VEKTÖRÜNÜ YAKALA 
            // Yeni hedef konumu belirlemeden önce, görsel modelin ne kadar "yanlış" yerde kaldığını buluruz.
            Cesium.Cartesian3.subtract(this.currentVisualPos, newPos, this.posError);
            
            // Açı hatasını bul: oriError = currentVisual * inverse(newQuat)
            const invNewQuat = Cesium.Quaternion.inverse(newQuat, MovementEngine._sInvNewQuat);
            Cesium.Quaternion.multiply(this.currentVisualQuat, invNewQuat, this.oriError);

            // Güvenlik: Eğer ağda devasa bir lag olduysa ve hata 500 metreyi geçtiyse, 
            // sönümleme yapma, direkt ışınlan (lastik gibi çekilmesini önler).
            if (Cesium.Cartesian3.magnitude(this.posError) > 500.0) {
                Cesium.Cartesian3.ZERO.clone(this.posError);
                Cesium.Quaternion.IDENTITY.clone(this.oriError);
            }
        }

        this.lastTrackAngle = this.trackAngle;
        this.lastAlt = alt;
        this.lastHeading = h;
        this.lastPitch = p;
        this.lastRoll = r;
        this.speed = speed; // Yatay hız doğrudan sunucudan geliyor

        // Serbest uçuş verileri doğrudan hedefe yaz
        Cesium.Cartesian3.clone(newPos, this.lastRealPos);
    }


    public getLatestPosition(result: Cesium.Cartesian3): Cesium.Cartesian3 {
        const localNow = Date.now();
        const estimatedServerNow = localNow - this.serverClientOffset;
        let dtSincePacket = (estimatedServerNow - this.lastServerTime) / 1000;
        
        // Guvenlik
        if (dtSincePacket < 0) dtSincePacket = 0;
        if (dtSincePacket > this.PREDICTION_MAX_SEC) dtSincePacket = this.PREDICTION_MAX_SEC;

        // HEADING + TRACK ANGLE TAHMİNİ: Basit ama sağlam ekstrapolasyon
        const targetPos = Cesium.Cartesian3.clone(this.lastRealPos, MovementEngine._sTargetPos);

        if (dtSincePacket > 0 && this.speed > 0.01 && this.packetCount >= 2) {

            const moveEnu = MovementEngine._sMoveEnu;
            
            // Eğer dönüş hızı çok küçükse (düz uçuş), sıfıra bölme hatasını önlemek için klasik doğrusal (kiriş) formül
            if (Math.abs(this.trackTurnRate) < 0.001) {
                const predictedTrack = this.trackAngle + (this.trackTurnRate * dtSincePacket);
                moveEnu.x = Math.sin(predictedTrack) * this.speed * dtSincePacket; // East
                moveEnu.y = Math.cos(predictedTrack) * this.speed * dtSincePacket; // North
            } 
            // Eğer uçak virajdaysa YAY İNTEGRALİ (CTRV - Sabit Dönüş Hızı ve Hız Modeli)
            else {
                const theta0 = this.trackAngle;
                const theta1 = theta0 + (this.trackTurnRate * dtSincePacket);
                const R = this.speed / this.trackTurnRate; // Dönüş Yarıçapı (V / w)

                // Vx=Sin integrali -Cos. Vy=Cos integrali Sin.
                moveEnu.x = R * (Math.cos(theta0) - Math.cos(theta1)); // East
                moveEnu.y = R * (Math.sin(theta1) - Math.sin(theta0)); // North
            }

            // DİKEY TAHMİN
            // Uçak paketler arasında vz hızıyla yükseliyor veya alçalıyor
            moveEnu.z = this.vz * dtSincePacket;

            // ENU → ECEF dönüşüm matrisi
            // moveEnu = (100m doğu, 50m kuzey, 10m yukarı)  →  ECEF = (dx, dy, dz)
            Cesium.Transforms.eastNorthUpToFixedFrame(this.lastRealPos, Cesium.Ellipsoid.WGS84, MovementEngine._sEnuMatrix);
            Cesium.Matrix4.multiplyByPointAsVector(MovementEngine._sEnuMatrix, moveEnu, MovementEngine._sMoveEcef);
            Cesium.Cartesian3.add(targetPos, MovementEngine._sMoveEcef, targetPos);
        }

        // 2. HATA VEKTÖRÜNÜ ERİT (ERROR BLENDING)
        // Son paketten bu yana ne kadar zaman geçtiğini kendi yerel saatimizle ölçüyoruz.
        const timeSinceLastUpdate = (Date.now() - this.lastPacketLocalTime) / 1000.0;
        
        // Ağın ritmine göre sönümleme katsayısı (Ortalama sürede hatanın %95'i erir)
        // GÜVENLİK : Ağ 50ms atsa bile amortisör hatayı en az 0.5 saniyede eritsin ki uçak zıplamasın!
        const safeBlendDuration = Math.max(this.avgPacketDt, 0.2); // 0.5
        const decayRate = 3.0 / safeBlendDuration; // Sönümleme Oranı 
        const decayFactor = Math.exp(-decayRate * timeSinceLastUpdate);

        // 3. Görsel Konum = Kusursuz Konum + Eriyen Hata
        const currentError = Cesium.Cartesian3.multiplyByScalar(this.posError, decayFactor, MovementEngine._sMoveEcef);
        Cesium.Cartesian3.add(targetPos, currentError, this.currentVisualPos);

        return Cesium.Cartesian3.clone(this.currentVisualPos, result);
    }
    
    // HEADING + ROLL + PITCH EKSTRAPOLASYONU
    public getLatestOrientation(result: Cesium.Quaternion): Cesium.Quaternion {

        const localNow = Date.now();
        const estimatedServerNow = localNow - this.serverClientOffset;
        let dtSincePacket = (estimatedServerNow - this.lastServerTime) / 1000;
        if (dtSincePacket < 0) dtSincePacket = 0;

        if (dtSincePacket > this.PREDICTION_MAX_SEC) dtSincePacket = this.PREDICTION_MAX_SEC;

        // Heading'i turnRate ile tahmin et (pozisyon için trackAngle, görsel için heading)
        const predictedHeading = this.lastHeading + (this.turnRate * dtSincePacket) + this.orientationOffset;
        const predictedPitch = this.lastPitch + (this.pitchRate * dtSincePacket);
        const predictedRoll = this.lastRoll + (this.rollRate * dtSincePacket);

        MovementEngine._sHpr.heading = predictedHeading;
        MovementEngine._sHpr.pitch = predictedPitch;
        MovementEngine._sHpr.roll = predictedRoll;

        // Modelin ekrandaki konumunda ENU çerçevesinden quaternion hesapla
        const predictedQuat = Cesium.Transforms.headingPitchRollQuaternion(
            this.currentVisualPos, MovementEngine._sHpr,
            Cesium.Ellipsoid.WGS84, Cesium.Transforms.eastNorthUpToFixedFrame,
            MovementEngine._sNewQuat
        );

        // HATA VEKTÖRÜNÜ ERİT (ERROR BLENDING)
        const timeSinceLastUpdate = (Date.now() - this.lastPacketLocalTime) / 1000.0;
        // GÜVENLİK (Aynı şekilde buraya da ekliyoruz) //0.5 yapabilirsin 
        const safeBlendDuration = Math.max(this.avgPacketDt, 0.2);
        const decayRate = 3.0 / safeBlendDuration;
        const decayFactor = Math.exp(-decayRate * timeSinceLastUpdate);

        // Açı hatasını sıfıra (IDENTITY) doğru küçült
        // slerp : İki yön arasındaki en kısa yolu izleyen küresel yumuşatma fonksiyonudur.
        const decayedOriError = Cesium.Quaternion.slerp(Cesium.Quaternion.IDENTITY, this.oriError, decayFactor, MovementEngine._sDecayedOriError);
        
        // Görsel Yönelim = Eriyen Hata * Kusursuz Yönelim
        Cesium.Quaternion.multiply(decayedOriError, predictedQuat, this.currentVisualQuat);

        return Cesium.Quaternion.clone(this.currentVisualQuat, result);
    }


    private isValidPacket(lon: number, lat: number, alt: number, speed: number, h: number, p: number, r: number, serverTimestamp: number): boolean {
        // 1. Zaman Kontrolü (Gecikmiş veya mükerrer veri tespiti)
        if (this.lastServerTime > 0 && serverTimestamp <= this.lastServerTime) {
            console.warn(`[MovementEngine] Eski/Mükerrer Paket: ${serverTimestamp} <= ${this.lastServerTime}`);
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
     * this.currentVisualPos ve this.currentVisualQuat'ı günceller.
     * Yumuşatma (smoothing) ve tahmini (prediction) devre dışı bırakır.
     */
    private forceSync(lon: number, lat: number, alt: number, speed: number, h: number, p: number, r: number) {
        // 1. Sadece GÖRSEL durumu anında eşitle (Işınlanma efekti için)
        const posEcef = Cesium.Cartesian3.fromDegrees(lon, lat, alt, Cesium.Ellipsoid.WGS84, MovementEngine._sNewPos);
        
        // 2. Referans konumu güncelle (lastRealPos)
        Cesium.Cartesian3.clone(posEcef, this.lastRealPos);
        // Görsel konumu da anında eşitle
        Cesium.Cartesian3.clone(posEcef, this.currentVisualPos);
        
        const quat = this.calculateQuaternion(posEcef, h, p, r);
        Cesium.Quaternion.clone(quat, this.currentVisualQuat);

        // 2. TAHMİN MOTORUNU SIFIRLA
        // packetCount'u 0 yapmak, getLatestPosition içindeki 'if (packetCount >= 2)' 
        // kontrolü sayesinde yeni paketler gelene kadar hatalı tahmin yapılmasını engeller.
        this.packetCount = 0;

        ////
        this.turnRate = 0;
        this.trackTurnRate = 0;
        this.pitchRate = 0;
        this.rollRate = 0;
        this.vz = 0;
        this.speed = speed;
        this.lastAlt = alt;
        this.lastHeading = h;
        this.lastPitch = p;
        this.lastRoll = r;
        ////

        // Işınlanmada hataları sıfırla ki yumuşatmaya kalkmasın
        Cesium.Cartesian3.ZERO.clone(this.posError);
        Cesium.Quaternion.IDENTITY.clone(this.oriError);
        
        console.log(`[MovementEngine] Işınlanma (ForceSync) tamamlandı: ${lon.toFixed(5)}, ${lat.toFixed(5)}`);
    }

    /**
    * Belirli bir konum ve HPR açısı için Cesium Quaternion üretir.
    * Scratchpad kullanarak bellek yönetimini optimize eder.
    */
    private calculateQuaternion(position: Cesium.Cartesian3, h: number, p: number, r: number): Cesium.Quaternion {
        const hpr = MovementEngine._sHpr;
        hpr.heading = h + this.orientationOffset;
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
    public getDebugInfo(): { timeSincePacket: number; speed: number; packetCount: number; status: string } {
        const localNow = Date.now();
        const estimatedServerNow = localNow - this.serverClientOffset;
        const timeSincePacket = this.lastServerTime > 0 ? (estimatedServerNow - this.lastServerTime) / 1000 : 0;

        let status = "BEKLENIYOR";
        if (this.lastServerTime === 0) {
            status = "ILK_PAKET";
        } else if (timeSincePacket > this.PREDICTION_MAX_SEC) {
            status = "TIMEOUT";
        } else if (timeSincePacket > 3.0) {
            status = "UZUN_BOSLUK";
        } else {
            status = "VERI_ALINIYOR";
        }

        return {
            timeSincePacket: Math.max(0, timeSincePacket),
            speed: this.speed,
            packetCount: this.packetCount,
            status
        };
    }

    // uçak ve ham kayıt izi için 
    public isTimeout(): boolean {
        const localNow = Date.now();
        const estimatedServerNow = localNow - this.serverClientOffset;
        const timeSincePacket = this.lastServerTime > 0 ? (estimatedServerNow - this.lastServerTime) / 1000 : 0;
        return timeSincePacket > this.PREDICTION_MAX_SEC;
    }
}