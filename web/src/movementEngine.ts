import * as Cesium from "cesium";

/**
 * Hibrit Hareket Motoru (v2)
 * mvmntgmn0203 mimarisi (Quaternion Slerp, exponential smoothing, scratchpad, server time sync)
 * + movementEngine'den heading+turnRate ile eğrisel pozisyon tahmini
 */

export interface ValidationConfig {
    maxPhysicalSpeed?: number;         // m/s (Örn: 500)
    minAltitude?: number;              // m
    maxAltitude?: number;              // m
    maxJumpDistancePerSecond?: number; // m/s (Anlık sıçrama sınırı)
}

export class MovementEngine {
    // --- STATE DATA (Sunucudan Gelen Kesin Veriler) ---
    private lastRealPos = new Cesium.Cartesian3();
    private targetQuat = new Cesium.Quaternion();   // Gidilmesi gereken kesin yönelim
    public rotationOffset: number = 0; // Model yön düzeltmesi (radyan) — bazı modeller yanlış yöne bakar
    private config: Required<ValidationConfig>;

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
    private vz: number = 0;      // Hesaplanan dikey hız (m/s)
    
    // --- VISUAL STATE (Ekranda Görünen Yumuşatılmış Veriler) ---
    private currentVisualPos = new Cesium.Cartesian3();
    private currentVisualQuat = new Cesium.Quaternion();

    // --- ZAMAN SENKRONİZASYONU ---
    private lastServerTime: number = 0; 
    private serverClientOffset: number = 0; 
    private lastFrameTime: number = Date.now(); 
    private currentFrameDt: number = 0; // Her karede bir önceki kareye göre geçen süre (saniye cinsinden):


    // --- AYARLAR ---
    private readonly POS_SMOOTH_SPEED = 2.5; // Konum süzülme hızı (düşük = yumuşak, gecikme artar)
    private readonly ORI_SMOOTH_SPEED = 4.0; // Yönelim süzülme hızı
    
    private orientationOffset: number = 0; // Radyan cinsinden görsel sapma (örn: 180 derece için Math.PI)
    private readonly PREDICTION_MAX_SEC = 5.0;
    private readonly MAX_CORRECTION_PER_SEC = 100; // DIS Convergence: max düzeltme hızı (m/s)
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

    // ışınlanma (jump) kontrolü için
    private outlierCount = 0;
    private readonly MAX_OUTLIERS = 3; // Kaç paket üst üste hatalı gelirse "teslim edilecek" paket sayısını belirler , üstüne düşünülmesi lazım

