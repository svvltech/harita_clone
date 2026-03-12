import * as Cesium from "cesium";

/**
 * Hibrit Hareket Motoru (v2)
 * mvmntgmn0203 mimarisi (Quaternion Slerp, exponential smoothing, scratchpad, server time sync)
 * + movementEngine'den heading+turnRate ile eğrisel pozisyon tahmini
 */
export class MovementEngine {
    // --- STATE DATA (Sunucudan Gelen Kesin Veriler) ---
    private lastRealPos = new Cesium.Cartesian3();
    private targetQuat = new Cesium.Quaternion();   // Gidilmesi gereken kesin yönelim

    // --- EĞRİSEL TAHMİN VERİLERİ (heading + turnRate) ---
    private heading: number = 0;     // Son gelen heading (radyan)
    private lastHeading: number = 0; // Bir önceki paketin heading'i (turnRate hesabı için)
    private turnRate: number = 0;    // Dönüş hızı (rad/s) — ardışık heading farkından
    private speed: number = 0;       // Yatay hız büyüklüğü (m/s) — ECEF vektöründen
    private packetCount: number = 0; // Gelen paket sayısı — ilk 2 pakete kadar tahmin yapılmaz

    // --- EKLENEN TAHMİN VERİLERİ ---
    private trackAngle: number = 0;     // Gerçek ilerleme rotası (Fiziksel)
    private lastTrackAngle: number = 0; // Bir önceki rotanın açısı
    private trackTurnRate: number = 0;  // Rota üzerindeki dönüş hızı (rad/s)

    // İniş için veriler
    private lastAlt: number = 0; // Bir önceki paketteki kesin irtifa
    private lastPitch: number = 0; 
    private lastRoll: number = 0;
    private vz: number = 0;      // Hesaplanan dikey hız (m/s)
    
    // --- VISUAL STATE (Ekranda Görünen Yumuşatılmış Veriler) ---
    private currentVisualPos = new Cesium.Cartesian3();
    private currentVisualQuat = new Cesium.Quaternion();

    // --- ZAMAN SENKRONİZASYONU ---
    private lastServerTime: number = 0; 
    private serverClientOffset: number = 0; 
    private lastFrameTime: number = Date.now(); 
    private currentFrameDt: number = 0; // Her karede bir önceki kareye göre geçen süre (saniye cinsinden):

    // YENİ: Ağın Ritmi ve Hata Yönetimi
    private lastPacketLocalTime: number = 0; 
    private avgPacketDt: number = 0.2; // Ağın ortalama paket süresi (Varsayılan 200ms)
    private posError = new Cesium.Cartesian3(); // Hedef ile Görsel arasındaki Konum Hatası
    private oriError = new Cesium.Quaternion(); // Hedef ile Görsel arasındaki Açı Hatası

    // --- AYARLAR ---
    private readonly POS_SMOOTH_SPEED = 2.5; //2.5; //15.0; // Konum süzülme hızı (düşük = yumuşak, gecikme artar)
    private readonly ORI_SMOOTH_SPEED = 4.0; //4.0; //10.0; // Yönelim süzülme hızı
    
    private orientationOffset: number = 0; // Radyan cinsinden görsel sapma (örn: 180 derece için Math.PI)

    // VERİ ZAMAN AŞIMI: 15 saniye boyunca veri gelmezse ekstrapolasyon durur.
    // 15 saniye sonra gelen veri forceSync ile aracı yeni konumdan başlatır.
    // 15 saniye içinde gelen veri normal kabul edilir, süzülerek yetişir.
    private readonly PREDICTION_MAX_SEC = 15.0; // Ekstrapolasyon da 15 saniyeye kadar devam eder
        
    private readonly MAX_ROLL_RAD = Cesium.Math.toRadians(60);   // Maksimum roll: ±60°
    private readonly MAX_PITCH_RAD = Cesium.Math.toRadians(45);  // Maksimum pitch: ±45°
    private readonly GRAVITY = 9.81; // Yerçekimi ivmesi (m/s²)

