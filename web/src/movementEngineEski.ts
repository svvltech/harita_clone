import * as Cesium from "cesium";

/**
 * Predict-and-Smooth (Dead Reckoning + Blending) Hareket Motoru
 * 
 * DIS/HLA Standartlarına Uygun Dead Reckoning:
 * - Hız vektörü (vx, vy, vz) ENU koordinatlarında sunucudan alınır.
 * - Yönelim (heading) ayrıca gönderilir (gövde yönü ≠ hareket yönü olabilir).
 * - turnRate, ardışık heading değerlerinden hesaplanır.
 */
export class MovementEngine {
    private lastRealPos: Cesium.Cartesian3 | null = null; // Sunucudan gelen en son gerçek konum (ECEF)(Referans noktamız - tahmin bu noktadan başlar.).
    private currentVisualPos: Cesium.Cartesian3 | null = null; // Ekranda gördüğümüz (yumuşatılmış) konum.
    
    private velocity: Cesium.Cartesian3 = new Cesium.Cartesian3(); // ENU hız vektörü (m/s) - sunucudan gelen x=Doğu, y=Kuzey, z=Yukarı
    private lastPacketTime: number = 0; // Son paketin geldiği zaman (ms). Tahmin süresi buna göre hesaplanır.
    
    // Relative Tracking
    private parentEngine: MovementEngine | null = null;
    private relativeTargetPos: Cesium.Cartesian3 | null = null; // Uçağın gemiye göre sabit olan ofsetini (örneğin gemi merkezinden 5m geri) tutar.
    
    private heading: number = 0; // Radyan (sunucudan derece gelir, radyana çevrilir)
    private pitch: number = 0; // Radyan (burun yukarı-aşağı) Sunucudan gelir.
    private roll: number = 0; // Radyan (kanat yatırma) Sunucudan gelir.
    private visualHeading: number = 0; //// Ekranda gösterilen burun açısı (yumuşatılmış)
    private visualPitch: number = 0; //// Ekranda gösterilen pitch (yumuşatılmış)
    private visualRoll: number = 0; //// Ekranda gösterilen roll (yumuşatılmış)
    private turnRate: number = 0; // Dönüş Hızı (rad/sec)  Heading farkından hesaplanır. Tahmin sırasında kullanılır.
    private lastHeading: number = 0; // Bir önceki paketin heading'i. turnRate hesabı için gerekli.

    // Ayarlar
    public rotationOffset: number = 0;  //Model dosyasının burnu yanlış yöne bakıyorsa düzeltme açısı
    private readonly SMOOTH_FACTOR = 0.1; // Pozisyon yumuşatma katsayısı. Her karede hedefe %10 yaklaş.
    private readonly VISUAL_SMOOTH_FACTOR = 0.1; // Heading/pitch/roll yumuşatma katsayısı. Aynı mantık.
    private readonly PREDICTION_MAX_SEC = 5; // Ağ koparsa uçağın en fazla kaç saniye kendi başına ilerleyeceği
    private static readonly DEG_TO_RAD = Math.PI / 180;

    constructor(initialLon: number, initialLat: number, initialHeight: number) {
        this.currentVisualPos = Cesium.Cartesian3.fromDegrees(initialLon, initialLat, initialHeight);
        this.lastRealPos = Cesium.Cartesian3.clone(this.currentVisualPos);
        this.heading = 0; ////
        this.visualHeading = 0; ////
    }

    public dockTo(parent: MovementEngine | null) {
        this.parentEngine = parent;
    }

    /**
     * Sunucudan gelen her yeni veri paketiyle uçağın/geminin fiziksel durumunu günceller.
     * vx/vy/vz: ENU hız vektörü (m/s), heading/pitch/roll: derece
     */
    public onPacketReceived(lon: number, lat: number, height: number,
        vx: number, vy: number, vz: number, 
        headingDeg: number, pitchDeg: number, rollDeg: number) {
        
        const now = performance.now();
        const newPos = Cesium.Cartesian3.fromDegrees(lon, lat, height);
        const headingRad = headingDeg * MovementEngine.DEG_TO_RAD;

        // Sunucudan gelen ENU hız vektörünü kaydet
        this.velocity.x = vx; // East (m/s)
        this.velocity.y = vy; // North (m/s)
        this.velocity.z = vz; // Up (m/s)

        // Dönüş Hızı (turnRate) hesapla: ardışık heading değerlerinin farkı
        const dt = (now - this.lastPacketTime) / 1000;
        if (dt > 0 && this.lastPacketTime > 0) {
            let deltaHeading = headingRad - this.lastHeading;
            // uçağın "en kısa yoldan" döndüğünü varsayıyoruz
            if (deltaHeading > Math.PI) deltaHeading -= Math.PI * 2; // PI = 180 Derece
            if (deltaHeading < -Math.PI) deltaHeading += Math.PI * 2;
            this.turnRate = deltaHeading / dt;
        }
        this.lastHeading = headingRad;
        this.heading = headingRad;
        this.pitch = pitchDeg * MovementEngine.DEG_TO_RAD;
        this.roll = rollDeg * MovementEngine.DEG_TO_RAD;

        if (this.parentEngine) {
            const parentPos = this.parentEngine.getLatestPosition(new Cesium.Cartesian3());
            const parentOri = this.parentEngine.getLatestOrientation(new Cesium.Quaternion());
            const worldToLocalMat = Cesium.Matrix4.inverse(
                Cesium.Matrix4.fromRotationTranslation(Cesium.Matrix3.fromQuaternion(parentOri), parentPos),
                new Cesium.Matrix4()
            );
            // uçağın geminin merkezine göre kaç metre nerede olduğunu hesaplar
            const newLocalPos = Cesium.Matrix4.multiplyByPoint(worldToLocalMat, newPos, new Cesium.Cartesian3());
            // uçağın geminin merkezine göre yeni konumunu kaydeder
            this.relativeTargetPos = Cesium.Cartesian3.clone(newLocalPos);

            // not: Uçak konumu gemiye göre sabitlendiği için, 
            // uçağın verisi ne kadar gecikirse geciksin, uçak geminin matrisine bağlı kalır.
            // Gemi döndükçe veya hızlandıkça, uçak geminin bir parçasıymış gibi onunla beraber milimetrik olarak taşınır.
        } else {
            this.lastRealPos = Cesium.Cartesian3.clone(newPos);
        }

        this.lastPacketTime = now;
    }