    constructor(initialLon: number, initialLat: number, initialHeight: number, initialH: number = 0, initialP: number = 0, initialR: number = 0, config?: ValidationConfig) {
        // Doğrulama ayarlarını hazırla
        this.config = {
            maxPhysicalSpeed: config?.maxPhysicalSpeed ?? 600,
            minAltitude: config?.minAltitude ?? -100,
            maxAltitude: config?.maxAltitude ?? 25000,
            maxJumpDistancePerSecond: config?.maxJumpDistancePerSecond ?? 1000
        };

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
        this.heading = initialH;
        this.trackAngle = initialH;
        this.lastTrackAngle = initialH;
        this.lastFrameTime = Date.now();
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
        if (!this.isValidPacket(lon, lat, alt, speed,h,p,r, serverTimestamp)) {
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
        
        // 1. Yeni Konum ve Yönelimi Dünya (ECEF) formatında hazırla
        this.packetCount++;
        const newPos = Cesium.Cartesian3.fromDegrees(lon, lat, alt, Cesium.Ellipsoid.WGS84, MovementEngine._sNewPos);
        
        MovementEngine._sHpr.heading = h + this.rotationOffset;
        MovementEngine._sHpr.pitch = p;
        MovementEngine._sHpr.roll = r;
        const newQuat = Cesium.Transforms.headingPitchRollQuaternion(newPos, MovementEngine._sHpr, Cesium.Ellipsoid.WGS84, Cesium.Transforms.eastNorthUpToFixedFrame, MovementEngine._sNewQuat);

        // 2. Heading + TurnRate + Speed hesapla
        // ÖNCEKİ sunucu zamanını kullanarak gerçek paket aralığını hesapla
        const dtPacket = (serverTimestamp - previousServerTime) / 1000;
        if (dtPacket > 0.01 && previousServerTime > 0) {
                       
            // İki paket arasındaki yer değiştirme vektörü (ECEF)
            const diff = Cesium.Cartesian3.subtract(newPos, this.lastRealPos, MovementEngine._sTrackDiff);          
            // Bu vektörü ENU (Local) düzlemine çevirelim ki açıyı bulalım
            Cesium.Transforms.eastNorthUpToFixedFrame(this.lastRealPos, Cesium.Ellipsoid.WGS84, MovementEngine._sEnuMatrix);
            const invEnu = Cesium.Matrix4.inverse(MovementEngine._sEnuMatrix, MovementEngine._sInvEnuMatrix);
            const localDiff = Cesium.Matrix4.multiplyByPointAsVector(invEnu, diff, MovementEngine._sTrackEnu);

            // Eğer hareket çok küçük değilse gerçek rotayı (track) hesapla
            if (Cesium.Cartesian3.magnitude(localDiff) > 0.1) {
                this.trackAngle = Math.atan2(localDiff.x, localDiff.y); // Doğuya ne kadar gittim? = X, Kuzeye ne kadar gittim? = Y
                
                // Track bazlı dönüş hızı (Manevra tahmini için)
                let deltaT = this.trackAngle - this.lastTrackAngle;
                if (deltaT > Math.PI) deltaT -= Math.PI * 2;
                if (deltaT < -Math.PI) deltaT += Math.PI * 2;
                this.trackTurnRate = deltaT / dtPacket;
            }            
                   
            // turnRate hesabı - Belki yönelim için kullanılır ?? 
            let deltaH = h - this.lastHeading;
            if (deltaH > Math.PI) deltaH -= Math.PI * 2;
            if (deltaH < -Math.PI) deltaH += Math.PI * 2;
            this.turnRate = deltaH / dtPacket;

            // İrtifa farkını geçen süreye bölüyoruz
            this.vz = (alt - this.lastAlt) / dtPacket;
            // Gereksiz titremeyi (jitter) önlemek için dikey hızı biraz sönümleyebilirsin (opsiyonel)
            // this.vz = this.vz * 0.8 + (newVz * 0.2);
        }
        this.lastTrackAngle = this.trackAngle;
        this.lastAlt = alt;
        this.lastHeading = h;
        this.heading = h;
        this.speed = speed; // Yatay hız doğrudan sunucudan geliyor

        // Serbest uçuş verileri doğrudan hedefe yaz
        Cesium.Cartesian3.clone(newPos, this.lastRealPos);
        Cesium.Quaternion.clone(newQuat, this.targetQuat);
    }

    public setOrientationOffset(offsetRad: number): void {
        this.orientationOffset = offsetRad;
    }

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
    }

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