    // --- PERFORMANS SCRATCHPAD (Sıfır Çöp Üretimi) ---
    private static readonly _sMoveEnu = new Cesium.Cartesian3();
    private static readonly _sMoveEcef = new Cesium.Cartesian3();
    private static readonly _sTargetPos = new Cesium.Cartesian3();
    private static readonly _sEnuMatrix = new Cesium.Matrix4();
    private static readonly _sDiff = new Cesium.Cartesian3(); // DIS correction hesabı için
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
        Cesium.Quaternion.clone(this.currentVisualQuat, this.targetQuat);

        this.lastAlt = initialHeight;
        this.lastHeading = initialH;
        this.lastPitch = initialP;
        this.lastRoll = initialR;
        this.heading = initialH;
        this.trackAngle = initialH;
        this.lastTrackAngle = initialH;
        this.lastFrameTime = Date.now();

        this.lastPacketLocalTime = Date.now();
        Cesium.Cartesian3.ZERO.clone(this.posError);
        Cesium.Quaternion.IDENTITY.clone(this.oriError);
    }

    /**
     * DİKKAT: Bu fonksiyonu Cesium'un `scene.preUpdate` event'inde HER KAREDE BİR KEZ çağır!
     * Böylece Position ve Orientation fonksiyonları aynı zaman dilimini kullanır, titreme olmaz.
     */
    public updateFrameTime() {
        const now = Date.now();
        this.currentFrameDt = (now - this.lastFrameTime) / 1000;
        // Eğer sekme arka planda kalırsa ve 1 saniye geçerse, uçağın ışınlanmasını engellemek için sınırlarız
        if (this.currentFrameDt > 0.1) this.currentFrameDt = 0.1; 
        this.lastFrameTime = now;
    }

    /**
     * Sunucudan yeni paket geldiğinde çalışır.
     * @param speed : Yatay hız (m/s)
     * @param h, p, r : Heading, Pitch, Roll (Radyan cinsinden)
     */
    public onPacketReceived(lon: number, lat: number, alt: number, speed: number, h: number, p: number, r: number, serverTimestamp: number) {
        // Gelen veriyi bekçi metodundan geçir
        if (!this.isValidPacket(lon, lat, alt, speed, h, p, r, serverTimestamp)) {
            return; // Geçersiz paket, işleme devam etme
        }

        const localNow = Date.now();
        const previousServerTime = this.lastServerTime;

        // Saat senkronizasyonu için offset hesapla
        const currentOffset = localNow - serverTimestamp; // lokasyon ve yönelim verilerini alırken gecikme (ms)
        if (this.serverClientOffset === 0) {
            this.serverClientOffset = currentOffset;
        } else {
            this.serverClientOffset = this.serverClientOffset * 0.9 + currentOffset * 0.1;
        }
        this.lastServerTime = serverTimestamp;

        ///////////

        // UZUN BOŞLUK KONTROLÜ (Timeout sonrası ilk paket)
        const dtPacket = (previousServerTime > 0) ? (serverTimestamp - previousServerTime) / 1000 : 0;

        if (dtPacket > this.PREDICTION_MAX_SEC) {
            // 15 saniyeden uzun süre veri gelmemiş → aracı yeni konumdan başlat
            console.log(`[MovementEngine] ${dtPacket.toFixed(1)}s veri boşluğu → ForceSync yapılıyor.`);
            this.forceSync(lon, lat, alt, speed, h, p, r);
            return; // Bu paket işlendi (forceSync ile), normal akışa geçmeye gerek yok
        }

////
        // --- AĞIN RİTMİNİ (TICK RATE) ÖĞREN ---
        if (this.packetCount > 0) {
            const dtLocal = (localNow - this.lastPacketLocalTime) / 1000.0;
            // Aşırı uçları kırparak (50ms - 2sn arası) ağın ortalama hızını buluyoruz
            const clampedDt = Math.max(0.05, Math.min(dtLocal, 2.0));
            this.avgPacketDt = this.avgPacketDt * 0.8 + clampedDt * 0.2;
        }
        this.lastPacketLocalTime = localNow;
////


        // 3 saniyeden uzun süredir gelmiyorsa dönüşleri ve dalışları sıfırla,
        // uçağı sadece ileriye doğru DÜMDÜZ uçur"
        if (dtPacket > 3.0 && previousServerTime > 0) {
            console.log(`[MovementEngine] ${dtPacket.toFixed(1)}s boşluk → Tahmin verileri sıfırlanıyor.`);
            this.turnRate = 0;
            this.trackTurnRate = 0;
            this.vz = 0;
            // packetCount'u 1 yaparak sonraki pakette normal hesaplama başlamasını sağla
            this.packetCount = 1;
        }
        
        ///////////

        // 1. Yeni Konum ve Yönelimi Dünya (ECEF) formatında hazırla
        this.packetCount++;
        const newPos = Cesium.Cartesian3.fromDegrees(lon, lat, alt, Cesium.Ellipsoid.WGS84, MovementEngine._sNewPos);
        
        MovementEngine._sHpr.heading = h + this.orientationOffset;
        MovementEngine._sHpr.pitch = p;
        MovementEngine._sHpr.roll = r;
        const newQuat = Cesium.Transforms.headingPitchRollQuaternion(newPos, MovementEngine._sHpr, Cesium.Ellipsoid.WGS84, Cesium.Transforms.eastNorthUpToFixedFrame, MovementEngine._sNewQuat);

/////
        // --- YENİ MİMARİ: HATA VEKTÖRÜNÜ YAKALA ---
        // Yeni hedef konumu belirlemeden önce, görsel modelin ne kadar "yanlış" yerde kaldığını buluruz.
        Cesium.Cartesian3.subtract(this.currentVisualPos, newPos, this.posError);
        
        // Açı hatasını bul: oriError = currentVisual * inverse(newQuat)
        const invNewQuat = Cesium.Quaternion.inverse(newQuat, MovementEngine._sInvNewQuat);
        Cesium.Quaternion.multiply(this.currentVisualQuat, invNewQuat, this.oriError);

        // Güvenlik Subabı: Eğer ağda devasa bir lag olduysa ve hata 500 metreyi geçtiyse, 
        // sönümleme yapma, direkt ışınlan (lastik gibi çekilmesini önler).
        if (Cesium.Cartesian3.magnitude(this.posError) > 500.0) {
            Cesium.Cartesian3.ZERO.clone(this.posError);
            Cesium.Quaternion.IDENTITY.clone(this.oriError);
        }
/////



        // 2. Heading + TurnRate + Speed hesapla
        if (dtPacket > 0.01 && previousServerTime > 0) {
                       
            // İki paket arasındaki yer değiştirme vektörü (ECEF)
            const diff = Cesium.Cartesian3.subtract(newPos, this.lastRealPos, MovementEngine._sTrackDiff);          
            // Bu vektörü ENU (Local) düzlemine çevirelim ki açıyı bulalım
            Cesium.Transforms.eastNorthUpToFixedFrame(this.lastRealPos, Cesium.Ellipsoid.WGS84, MovementEngine._sEnuMatrix);
            const invEnu = Cesium.Matrix4.inverse(MovementEngine._sEnuMatrix, MovementEngine._sInvEnuMatrix);
            const localDiff = Cesium.Matrix4.multiplyByPointAsVector(invEnu, diff, MovementEngine._sTrackEnu);

            let rawTrackTurnRate = 0;
            // Eğer hareket çok küçük değilse gerçek rotayı (track) hesapla
            if (Cesium.Cartesian3.magnitude(localDiff) > 0.1) {
                this.trackAngle = Math.atan2(localDiff.x, localDiff.y); // Doğuya ne kadar gittim? = X, Kuzeye ne kadar gittim? = Y
                
                // KRİTİK DÜZELTME: 3. paketten önce dönüş hızı (kavis) HESAPLANAMAZ!
                if (this.packetCount > 2) {
                    // Track bazlı dönüş hızı (Manevra tahmini için)
                    let deltaT = this.trackAngle - this.lastTrackAngle;
                    if (deltaT > Math.PI) deltaT -= Math.PI * 2;
                    if (deltaT < -Math.PI) deltaT += Math.PI * 2;

                    //this.trackTurnRate = deltaT / dtPacket;
                    rawTrackTurnRate = deltaT / dtPacket;
                }
            }            
            
            let rawTurnRate = 0;
            if (this.packetCount > 2) {
                // turnRate hesabı - Belki yönelim için kullanılır ?? 
                let deltaH = h - this.lastHeading;
                if (deltaH > Math.PI) deltaH -= Math.PI * 2;
                if (deltaH < -Math.PI) deltaH += Math.PI * 2;
                //this.turnRate = deltaH / dtPacket;
                rawTurnRate = deltaH / dtPacket;
            }

            // --- LOW-PASS FILTER (Hareketli Ortalama) ---
            // Eğer uçak yeni doğduysa veya uzun süredir veri gelmiyorsa filtreyi sıfırla
            if (this.packetCount <= 3 || dtPacket > 3.0) {
                this.trackTurnRate = rawTrackTurnRate;
                this.turnRate = rawTurnRate;
            } else {
                // Ağdaki anlık kopmalara/patlamalara karşı eski istikrarı %80 koru, yeni hıza %20 güven
                this.trackTurnRate = (this.trackTurnRate * 0.8) + (rawTrackTurnRate * 0.2);
                this.turnRate = (this.turnRate * 0.8) + (rawTurnRate * 0.2);
            }

            // İrtifa farkını geçen süreye bölüyoruz
            this.vz = (alt - this.lastAlt) / dtPacket;
            // Gereksiz titremeyi (jitter) önlemek için dikey hızı biraz sönümleyebilirsin (opsiyonel)
            // this.vz = this.vz * 0.8 + (newVz * 0.2);
        }
        this.lastTrackAngle = this.trackAngle;
        this.lastAlt = alt;
        this.lastHeading = h;
        this.lastPitch = p;
        this.lastRoll = r;
        this.heading = h;
        this.speed = speed; // Yatay hız doğrudan sunucudan geliyor

        // Serbest uçuş verileri doğrudan hedefe yaz
        Cesium.Cartesian3.clone(newPos, this.lastRealPos);
        Cesium.Quaternion.clone(newQuat, this.targetQuat);
    }

    public setOrientationOffset(offsetRad: number): void {
        this.orientationOffset = offsetRad;
    }


    /*
    public getLatestPosition(result: Cesium.Cartesian3): Cesium.Cartesian3 {
        const localNow = Date.now();
        const estimatedServerNow = localNow - this.serverClientOffset;
        let dtSincePacket = (estimatedServerNow - this.lastServerTime) / 1000;
        
        // Emniyet Kemerleri
        if (dtSincePacket < 0) dtSincePacket = 0;
        if (dtSincePacket > this.PREDICTION_MAX_SEC) dtSincePacket = this.PREDICTION_MAX_SEC;

        // HEADING + TRACK ANGLE TAHMİNİ: Basit ama sağlam ekstrapolasyon
        const targetPos = Cesium.Cartesian3.clone(this.lastRealPos, MovementEngine._sTargetPos);

        if (dtSincePacket > 0 && this.speed > 0.01 && this.packetCount >= 2) {
            // const predictedHeading = this.heading + (this.turnRate * dtSincePacket);
            // ARTIK TAHMİNİ HEADING İLE DEĞİL, TRACK ANGLE İLE YAPIYORUZ
            // Bu sayede rüzgar etkisi (drift) otomatik korunur.
            const predictedTrack = this.trackAngle + (this.trackTurnRate * dtSincePacket);

            const moveEnu = MovementEngine._sMoveEnu;
            moveEnu.x = Math.sin(predictedTrack) * this.speed * dtSincePacket; // East
            moveEnu.y = Math.cos(predictedTrack) * this.speed * dtSincePacket; // North
            // moveEnu.z = 0;

            // DİKEY TAHMİN (Yeni eklenen kısım)
            // Uçak paketler arasında vz hızıyla yükseliyor veya alçalıyor
            moveEnu.z = this.vz * dtSincePacket;

            // ENU → ECEF dönüşüm matrisi
            Cesium.Transforms.eastNorthUpToFixedFrame(this.lastRealPos, Cesium.Ellipsoid.WGS84, MovementEngine._sEnuMatrix);
            Cesium.Matrix4.multiplyByPointAsVector(MovementEngine._sEnuMatrix, moveEnu, MovementEngine._sMoveEcef);
            Cesium.Cartesian3.add(targetPos, MovementEngine._sMoveEcef, targetPos);
        }
        // DIS CONVERGENCE CORRIDOR: Yumuşatma + Maksimum düzeltme hızı limiti

        // Hedef pozisyon ile mevcut görsel pozisyon arasındaki farkı hesapla
        const diff = Cesium.Cartesian3.subtract(targetPos, this.currentVisualPos, MovementEngine._sDiff);
        const distance = Cesium.Cartesian3.magnitude(diff);
        
        // Exponential smoothing
        // Aracın hedefe doğru yüzde kaç oranında yaklaşması gerektiği (0.0 ile 1.0 arası bir katsayı) hesaplanıyor.
        let lerpFactor = 1.0 - Math.exp(-this.POS_SMOOTH_SPEED * this.currentFrameDt);
        
        // Bir karede en fazla MAX_CORRECTION_PER_SEC × dt metre hareket edebilir
        const maxMove = this.MAX_CORRECTION_PER_SEC * this.currentFrameDt;

        // Eğer hedefe çok yakınsak, yumuşatma faktörü azalt
        // Eğer hedefe olan uzaklık çok fazlaysa (örn internet 3sn koptu, uçak 1000 m geride kaldı), 
        // Üstel Yumuşatma formülü uçağı çok hızlı çekmek isteyecektir. Bu blok, bu aşırı hızı engeller.
        if (distance * lerpFactor > maxMove && distance > 0) {
            lerpFactor = maxMove / distance;
        }

        Cesium.Cartesian3.lerp(this.currentVisualPos, targetPos, lerpFactor, this.currentVisualPos);

        return Cesium.Cartesian3.clone(this.currentVisualPos, result);
    }*/

    public getLatestPosition(result: Cesium.Cartesian3): Cesium.Cartesian3 {
        const localNow = Date.now();
        const estimatedServerNow = localNow - this.serverClientOffset;
        let dtSincePacket = (estimatedServerNow - this.lastServerTime) / 1000;
        
        // Emniyet Kemerleri
        if (dtSincePacket < 0) dtSincePacket = 0;
        if (dtSincePacket > this.PREDICTION_MAX_SEC) dtSincePacket = this.PREDICTION_MAX_SEC;

        // HEADING + TRACK ANGLE TAHMİNİ: Basit ama sağlam ekstrapolasyon
        const targetPos = Cesium.Cartesian3.clone(this.lastRealPos, MovementEngine._sTargetPos);

        if (dtSincePacket > 0 && this.speed > 0.01 && this.packetCount >= 2) {
            // const predictedHeading = this.heading + (this.turnRate * dtSincePacket);
            // ARTIK TAHMİNİ HEADING İLE DEĞİL, TRACK ANGLE İLE YAPIYORUZ
            // Bu sayede rüzgar etkisi (drift) otomatik korunur.

            const moveEnu = MovementEngine._sMoveEnu;
            
            /////
            // Eğer dönüş hızı çok küçükse (düz uçuş), sıfıra bölme hatasını önlemek için klasik doğrusal (kiriş) formül
            if (Math.abs(this.trackTurnRate) < 0.001) {
                const predictedTrack = this.trackAngle + (this.trackTurnRate * dtSincePacket);
                moveEnu.x = Math.sin(predictedTrack) * this.speed * dtSincePacket; // East
                moveEnu.y = Math.cos(predictedTrack) * this.speed * dtSincePacket; // North
            } 
            // Eğer uçak virajdaysa KUSURSUZ YAY İNTEGRALİ (CTRV - Sabit Dönüş Hızı ve Hız Modeli)
            else {
                const theta0 = this.trackAngle;
                const theta1 = theta0 + (this.trackTurnRate * dtSincePacket);
                const R = this.speed / this.trackTurnRate; // Dönüş Yarıçapı (V / w)

                // Vx=Sin integrali -Cos. Vy=Cos integrali Sin.
                moveEnu.x = R * (Math.cos(theta0) - Math.cos(theta1)); // East
                moveEnu.y = R * (Math.sin(theta1) - Math.sin(theta0)); // North
            }
            /////

            // DİKEY TAHMİN (Yeni eklenen kısım)
            // Uçak paketler arasında vz hızıyla yükseliyor veya alçalıyor
            moveEnu.z = this.vz * dtSincePacket;

            // ENU → ECEF dönüşüm matrisi
            Cesium.Transforms.eastNorthUpToFixedFrame(this.lastRealPos, Cesium.Ellipsoid.WGS84, MovementEngine._sEnuMatrix);
            Cesium.Matrix4.multiplyByPointAsVector(MovementEngine._sEnuMatrix, moveEnu, MovementEngine._sMoveEcef);
            Cesium.Cartesian3.add(targetPos, MovementEngine._sMoveEcef, targetPos);
        }

        /*
        // DIS CONVERGENCE CORRIDOR: Yumuşatma + Maksimum düzeltme hızı limiti

        // Hedef pozisyon ile mevcut görsel pozisyon arasındaki farkı hesapla
        const diff = Cesium.Cartesian3.subtract(targetPos, this.currentVisualPos, MovementEngine._sDiff);
        const distance = Cesium.Cartesian3.magnitude(diff);
        
        // 1. 3D Vektörel Hız (Bileşke Hız)
        // ECEF koordinat sisteminde hareket ettiğimiz için x, y ve z bileşenlerinin 
        // toplam büyüklüğü uçağın uzaydaki gerçek "yürüme" kapasitesidir.
        const vectorSpeed = Math.sqrt(Math.pow(this.speed, 2) + Math.pow(this.vz, 2));
        // 2. Dinamik Düzeltme Kapasitesi (Overdrive)
        // Hatayı kapatmak için uçağa kendi hızının en fazla %50'si kadar "ekstra hız" veriyoruz.
        // Bu, uçağın fiziksel limitlerini saçma sapan zorlamasını engeller.
        const maxOverdrive = vectorSpeed * 0.5; 
        // Hata ne kadar büyükse o kadar hızlı yetişmeye çalış, ama maxOverdrive'ı geçme.
        // Buradaki '0.5' (saniye), hatanın ne kadar sürede sönümleneceğidir ama clamp sayesinde güvenlidir.
        const catchUpSpeed = Math.min(distance / this.profile.catchUpTimeSec, maxOverdrive);
        // 3. Nihai Limit
        // Uçak duruyorsa (hız=0) bile küçük hataları düzeltebilmesi için bir taban (örn: 20m/s) ekliyoruz.
        const dynamicCorrectionLimit = Math.max(this.profile.minCorrectionSpeed, vectorSpeed + catchUpSpeed);

        // Exponential smoothing
        // Aracın hedefe doğru yüzde kaç oranında yaklaşması gerektiği (0.0 ile 1.0 arası bir katsayı) hesaplanıyor.
        let lerpFactor = 1.0 - Math.exp(-this.POS_SMOOTH_SPEED * this.currentFrameDt);
        
        // Bir karede en fazla MAX_CORRECTION_PER_SEC × dt metre hareket edebilir
        // const maxMove = this.MAX_CORRECTION_PER_SEC * this.currentFrameDt;
        const maxMove = dynamicCorrectionLimit * this.currentFrameDt;

        // Eğer hedefe çok yakınsak, yumuşatma faktörü azalt
        // Eğer hedefe olan uzaklık çok fazlaysa (örn internet 3sn koptu, uçak 1000 m geride kaldı), 
        // Üstel Yumuşatma formülü uçağı çok hızlı çekmek isteyecektir. Bu blok, bu aşırı hızı engeller.
        if (distance * lerpFactor > maxMove && distance > 0) {
            lerpFactor = maxMove / distance;
        }

        Cesium.Cartesian3.lerp(this.currentVisualPos, targetPos, lerpFactor, this.currentVisualPos);
        */

        // 2. HATA VEKTÖRÜNÜ ERİT (ERROR BLENDING)
        // Son paketten bu yana ne kadar zaman geçtiğini kendi yerel saatimizle ölçüyoruz.
        const timeSinceLastUpdate = (Date.now() - this.lastPacketLocalTime) / 1000.0;
        
        // Ağın ritmine göre sönümleme katsayısı (Ortalama sürede hatanın %95'i erir)
        const decayRate = 3.0 / this.avgPacketDt;
        const decayFactor = Math.exp(-decayRate * timeSinceLastUpdate);

        // 3. Görsel Konum = Kusursuz Konum + Eriyen Hata
        const currentError = Cesium.Cartesian3.multiplyByScalar(this.posError, decayFactor, MovementEngine._sMoveEcef); // Scratchpad kullandık
        Cesium.Cartesian3.add(targetPos, currentError, this.currentVisualPos);

        return Cesium.Cartesian3.clone(this.currentVisualPos, result);
    }
