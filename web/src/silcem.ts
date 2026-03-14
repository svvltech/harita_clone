/*

// 

        //  --- turnRate, pitchRate, rollRate hesabı ---
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
            if (this.packetCount <= 3 || dtPacket > 3.0) {
                this.trackTurnRate = rawTrackTurnRate;
                this.turnRate = rawTurnRate;
                this.pitchRate = rawPitchRate;
                this.rollRate = rawRollRate;
            } else {
                this.trackTurnRate = (this.trackTurnRate * 0.8) + (rawTrackTurnRate * 0.2);
                this.turnRate = (this.turnRate * 0.8) + (rawTurnRate * 0.2);
                this.pitchRate = (this.pitchRate * 0.8) + (rawPitchRate * 0.2);
                this.rollRate = (this.rollRate * 0.8) + (rawRollRate * 0.2);
            }

*/

/*
// Sunucudan gelen saf verilerle referans hedefi belirle
        MovementEngine._sHpr.heading = h + this.orientationOffset;
        MovementEngine._sHpr.pitch = p;
        MovementEngine._sHpr.roll = r;
        const newQuat = Cesium.Transforms.headingPitchRollQuaternion(newPos, MovementEngine._sHpr, Cesium.Ellipsoid.WGS84, Cesium.Transforms.eastNorthUpToFixedFrame, MovementEngine._sNewQuat);

*/

/*
public getLatestOrientation(result: Cesium.Quaternion): Cesium.Quaternion {

        const localNow = Date.now();
        const estimatedServerNow = localNow - this.serverClientOffset;
        let dtSincePacket = (estimatedServerNow - this.lastServerTime) / 1000;
        if (dtSincePacket < 0) dtSincePacket = 0;
        if (dtSincePacket > this.PREDICTION_MAX_SEC) dtSincePacket = this.PREDICTION_MAX_SEC;

        // 3 EKSEN İÇİN EVRENSEL (GENERIC) EKSTRAPOLASYON
        const predictedHeading = this.heading + (this.turnRate * dtSincePacket) + this.orientationOffset;
        const predictedPitch = this.lastPitch + (this.pitchRate * dtSincePacket);
        const predictedRoll = this.lastRoll + (this.rollRate * dtSincePacket);

        MovementEngine._sHpr.heading = predictedHeading;
        MovementEngine._sHpr.pitch = predictedPitch;
        MovementEngine._sHpr.roll = predictedRoll;
        
        const predictedQuat = Cesium.Transforms.headingPitchRollQuaternion(
            this.currentVisualPos, MovementEngine._sHpr,
            Cesium.Ellipsoid.WGS84, Cesium.Transforms.eastNorthUpToFixedFrame,
            MovementEngine._sNewQuat
        );

        // HATA VEKTÖRÜNÜ ERİT (ERROR BLENDING) - Bu kısım tamamen aynı kalıyor!
        const timeSinceLastUpdate = (Date.now() - this.lastPacketLocalTime) / 1000.0;
        const safeBlendDuration = Math.max(this.avgPacketDt, 0.2);
        const decayRate = 3.0 / safeBlendDuration;
        const decayFactor = Math.exp(-decayRate * timeSinceLastUpdate);

        const decayedOriError = Cesium.Quaternion.slerp(Cesium.Quaternion.IDENTITY, this.oriError, decayFactor, MovementEngine._sDecayedOriError);
        
        Cesium.Quaternion.multiply(decayedOriError, predictedQuat, this.currentVisualQuat);

        return Cesium.Quaternion.clone(this.currentVisualQuat, result);
    }

*/