    /**
     * Veri doğrulama bekçisi.
     * Gelen paketin fiziksel kurallara uyup uymadığını denetler, 
     * sıçrama durumunda outlier (aykırı değer) mantığını işletir.
     */
    private isValidPacket(lon: number, lat: number, alt: number, speed: number, h: number, p: number, r: number, serverTimestamp: number): boolean {
        // 1. Zaman Kontrolü (Gecikmiş veya mükerrer veri tespiti)
        if (serverTimestamp <= this.lastServerTime) return false;

        // 2. Sayısal Güvenlik (NaN/Sonsuz veri tespiti)
        if (![lon, lat, alt, speed, h, p, r].every(Number.isFinite)) return false;

        // 3. Sabit Coğrafi Sınırlar (WGS84)
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;

        // 4. Yapılandırılmış Fiziksel Limitler (Config üzerinden)
        if (alt < this.config.minAltitude || alt > this.config.maxAltitude) return false; // İrtifa Kontrolü
        if (speed > this.config.maxPhysicalSpeed) return false; // Hız Kontrolü ????

        // 5. Işınlanma (Jump) Kontrolü ???
        const dtPacket = (serverTimestamp - this.lastServerTime) / 1000;

        // Sadece makul zaman aralıklarında (örn. 10ms'den büyük) bu kontrolü yap
        // Çok küçük dt değerlerinde (division by zero risk veya jitter) kontrolü atlamak daha iyidir.
        if (dtPacket > 0.01 && this.lastServerTime > 0) {
            const newPos = Cesium.Cartesian3.fromDegrees(lon, lat, alt, Cesium.Ellipsoid.WGS84, MovementEngine._sNewPos);
            const jumpDist = Cesium.Cartesian3.distance(this.lastRealPos, newPos);
            const calculatedSpeed = jumpDist / dtPacket;

            // Belirlediğin hız limitinden (maxJumpDistancePerSecond) büyükse
            if (calculatedSpeed > this.config.maxJumpDistancePerSecond) {
                this.outlierCount++;
                
                console.warn(`[MovementEngine] Sıçrama Engellendi! Hız: ${calculatedSpeed.toFixed(1)} m/s, Sayaç: ${this.outlierCount}/3`);

                // Eğer üst üste 3 paket hatalı geldiyse (MAX_OUTLIERS)
                if (this.outlierCount >= this.MAX_OUTLIERS) {
                    console.log("[MovementEngine] Sürekli aykırı değer: Yeni konuma zorunlu senkronizasyon (forceSync) yapılıyor.");
                    this.forceSync(lon, lat, alt, h, p, r); 
                    return true; // Paket artık "geçerli" (zorunlu kabul edildi)
                } 
                
                // Henüz 3 pakete ulaşmadıysak bu paketi çöpe at
                return false; 
            }
        }

        // Eğer paket normalse (sıçrama yoksa) sayacı sıfırla
        this.outlierCount = 0;

        return true;
    }
    

    /**
     * Uçağı anında yeni bir konuma ve yöne ışınlar.
     * Yumuşatma (smoothing) ve tahmini (prediction) devre dışı bırakır.
     */
    private forceSync(lon: number, lat: number, alt: number, h: number, p: number, r: number) {
        // 1. Kesin konumu güncelle (lastRealPos doğrudan güncellenir)
        Cesium.Cartesian3.fromDegrees(lon, lat, alt, Cesium.Ellipsoid.WGS84, this.lastRealPos);

        // 2. Kesin yönelimi (Quaternion) hesapla ve targetQuat'a yaz
        const newQuat = this.calculateQuaternion(this.lastRealPos, h, p, r);
        Cesium.Quaternion.clone(newQuat, this.targetQuat);

        // 3. GÖRSEL DURUMU ANINDA EŞİTLE
        // Bu iki satır uçağın "kayarak" değil, "şak" diye ışınlanmasını sağlar
        Cesium.Cartesian3.clone(this.lastRealPos, this.currentVisualPos);
        Cesium.Quaternion.clone(this.targetQuat, this.currentVisualQuat);

        // 4. TAHMİN MOTORUNU SIFIRLA
        // packetCount'u 0 yapmak, getLatestPosition içindeki 'if (packetCount >= 2)' 
        // kontrolü sayesinde yeni paketler gelene kadar hatalı tahmin yapılmasını engeller.
        this.packetCount = 0;
        this.outlierCount = 0;

        console.log(`[MovementEngine] Işınlanma tamamlandı: ${lon.toFixed(5)}, ${lat.toFixed(5)}`);
    }

    /**
     * Belirli bir konum ve HPR açısı için Cesium Quaternion üretir.
     * Scratchpad kullanarak bellek yönetimini optimize eder.
     */
    private calculateQuaternion(position: Cesium.Cartesian3, h: number, p: number, r: number): Cesium.Quaternion {
        const hpr = MovementEngine._sHpr;
        hpr.heading = h + this.rotationOffset;
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

}