/*
    public getLatestOrientation(result: Cesium.Quaternion): Cesium.Quaternion {
        // HEADING + ROLL + PITCH EKSTRAPOLASYONU
        const localNow = Date.now();
        const estimatedServerNow = localNow - this.serverClientOffset;
        let dtSincePacket = (estimatedServerNow - this.lastServerTime) / 1000;
        if (dtSincePacket < 0) dtSincePacket = 0;
        if (dtSincePacket > this.PREDICTION_MAX_SEC) dtSincePacket = this.PREDICTION_MAX_SEC;

        // Heading'i turnRate ile tahmin et (pozisyon için trackAngle, görsel için heading)
        // orientationOffset (Pruva-Pupa hatası vb.) burada dahil edilir.
        const predictedHeading = this.heading + (this.turnRate * dtSincePacket) + this.orientationOffset;

        // ROLL ve PITCH: Her zaman fizik-bazlı hesaplama
        // Koordineli viraj: tan(roll) = V × ω / g — uçak dönerken kanat yatırır
        const predictedRoll = Math.atan(this.speed * this.turnRate / this.GRAVITY);
        // Tırmanma/alçalma açısı: pitch = atan2(vz, speed) — burun yönü
        const predictedPitch = (this.speed > 0.5) ? Math.atan2(this.vz, this.speed) : 0;


        
        // EĞER FİZİKSEL VERİ YOKSA (HIZ DÜŞÜK VEYA DURUYORSA), SON PAKET VERİSİNİ KULLAN
        // Bu sayede uçak yerdeyken veya çok yavaşken burnu ve yatışı sıfırlanmaz.
        //if (this.speed < 1.0) {
        //    predictedRoll = this.lastRoll;
        //    predictedPitch = this.lastPitch;
        //} 
         

        // Fiziksel sınır clamping
        // Değer eğer minimumdan (negatif) küçükse, taban sınırının altına inmesini engeller.
        // Fizik formülü ne derse desin, senin kanat yatırma sınırın sağa 60, sola 60 derecedir (MAX_ROLL_RAD). Daha fazla yatamazsın
        const clampedRoll = Math.max(-this.MAX_ROLL_RAD, Math.min(this.MAX_ROLL_RAD, predictedRoll));
        const clampedPitch = Math.max(-this.MAX_PITCH_RAD, Math.min(this.MAX_PITCH_RAD, predictedPitch));

        // Tahmin edilen HPR ile yeni hedef quaternion oluştur
        MovementEngine._sHpr.heading = predictedHeading;
        MovementEngine._sHpr.pitch = clampedPitch;
        MovementEngine._sHpr.roll = clampedRoll;
        
        // Modelin ekrandaki konumunda ENU çerçevesinden quaternion hesapla
        const predictedQuat = Cesium.Transforms.headingPitchRollQuaternion(
            this.currentVisualPos, MovementEngine._sHpr,
            Cesium.Ellipsoid.WGS84, Cesium.Transforms.eastNorthUpToFixedFrame,
            MovementEngine._sNewQuat
        );

        // GÖRSEL AÇI YUMUŞATMA (Slerp): Tahmini hedefe pürüzsüzce döndür
        // Slerp: İki yönelim arasındaki en kısa ve pürüzsüz yay üzerinde dönüş yapar.
        // ORI_SMOOTH_SPEED değerini 3.0 ile 5.0 arasında tutarak İHA'nın 
        // manevra kabiliyetine göre dönüş hızını ayarlayabilirsin.

        const slerpFactor = 1.0 - Math.exp(-this.ORI_SMOOTH_SPEED * this.currentFrameDt);
        // Cesium.Quaternion.slerp(this.currentVisualQuat, this.targetQuat, slerpFactor, this.currentVisualQuat);
        Cesium.Quaternion.slerp(this.currentVisualQuat, predictedQuat, slerpFactor, this.currentVisualQuat);

        return Cesium.Quaternion.clone(this.currentVisualQuat, result);
    }
*/
    public getLatestOrientation(result: Cesium.Quaternion): Cesium.Quaternion {

        const localNow = Date.now();
        const estimatedServerNow = localNow - this.serverClientOffset;
        let dtSincePacket = (estimatedServerNow - this.lastServerTime) / 1000;
        if (dtSincePacket < 0) dtSincePacket = 0;
        if (dtSincePacket > this.PREDICTION_MAX_SEC) dtSincePacket = this.PREDICTION_MAX_SEC;

        const predictedHeading = this.heading + (this.turnRate * dtSincePacket) + this.orientationOffset;

        // ROLL ve PITCH: Her zaman fizik-bazlı hesaplama
        // Koordineli viraj: tan(roll) = V × ω / g — uçak dönerken kanat yatırır
        const predictedRoll = Math.atan(this.speed * this.turnRate / this.GRAVITY);
        // Tırmanma/alçalma açısı: pitch = atan2(vz, speed) — burun yönü
        const predictedPitch = (this.speed > 0.5) ? Math.atan2(this.vz, this.speed) : 0;
        

        const clampedRoll = Math.max(-this.MAX_ROLL_RAD, Math.min(this.MAX_ROLL_RAD, predictedRoll));
        const clampedPitch = Math.max(-this.MAX_PITCH_RAD, Math.min(this.MAX_PITCH_RAD, predictedPitch));

        MovementEngine._sHpr.heading = predictedHeading;
        MovementEngine._sHpr.pitch = clampedPitch;
        MovementEngine._sHpr.roll = clampedRoll;
        
        const predictedQuat = Cesium.Transforms.headingPitchRollQuaternion(
            this.currentVisualPos, MovementEngine._sHpr,
            Cesium.Ellipsoid.WGS84, Cesium.Transforms.eastNorthUpToFixedFrame,
            MovementEngine._sNewQuat
        );

        // HATA VEKTÖRÜNÜ ERİT (ERROR BLENDING)
        const timeSinceLastUpdate = (Date.now() - this.lastPacketLocalTime) / 1000.0;
        const decayRate = 3.0 / this.avgPacketDt;
        const decayFactor = Math.exp(-decayRate * timeSinceLastUpdate);

        // Açı hatasını sıfıra (IDENTITY) doğru küçült
        const decayedOriError = Cesium.Quaternion.slerp(Cesium.Quaternion.IDENTITY, this.oriError, decayFactor, MovementEngine._sDecayedOriError);
        
        // Görsel Yönelim = Eriyen Hata * Kusursuz Yönelim
        Cesium.Quaternion.multiply(decayedOriError, predictedQuat, this.currentVisualQuat);

        return Cesium.Quaternion.clone(this.currentVisualQuat, result);
    }

    /**
     * Veri doğrulama bekçisi.
     * Gelen paketin fiziksel kurallara uyup uymadığını denetler.
     * Zaman aşımı (timeout) mantığı onPacketReceived içinde yönetilir.
     */
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
        Cesium.Quaternion.clone(quat, this.targetQuat);
        Cesium.Quaternion.clone(quat, this.currentVisualQuat);

        // 2. TAHMİN MOTORUNU SIFIRLA
        // packetCount'u 0 yapmak, getLatestPosition içindeki 'if (packetCount >= 2)' 
        // kontrolü sayesinde yeni paketler gelene kadar hatalı tahmin yapılmasını engeller.
        this.packetCount = 0;

        ////
        this.turnRate = 0;
        this.trackTurnRate = 0;
        this.vz = 0;
        this.speed = speed;
        this.lastAlt = alt;
        this.lastHeading = h;
        this.lastPitch = p;
        this.lastRoll = r;
        this.heading = h;
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

}