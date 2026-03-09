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
    public rotationOffset: number = 0; // Model yön düzeltmesi (radyan) — bazı modeller yanlış yöne bakar

    // --- EĞRİSEL TAHMİN VERİLERİ (heading + turnRate) ---
    private heading: number = 0;     // Son gelen heading (radyan)
    private lastHeading: number = 0; // Bir önceki paketin heading'i (turnRate hesabı için)
    private turnRate: number = 0;    // Dönüş hızı (rad/s) — ardışık heading farkından
    private speed: number = 0;       // Yatay hız büyüklüğü (m/s) — ECEF vektöründen

    // --- EKLENEN TAHMİN VERİLERİ ---
    private trackAngle: number = 0;     // Gerçek ilerleme rota açısı (Fiziksel)
    private lastTrackAngle: number = 0; // Bir önceki rotanın açısı
    private trackTurnRate: number = 0;  // Rota üzerindeki dönüş hızı (rad/s)
    private lastVelocityEcef = new Cesium.Cartesian3(); // Önceki paketin hız vektörü (ECEF) — Hermite M0 için

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


    // --- RELATIVE TRACKING (Kenetlenme / Docking) ---
    private parentEngine: MovementEngine | null = null;
    private relativeTargetPos: Cesium.Cartesian3 | null = null;
    private relativeTargetQuat: Cesium.Quaternion | null = null;

    // --- AYARLAR ---
    private readonly POS_SMOOTH_SPEED = 2.5; // Konum süzülme hızı (düşük = yumuşak, gecikme artar)
    private readonly ORI_SMOOTH_SPEED = 4.0; // Yönelim süzülme hızı
    private readonly PREDICTION_MAX_SEC = 5.0;
    private readonly MAX_CORRECTION_PER_SEC = 100; // DIS Convergence: max düzeltme hızı (m/s)

    // --- PERFORMANS SCRATCHPAD (Sıfır Çöp Üretimi) ---
    private static readonly _sMoveEnu = new Cesium.Cartesian3();
    private static readonly _sMoveEcef = new Cesium.Cartesian3();
    private static readonly _sTargetPos = new Cesium.Cartesian3();
    private static readonly _sEnuMatrix = new Cesium.Matrix4();
    private static readonly _sDiff = new Cesium.Cartesian3(); // DIS correction hesabı için
    private static readonly _sHpr = new Cesium.HeadingPitchRoll();
    private static readonly _sNewQuat = new Cesium.Quaternion();
    private static readonly _sParentPos = new Cesium.Cartesian3();
    private static readonly _sParentQuat = new Cesium.Quaternion();
    private static readonly _sParentQuatInv = new Cesium.Quaternion();
    private static readonly _sRotMatrix = new Cesium.Matrix3();
    private static readonly _sTransformMat = new Cesium.Matrix4();
    private static readonly _sWorldToLocal = new Cesium.Matrix4();
    private static readonly _sInvEnuMatrix = new Cesium.Matrix4();
    private static readonly _sTrackDiff = new Cesium.Cartesian3(); // Track hesabı için (onPacketReceived)
    private static readonly _sTrackEnu = new Cesium.Cartesian3();  // Track ENU dönüşümü için
    private static readonly _sNewPos = new Cesium.Cartesian3();    // onPacketReceived için ayrı konum scratchpad

    private static readonly _sV0 = new Cesium.Cartesian3(); // Mevcut görsel hız vektörü
    private static readonly _sV1 = new Cesium.Cartesian3(); // Hedef (tahmin edilen) hız vektörü
    private static readonly _sP0 = new Cesium.Cartesian3();
    private static readonly _sP1 = new Cesium.Cartesian3();

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
        this.heading = initialH;
        this.trackAngle = initialH;
        this.lastTrackAngle = initialH;
        this.lastFrameTime = Date.now();
    }

    public dockTo(parent: MovementEngine | null) {
        this.parentEngine = parent;
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

        // Önceki paketin hız vektörünü Hermite M0 için hesapla ve sakla
        // Mevcut track + speed'den ECEF hız vektörü üret
        if (this.speed > 0.1) {
            const enu = MovementEngine._sTrackEnu;
            enu.x = Math.sin(this.trackAngle) * this.speed;
            enu.y = Math.cos(this.trackAngle) * this.speed;
            enu.z = this.vz;
            // ENU -> ECEF (lastRealPos referanslı — henüz güncellenmedi)
            Cesium.Transforms.eastNorthUpToFixedFrame(this.lastRealPos, Cesium.Ellipsoid.WGS84, MovementEngine._sEnuMatrix);
            Cesium.Matrix4.multiplyByPointAsVector(MovementEngine._sEnuMatrix, enu, this.lastVelocityEcef);
        }

        this.lastTrackAngle = this.trackAngle;
        this.lastAlt = alt;
        this.lastHeading = h;
        this.heading = h;
        this.speed = speed; // Yatay hız doğrudan sunucudan geliyor

        // 3. Kenetlenme (Docking) Durumu Varsa Local'e Çevir
        if (this.parentEngine) {
            const pPos = this.parentEngine.getLatestPosition(MovementEngine._sParentPos);
            const pQuat = this.parentEngine.getLatestOrientation(MovementEngine._sParentQuat);
            
            // Geminin dünyadaki matrisini bul, tersini alıp uçağı içine hapsedeceğiz
            const rotMat = Cesium.Matrix3.fromQuaternion(pQuat, MovementEngine._sRotMatrix);
            const transform = Cesium.Matrix4.fromRotationTranslation(rotMat, pPos, MovementEngine._sTransformMat);
            const worldToLocal = Cesium.Matrix4.inverse(transform, MovementEngine._sWorldToLocal);
            
            // Konumu Local'e kaydet
            if (!this.relativeTargetPos) this.relativeTargetPos = new Cesium.Cartesian3();
            Cesium.Matrix4.multiplyByPoint(worldToLocal, newPos, this.relativeTargetPos);

            // Açıyı Local'e kaydet (Parent_Inverse * Child_Quat)
            if (!this.relativeTargetQuat) this.relativeTargetQuat = new Cesium.Quaternion();
            const pQuatInv = Cesium.Quaternion.inverse(pQuat, MovementEngine._sParentQuatInv);
            Cesium.Quaternion.multiply(pQuatInv, newQuat, this.relativeTargetQuat);
            
        } else {
            // Serbest uçuş ise verileri doğrudan hedefe yaz
            Cesium.Cartesian3.clone(newPos, this.lastRealPos);
            Cesium.Quaternion.clone(newQuat, this.targetQuat);
        }
    }

    public getLatestPosition(result: Cesium.Cartesian3): Cesium.Cartesian3 {
        // Eğer gemiye kenetliysek kendi hızımızla işimiz yok, geminin neresindeysek orayı ver
        if (this.parentEngine && this.relativeTargetPos) {
            const pPos = this.parentEngine.getLatestPosition(MovementEngine._sParentPos);
            const pQuat = this.parentEngine.getLatestOrientation(MovementEngine._sParentQuat);
            const rotMat = Cesium.Matrix3.fromQuaternion(pQuat, MovementEngine._sRotMatrix);
            const transform = Cesium.Matrix4.fromRotationTranslation(rotMat, pPos, MovementEngine._sTransformMat);
            return Cesium.Matrix4.multiplyByPoint(transform, this.relativeTargetPos, result);
        }

        const localNow = Date.now();
        const estimatedServerNow = localNow - this.serverClientOffset;
        let dtSincePacket = (estimatedServerNow - this.lastServerTime) / 1000;
        
        // Emniyet Kemerleri
        if (dtSincePacket < 0) dtSincePacket = 0;
        if (dtSincePacket > this.PREDICTION_MAX_SEC) dtSincePacket = this.PREDICTION_MAX_SEC;

        // Hedef konum (P1) = Son Gerçek Konum + Tahmini Hız * dt olacak
        const p1_Target = Cesium.Cartesian3.clone(this.lastRealPos, MovementEngine._sP1);
        // Hedef hız vektörü (ECEF)
        const v1_Target = MovementEngine._sV1; 

        if (this.speed > 0.1) {
           
            // tahmini rota açısı
            const predTrack = this.trackAngle + (this.trackTurnRate * dtSincePacket);
            const moveEnu = MovementEngine._sMoveEnu;
           
            // Hedef hız vektörü v1_Target
            moveEnu.x = Math.sin(predTrack) * this.speed; // m/s cinsinden hız vektörü
            moveEnu.y = Math.cos(predTrack) * this.speed;
            moveEnu.z = this.vz;

            // ENU -> ECEF dönüşüm matrisi (lastRealPos'a göre)
            Cesium.Transforms.eastNorthUpToFixedFrame(this.lastRealPos, Cesium.Ellipsoid.WGS84, MovementEngine._sEnuMatrix);
            
            // Hedef Hız Vektörünü ECEF'e çevir (V1)
            Cesium.Matrix4.multiplyByPointAsVector(MovementEngine._sEnuMatrix, moveEnu, v1_Target);
            
            // Hedef Konumu Belirle (P1 = LastReal + Velocity * dt)
            const displacement = Cesium.Cartesian3.multiplyByScalar(v1_Target, dtSincePacket, MovementEngine._sMoveEcef);
            Cesium.Cartesian3.add(p1_Target, displacement, p1_Target);
        }
        
        // 4. MESAFE EŞİĞİ (TELEPORT/INITIALIZATION)
        const diff = Cesium.Cartesian3.subtract(p1_Target, this.currentVisualPos, MovementEngine._sDiff);
        const distance = Cesium.Cartesian3.magnitude(diff);

            // Eğer mesafe 200m'den büyükse veya ilk başlangıçsa (distance < 0.001)
        if (distance > 200 || distance < 0.0001) {
            Cesium.Cartesian3.clone(p1_Target, this.currentVisualPos);
            Cesium.Cartesian3.clone(v1_Target, MovementEngine._sV0); // v0'ı v1'e eşitleyerek sarsıntısız başlat
            return Cesium.Cartesian3.clone(this.currentVisualPos, result);
        }

        // 2. HERMITE SPLINE INTERPOLATION (Yumuşatma)
        // ═══════════════════════════════════════════════════════════════
        // Hermite formülünde V0/V1 "tanjant vektör" (parametre uzayında) olmalı,
        // ham dünya hızı (m/s) DEĞİL. Ölçekleme yapılmazsa salınım olur!
        // M = V_world * segmentDuration (parametre uzayına dönüştürme)
        // ═══════════════════════════════════════════════════════════════
        const t = Math.min(this.currentFrameDt * this.POS_SMOOTH_SPEED, 1.0);
        

        // const p0 = this.currentVisualPos; // Başlangıç noktası
        // const v0 = MovementEngine._sV0;   // Mevcut hız (Önceki karedeki hareketimiz)

        // Tanjant ölçekleme: Hız vektörlerini parametre uzayına dönüştür
        // segmentDuration = "P0'dan P1'e tam geçiş süresi" ≈ 1/POS_SMOOTH_SPEED saniye
        const segmentDuration = 1.0 / this.POS_SMOOTH_SPEED;
        // M0: Önceki paketin hızı (nereden geliyorduk) — paket verisinden, feedback yok
        const m0 = Cesium.Cartesian3.multiplyByScalar(this.lastVelocityEcef, segmentDuration, MovementEngine._sV0);
        // M1: Şu anki tahmin hızı (nereye gidiyoruz)
        const m1 = Cesium.Cartesian3.multiplyByScalar(v1_Target, segmentDuration, MovementEngine._sV1);
        
        // Hermite katsayıları
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;  // P0 ağırlığı  (t=0→1, t=1→0)
        const h10 = t3 - 2 * t2 + t;       // M0 ağırlığı  (tanjant etkisi)
        const h01 = -2 * t3 + 3 * t2;      // P1 ağırlığı  (t=0→0, t=1→1)
        const h11 = t3 - t2;               // M1 ağırlığı  (tanjant etkisi)

        /*
        // P(t) = h00*P0 + h10*V0 + h01*P1 + h11*V1
        const term1 = Cesium.Cartesian3.multiplyByScalar(p0, h00, new Cesium.Cartesian3());
        const term2 = Cesium.Cartesian3.multiplyByScalar(v0, h10, new Cesium.Cartesian3());
        const term3 = Cesium.Cartesian3.multiplyByScalar(p1_Target, h01, new Cesium.Cartesian3());
        const term4 = Cesium.Cartesian3.multiplyByScalar(v1_Target, h11, new Cesium.Cartesian3());

        const newPos = Cesium.Cartesian3.add(term1, term2, result);
        Cesium.Cartesian3.add(newPos, term3, newPos);
        Cesium.Cartesian3.add(newPos, term4, newPos);

        // Bir sonraki kare için "mevcut hızı" sakla (V0)
        Cesium.Cartesian3.subtract(newPos, this.currentVisualPos, v0);
        Cesium.Cartesian3.divideByScalar(v0, this.currentFrameDt || 0.01, v0);
        */

        ////
        // P(t) = h00*P0 + h10*M0 + h01*P1 + h11*M1 (scratchpad kullanarak, sıfır GC)
        const newPos = result;
        // term1 = h00 * P0
        Cesium.Cartesian3.multiplyByScalar(this.currentVisualPos, h00, newPos);
        // term2 = h10 * M0 (ölçeklenmiş tanjant)
        Cesium.Cartesian3.multiplyByScalar(m0, h10, MovementEngine._sP0);
        Cesium.Cartesian3.add(newPos, MovementEngine._sP0, newPos);
        // term3 = h01 * P1
        Cesium.Cartesian3.multiplyByScalar(p1_Target, h01, MovementEngine._sP0);
        Cesium.Cartesian3.add(newPos, MovementEngine._sP0, newPos);
        // term4 = h11 * M1 (ölçeklenmiş tanjant)
        Cesium.Cartesian3.multiplyByScalar(m1, h11, MovementEngine._sP0);
        Cesium.Cartesian3.add(newPos, MovementEngine._sP0, newPos);

        // DIS MAX CORRECTION: Hermite bile olsa, bir karede çok fazla sıçramayı engelle
        const moveDiff = Cesium.Cartesian3.subtract(newPos, this.currentVisualPos, MovementEngine._sDiff);
        const moveDist = Cesium.Cartesian3.magnitude(moveDiff);
        const maxMove = this.MAX_CORRECTION_PER_SEC * this.currentFrameDt;
        if (moveDist > maxMove && moveDist > 0) {
            // Hareketi maxMove'a kırp
            Cesium.Cartesian3.multiplyByScalar(moveDiff, maxMove / moveDist, moveDiff);
            Cesium.Cartesian3.add(this.currentVisualPos, moveDiff, newPos);
        }
        ////
        
        Cesium.Cartesian3.clone(newPos, this.currentVisualPos);
        return newPos;
    }

    public getLatestOrientation(result: Cesium.Quaternion): Cesium.Quaternion {
        // Gemiye kenetliysek açımız da gemiye bağlıdır
        if (this.parentEngine && this.relativeTargetQuat) {
            const pQuat = this.parentEngine.getLatestOrientation(MovementEngine._sParentQuat);
            return Cesium.Quaternion.multiply(pQuat, this.relativeTargetQuat, result);
        }

        // Açısal hız yok, bu yüzden doğrudan son gelen açıya süzülüyoruz.
        // ORI_SMOOTH_SPEED değerini 3.0 ile 5.0 arasında tutarak İHA'nın 
        // manevra kabiliyetine göre dönüş hızını ayarlayabilirsin.

        // GÖRSEL AÇI YUMUŞATMA (Slerp - Küresel Dönüş): Ekranda görünen burnu, asıl hedefe pürüzsüzce döndür
        // Slerp: İki yönelim arasındaki en kısa ve pürüzsüz yay üzerinde dönüş yapar.
        const slerpFactor = 1.0 - Math.exp(-this.ORI_SMOOTH_SPEED * this.currentFrameDt);
        Cesium.Quaternion.slerp(this.currentVisualQuat, this.targetQuat, slerpFactor, this.currentVisualQuat);

        return Cesium.Quaternion.clone(this.currentVisualQuat, result);
    }
    
}