    // Bu metot uçağın dünya üzerindeki 3 boyutlu noktasını belirler.
    // Yerelden Dünya Sistemine (Tahmin ettiğimiz küçük metreyi haritaya yerleştirmek için dev kordinata çeviririz.)
    public getLatestPosition(result: Cesium.Cartesian3): Cesium.Cartesian3 {
        const now = performance.now();
        const timeSincePacket = (now - this.lastPacketTime) / 1000; // (sn) Tahminlerimizi bu süreye göre büyüteceğiz. 

        if (this.parentEngine) {
            const parentPos = this.parentEngine.getLatestPosition(new Cesium.Cartesian3());
            const parentOri = this.parentEngine.getLatestOrientation(new Cesium.Quaternion());
            const transform = Cesium.Matrix4.fromRotationTranslation(Cesium.Matrix3.fromQuaternion(parentOri), parentPos);
            return Cesium.Matrix4.multiplyByPoint(transform, this.relativeTargetPos || new Cesium.Cartesian3(), result);
        }

        if (!this.currentVisualPos || !this.lastRealPos) return result;

        // Tahmin (Prediction / Extrapolation)
        // heading + turnRate ile eğrisel tahmin yapılır (dairesel yörünge takibi)
        const targetPos = Cesium.Cartesian3.clone(this.lastRealPos, new Cesium.Cartesian3());
        const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y); // yatay hız
        
        if (timeSincePacket < this.PREDICTION_MAX_SEC && speed > 0.01) { // Güvenlik: 5 sn'den eski veya çok yavaşsa tahmin yapma
            const predictedHeading = this.heading + (this.turnRate * timeSincePacket);
            
            const moveEnu = new Cesium.Cartesian3(
                Math.sin(predictedHeading) * speed * timeSincePacket, // x = Doğu (East)
                Math.cos(predictedHeading) * speed * timeSincePacket, // y = Kuzey (North)
                this.velocity.z * timeSincePacket // z = Dikey (Up) - vektörden doğrudan
            );

            const enuMat = Cesium.Transforms.eastNorthUpToFixedFrame(this.lastRealPos);
            const moveEcef = Cesium.Matrix4.multiplyByPointAsVector(enuMat, moveEnu, new Cesium.Cartesian3());
            Cesium.Cartesian3.add(targetPos, moveEcef, targetPos);
        }

        // Yumuşatma (Smoothing / Lerp)
        const diff = Cesium.Cartesian3.subtract(targetPos, this.currentVisualPos, new Cesium.Cartesian3());
        // Uçak bir önceki karede neredeyse (currentVisualPos), olması gereken yere (targetPos) doğru mesafenin sadece %10'u kadar süzülür.
        const move = Cesium.Cartesian3.multiplyByScalar(diff, this.SMOOTH_FACTOR, new Cesium.Cartesian3());
        Cesium.Cartesian3.add(this.currentVisualPos, move, this.currentVisualPos);

        return Cesium.Cartesian3.clone(this.currentVisualPos, result);
    }

    public getLatestOrientation(result: Cesium.Quaternion): Cesium.Quaternion {
        ////
        const now = performance.now();
        const timeSincePacket = (now - this.lastPacketTime) / 1000;
        
        // 1. Tahmin: Pozisyon tahminiyle aynı mantıkta gidilecek açıyı bul (Gelecek tahmini)
        const predictedHeading = this.heading + (this.turnRate * timeSincePacket);

        // 2. Görsel Yumuşatma: Heading, Pitch, Roll hepsini süzdür (Snap engelleme)
        let hDiff = predictedHeading - this.visualHeading;
        while (hDiff > Math.PI) hDiff -= Math.PI * 2;
        while (hDiff < -Math.PI) hDiff += Math.PI * 2;
        this.visualHeading += hDiff * this.VISUAL_SMOOTH_FACTOR;

        let pDiff = this.pitch - this.visualPitch;
        this.visualPitch += pDiff * this.VISUAL_SMOOTH_FACTOR;

        let rDiff = this.roll - this.visualRoll;
        this.visualRoll += rDiff * this.VISUAL_SMOOTH_FACTOR;

        const totalHeading = this.visualHeading + this.rotationOffset;
        ////

        if (this.parentEngine) {
            const parentOri = this.parentEngine.getLatestOrientation(new Cesium.Quaternion());
            // Uçağın gemiye göre olan açısını, "Z Ekseni" (yukarı bakan eksen) etrafında bir dönüşe (Quaternion) çevirir.
            const localOri = Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_Z, -totalHeading, new Cesium.Quaternion());
            return Cesium.Quaternion.multiply(parentOri, localOri, result);
        }

        // Heading: Sağ-Sol - Pitch: Aşağı-Yukarı - Roll: Kanat yatırma
        const hpr = new Cesium.HeadingPitchRoll(totalHeading, this.visualPitch, this.visualRoll);
        return Cesium.Transforms.headingPitchRollQuaternion(this.currentVisualPos!, hpr, Cesium.Ellipsoid.WGS84, Cesium.Transforms.eastNorthUpToFixedFrame, result);
    }
}

