using System.IO;
using System.Windows;
using System.Diagnostics;
using CefSharp;
using CefSharp.Wpf;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using CesiumWpfApp.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace CesiumWpfApp
{
    public partial class MainWindow : Window
    {
        private WebApplication? _signalRApp;
        private const int SignalRPort = 5000;
        private static readonly string SignalRUrl = $"http://localhost:{SignalRPort}";

        // ═══════════════════════════════════════════════════════════════
        // SİMÜLASYON AYARLARI — Test senaryosu için bunları değiştir
        // ═══════════════════════════════════════════════════════════════
        
        // Paket gönderim sıklığı (ms) — düşük = sık, yüksek = seyrek
        private int _shipSendMs  = 1000;   // Gemi: 1Hz   (1 saniyede 1 paket)
        private int _deckSendMs  = 200; // 5hz //3000;   // Pist: 0.33Hz (3 saniyede 1 paket)
        private int _planeSendMs = 200; // 5hz //2000;   // Uçak: 0.5Hz  (2 saniyede 1 paket)


        // Hareket test modu (gemi + pist birlikte döner)
        // 0 = Düz çizgi (sadece doğuya)
        // 1 = Geniş daire (sabit dönüş hızı)
        // 2 = S-viraj (periyodik yön değişimi)
        private int _shipMovementMode = 0;

        // Uçak test modu (mevcut switch ile aynı)
        // 0 = Spiral iniş, 1 = Düz çizgi, 2 = Sabit daire
        private int _planeMovementMode = 16;

        // ═══════════════════════════════════════════════════════════════
        // SİMÜLASYON VERİLERİ (başlangıç konumları)
        // ═══════════════════════════════════════════════════════════════
        private System.Timers.Timer? _simTimer;
        private double _simTime = 0;        // Toplam geçen simülasyon süresi (saniye)
        private const double SIM_TICK = 0.05; // 50ms = 20Hz konum güncelleme

        // Gemi/Pist ortak hareket verileri
        private double _shipLon = 26.45;
        private double _shipLat = 40.54;

        private double _shipHeading = -Math.PI / 2; // Başlangıç yönü: Batı (Sol) , Doğuya içim Math.PI / 2
        private double _shipSpeed = 7.0;            // ~14 knot (m/s)
        private double _shipTurnRate = 0;            // Dönüş hızı (rad/s)

        // Pist — geminin aynısı ama bağımsız paket gönderimi
        private double _deckLon = 26.45;
        private double _deckLat = 40.54;

        // Uçak Verileri -Gemiye yakın daha yakına aldık
        private double _planeLon = 26.4485; // 26.445;
        private double _planeLat = 40.5385; // 40.535;
        private double _planeAlt = 300; //500;
        private double _planePitch = 0.0; // YENİ
        private double _planeRoll = 0.0;  // YENİ

        // Timeout test case'leri için: true iken uçak paketi gönderilmez (veri kesintisi simülasyonu)
        private bool _suppressPlanePacket = false;

        // Son gönderim zamanları (ms) — paket gönderim kontrolü için
        private long _lastShipSend = 0;
        private long _lastDeckSend = 0;
        private long _lastPlaneSend = 0;

        // Önceki konum kayıtları (hız/heading hesabı için — paket gönderildiğinde güncellenir)
        private double _prevShipLon, _prevShipLat;
        private double _prevDeckLon, _prevDeckLat;
        private double _prevPlaneLon, _prevPlaneLat, _prevPlaneAlt;

        private void StartMultiEntitySimulation()
        {
            _prevShipLon = _shipLon; _prevShipLat = _shipLat;
            _prevDeckLon = _deckLon; _prevDeckLat = _deckLat;
            _prevPlaneLon = _planeLon; _prevPlaneLat = _planeLat; _prevPlaneAlt = _planeAlt;

            long startMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            _lastShipSend = startMs; _lastDeckSend = startMs; _lastPlaneSend = startMs;

            _simTimer = new System.Timers.Timer(SIM_TICK * 1000); // 50ms
            _simTimer.Elapsed += async (s, e) =>
            {
                _simTime += SIM_TICK;
                if (_signalRApp == null) return;
                var hub = _signalRApp.Services.GetRequiredService<IHubContext<CesiumHub>>();
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                // ─────────────────────────────────────────────
                // A) KONUM GÜNCELLEME (her tick — 20Hz)
                // ─────────────────────────────────────────────

                // Gemi/pist hareket modu
                switch (_shipMovementMode)
                {
                    case 1: // GENİŞ DAİRE — sabit dönüş
                        _shipTurnRate = 0.03; // ~1.7°/s → tam tur ≈ 210 saniye
                        break;

                    case 2: // S-VİRAJ — periyodik yön değişimi
                        _shipTurnRate = 0.05 * Math.Sin(_simTime * 0.3); // 0.3 rad/s periyotla salınım
                        break;

                    default: // DÜZ ÇİZGİ — dönüş yok
                        _shipTurnRate = 0;
                        break;
                }

                // Heading güncelle
                _shipHeading += _shipTurnRate * SIM_TICK;

                // Konum güncelle (heading bazlı — dönerken de doğru yöne gider)
                double dLon = Math.Sin(_shipHeading) * _shipSpeed * SIM_TICK / (111320 * Math.Cos(_shipLat * Math.PI / 180));
                double dLat = Math.Cos(_shipHeading) * _shipSpeed * SIM_TICK / 110540;
                _shipLon += dLon;
                _shipLat += dLat;

                // Pist de aynı hareketi yapar (geminin üzerinde)
                _deckLon += dLon;
                _deckLat += dLat;

                // Uçak konum güncellemesi (her tick'te)
                switch (_planeMovementMode)
                {
                    case 1: // DÜZ ÇİZGİ
                        _planeLon += 0.0003 * SIM_TICK * 20;  //SIM_TICK * 20 = 1sn ,  tick başına ölçekle
                        _planeLat += 0.0001 * SIM_TICK * 20;
                        _planeAlt = 300; //500;
                        break;

                    case 2: // SABİT DAİRE -testte kullandık 0603
                        double fixedRadius = 0.01;
                        double circleAngle = _simTime * 0.1;
                        _planeLon = _shipLon + Math.Cos(circleAngle) * fixedRadius;
                        _planeLat = _shipLat + Math.Sin(circleAngle) * fixedRadius;
                        _planeAlt = 300; // 500;
                        break;

                    case 3: // SPİRAL İNİŞ
                        // iniş kötü bunla baya 
                        /*
                            double angle = _simTime * 0.1;     // ~5.7°/s 
                            double radius = Math.Max(0, 0.015 - (_simTime * 0.000015));
                            _planeLon = _shipLon + Math.Cos(angle) * radius;
                            _planeLat = _shipLat + Math.Sin(angle) * radius;
                            _planeAlt = 500 - (_simTime * 1.4); // ~1.4 m/s alçalma
                            if (_planeAlt < 10) { 
                                _planeAlt = 10; 
                                _planeLon = _shipLon; 
                                _planeLat = _shipLat; 
                            }
                        */

                        // kısmen düzeltilmiş iniş
                        double angle = _simTime * 0.1; // Dönüş açısı devam ediyor
        
                        // 1. Önce irtifayı hesapla ve sınırla
                        _planeAlt = 500 - (_simTime * 1.4);
                        if (_planeAlt < 10) _planeAlt = 10;

                        // 2. Yarıçapı direkt İRTİFAYA kilitle!
                        // Uçak 500m'deyken oran 1.0 (en geniş açı), 10m'deyken oran 0 (sıfır yarıçap) olur.
                        double descentProgress = Math.Max(0, (_planeAlt - 10) / 490.0);
                        double radius = 0.015 * descentProgress;

                        // 3. Konumu hesapla (Geminin üzerinde dönüyor)
                        _planeLon = _shipLon + Math.Cos(angle) * radius;
                        _planeLat = _shipLat + Math.Sin(angle) * radius;
                        break;

                    case 4: // TEST 1: ANİ DUR-KALK (Dash & Stop)
                            // 4 saniye tam gaz (Mach 1.5 civarı), 4 saniye tamamen sabit (havada asılı)
                            double cycle = _simTime % 8.0;
                            if (cycle < 4.0)
                            {
                                _planeLon += 0.001 * SIM_TICK * 20; // Çok yüksek hız
                                _planeLat += 0.001 * SIM_TICK * 20;
                            }
                            // cycle >= 4.0 iken konum değişmiyor (0 hız)
                            _planeAlt = 500;
                            break;


                    case 5: // TEST 2: DİKİNE DALIŞ VE TIRMANIŞ (Vz Testi)
                            // Yatayda çok yavaş gidiyor (neredeyse helikopter gibi)
                            _planeLon += 0.00005 * SIM_TICK * 20; 
                            
                            // İrtifa 1000m ile 8000m arasında bir sinüs dalgası çizerek ÇOK hızlı değişiyor
                            double altCycle = Math.Sin(_simTime); // -1 ile 1 arası
                            _planeAlt = 4500 + (altCycle * 3500); // Dikey hız binlerce m/s'yi bulacak
                            break;

                    case 6: // TEST 3: VERİ SIÇRAMASI (Lag & Catch-up)
                            // Normal hızda düz gidiyor
                            _planeLon += 0.0003 * SIM_TICK * 20;
                            
                            // Her 10 saniyede bir, koordinatlara dışarıdan müdahale et (Ağ kopup geri gelmiş gibi)
                            // Simülasyon saati tam 10, 20, 30. saniyelerden geçerken uçağı aniden ~1 KM ileri fırlat.
                            if (Math.Abs(_simTime % 10.0) < SIM_TICK && _simTime > 1.0)
                            {
                                _planeLon += 0.01; // Sıçrama! (Bu esnada forceSync/outlier mekanizması tetiklenebilir)
                                _planeLat += 0.01;
                            }
                            _planeAlt = 1000;
                            break;

                    case 8: // NİHAİ TEST: SÜREKLİ HIZLANMA (Acceleration Sweep)
                        // Uçak başlangıçta çok yavaş (50 m/s), ama her saniye 20 m/s daha hızlanacak.
                        // Simülasyonun 50. saniyesinde uçak ~1000 m/s (Mach 3) hıza ulaşmış olacak.
                        
                        double currentSpeed = 50.0 + (_simTime * 20.0); 
                        
                        double dLon8 = (currentSpeed * SIM_TICK) / (111320 * Math.Cos(_planeLat * Math.PI / 180));
                        _planeLon += dLon8;
                        
                        // Yüksek hızlarda sapma olup olmadığını görmek için hafifçe kuzeye de kaysın
                        _planeLat += dLon8 * 0.1; 
                        _planeAlt = 2000;
                        break;

                    case 119: // TEST 5: VİRAJDA (DÖNÜŞTE) OUTLIER VE KESİNTİ TESTİ
                        // 1. C# simülasyonunda uçağın hız limiti 600m/s. 
                        // Limite takılmamak için hızı ~200 m/s olan güvenli bir daire çizelim.
                        double radius1 = 0.01; // Yaklaşık 1.1 km
                        double angularSpeed = 0.2; // Saniyede 0.2 radyan
                        double currentAngle = _simTime * angularSpeed;

                        // _shipLon ve _shipLat merkezli dönelim ki uçak haritadan kaybolmasın
                        _planeLon = _shipLon + Math.Cos(currentAngle) * radius1; 
                        _planeLat = _shipLat + Math.Sin(currentAngle) * radius1; 
                        _planeAlt = 1500;

                        // 2. Geçici ve Kalıcı Hata Testleri (Glitch & Lag)
                        // Sadece bu saniye aralıklarında uçak ana rotasından sapar.
                        // Aralık bitince üstteki matematik uçağı otomatik olarak asıl yerine koyar.
                        if (_simTime >= 10.0 && _simTime <= 11.0)
                        {
                            // 1 Saniyelik Geçici Hata (Işınlanma OLMAMALI, uçak virajı dönmeye devam etmeli)
                            _planeLon += 0.01; 
                            _planeLat += 0.01;
                        }
                        else if (_simTime >= 20.0 && _simTime <= 23.0)
                        {
                            //_planeLon += 0.01;  //hız limitini aşamadı
                            //_planeLat += 0.01;

                            // 3 Saniyelik Kalıcı Hata (Süre 1.5 sn'yi aştığı için uçağı IŞINLAMALI)
                            _planeLon -= 0.05; //hız limitini aşabilmek için fazla sapması gerekiyor yaklaşık (7km)7000m / 1.5s = 4666 m/s hız limitini aşar
                            _planeLat -= 0.05;
                        }
                        
                        // BREAK! Aşağıdaki SendAsync ve plSpd / plH hesaplama kodlarına HİÇ DOKUNMUYORSUN.
                        break;

                    case 9: // TEST 5: VİRAJDA GLITCH VE SONRASINDA UZAĞA IŞINLANIP DÜZ UÇMA
                        double radius3 = 0.01;
                        double angularSpeed3 = 0.2;

                        if (_simTime < 20.0)
                        {
                            // 1. AŞAMA: VİRAJDA UÇUŞ (İlk 20 saniye)
                            double currentAngle3 = _simTime * angularSpeed3;
                            _planeLon = _shipLon + Math.Cos(currentAngle3) * radius3;
                            _planeLat = _shipLat + Math.Sin(currentAngle3) * radius3;

                            // 10. ile 11. saniyeler arası GEÇİCİ GLITCH (Sensör Çıldırması)
                            // Beklenti: Uçak bu 1 saniyelik bozuk veriyi reddedip viraj kavisini hayali olarak döner.
                            if (_simTime >= 10.0 && _simTime <= 11.0)
                            {
                                _planeLon += 0.01;
                                _planeLat += 0.01;
                            }
                        }
                        /*
                        else
                        {
                            // 2. AŞAMA: 20. SANİYEDEN SONRA YENİ ROTAYA IŞINLANMA VE DÜZ UÇUŞ
                            // Uçak artık viraj dönmeyi bırakır.

                            // 20. saniyeden sonra geçen zaman sayacı
                            double dtAfter20 = _simTime - 20.0;

                            // Uçağın ışınlanacağı, virajla alakası olmayan bambaşka bir başlangıç noktası (~7km ötede)
                            double teleportLon = _shipLon - 0.05;
                            double teleportLat = _shipLat - 0.05;

                            // Uçak o uzak noktadan itibaren kuzey-doğu yönünde düz bir çizgi halinde uçar
                            _planeLon = teleportLon + (dtAfter20 * 0.00015 * 20); // Düz ilerleme hızı
                            _planeLat = teleportLat + (dtAfter20 * 0.00015 * 20);
                        }
                        */
                        else
                        {
                            // 2. AŞAMA: 20. SANİYEDEN SONRA YENİ ROTAYA IŞINLANMA VE DÜZ UÇUŞ
                            double dtAfter20 = _simTime - 20.0;
                            
                            // 1. Gemiyi unut. Uçağın tam 20. saniyede virajı nerede bitirdiğini (kopma noktasını) bul.
                            double breakAngle = 20.0 * angularSpeed3;
                            double breakLon = _shipLon + Math.Cos(breakAngle) * radius3;
                            double breakLat = _shipLat + Math.Sin(breakAngle) * radius3;
                            
                            // 2. Işınlanma noktasını bu kopma noktasına göre belirle (7 km uzağa fırlat)
                            // (Güneydoğuya ışınlama) : Boylamı (X) artırıyoruz, Enlemi (Y) azaltıyoruz.
                            double teleportLon = breakLon + 0.05;
                            double teleportLat = breakLat - 0.05;
                            
                            // 3. Uçak o yeni noktadan itibaren ok gibi düz ilerler (~418 m/s güvenli hızda)
                            _planeLon = teleportLon + (dtAfter20 * 0.00015 * 20); 
                            _planeLat = teleportLat - (dtAfter20 * 0.00015 * 20);
                        }

                        _planeAlt = 1500;

                        // BREAK! Aşağıdaki SendAsync ve plSpd / plH hesaplama kodlarına HİÇ DOKUNMUYORSUN.
                        break;


                    case 10: // TEST 6: VİRAJDA KOPMA VE DÜZ UÇUŞA GEÇİŞ (Tangent Breakout)
                        double radius2 = 0.01;
                        double angularSpeed1 = 0.2;

                        if (_simTime < 20.0)
                        {
                            // 1. AŞAMA: İLK 20 SANİYE KUSURSUZ VİRAJ
                            double currentAngle1 = _simTime * angularSpeed1;
                            _planeLon = _shipLon + Math.Cos(currentAngle1) * radius2;
                            _planeLat = _shipLat + Math.Sin(currentAngle1) * radius2;
                        }
                        else
                        {
                            // 2. AŞAMA: 20. SANİYEDEN İTİBAREN DÜZ UÇUŞ (Virajdan Çıkış)
                            double breakAngle = 20.0 * angularSpeed1; // Kopma anındaki açı (4.0 radyan)
                            
                            // Uçağın 20. saniyedeki tam konumu (Kopma Noktası)
                            double breakLon = _shipLon + Math.Cos(breakAngle) * radius2;
                            double breakLat = _shipLat + Math.Sin(breakAngle) * radius2;
                            
                            // 20. saniyedeki hızı ve yönü (Dairenin teğet vektörü / Türev)
                            double vLon = -Math.Sin(breakAngle) * radius2 * angularSpeed1;
                            double vLat =  Math.Cos(breakAngle) * radius2 * angularSpeed1;
                            
                            // 20. saniyeden sonra geçen süre
                            double dtStraight = _simTime - 20.0;
                            
                            // Teğet üzerinde düz bir çizgi şeklinde ilerleme
                            _planeLon = breakLon + (vLon * dtStraight);
                            _planeLat = breakLat + (vLat * dtStraight);
                        }
                        _planeAlt = 1500;

                        // 3. RADAR BOZULMASI (20. ile 23. saniye arası sahte veri gönderilir)
                        // Tam pilot düz uçuşa geçtiği anda ekran kararır/bozulur!
                        if (_simTime >= 20.0 && _simTime <= 23.0)
                        {
                            _planeLon -= 0.01; 
                            _planeLat -= 0.01;
                        }
                        break;


                    case 11: // TEST : GERÇEK IŞINLANMA TESTİ (Büyük Sıçrama)
                            // Normal hızda düz gidiyor
                        _planeLon += 0.0003 * SIM_TICK * 20;
                        _planeLat += 0.0001 * SIM_TICK * 20;
                        _planeAlt = 1000;

                        // Her 10 saniyede bir, uçağı aniden 0.05 derece (~5.5 KM) ileri fırlat.
                        // (Önceki 0.01 uçağın hızıyla kapanabiliyordu, 0.05 kapanamaz, kesin ışınlar).
                        if (Math.Abs(_simTime % 10.0) < SIM_TICK && _simTime > 1.0)
                        {
                            _planeLon += 0.05;
                            _planeLat += 0.05;
                        }
                        break;

                    case 12: // TIMEOUT TEST 1: KISA KESİNTİ (5 sn boşluk, timeout OLMAMALI)
                        // Uçak düz gidiyor.
                        _planeLon += 0.0003 * SIM_TICK * 20;
                        _planeLat += 0.0001 * SIM_TICK * 20;
                        _planeAlt = 1000;

                        // 10. ile 15. saniyeler arası: Paket gönderimini kapat (5 saniyelik veri kesintisi).
                        // Beklenti: Ekstrapolasyon devam eder, 15. saniyede veri gelince süzülerek yetişir.
                        // ForceSync OLMAMALI (5 sn < 15 sn timeout).
                        _suppressPlanePacket = (_simTime >= 10.0 && _simTime <= 15.0);
                        break;

                    case 13: // TIMEOUT TEST 2: UZUN KESİNTİ (14 sn boşluk, timeout OLMAMALI)
                        // Uçak düz gidiyor.
                        _planeLon += 0.0003 * SIM_TICK * 20;
                        _planeLat += 0.0001 * SIM_TICK * 20;
                        _planeAlt = 1000;

                        // 10. ile 24. saniyeler arası: 14 saniyelik veri kesintisi.
                        // Beklenti: Ekstrapolasyon 14 sn boyunca devam eder.
                        // 24. saniyede veri gelince turnRate/vz sıfırlanır (3 sn kuralı), süzülerek yetişir.
                        // ForceSync OLMAMALI (14 sn < 15 sn timeout).
                        _suppressPlanePacket = (_simTime >= 10.0 && _simTime <= 24.0);
                        break;

                    case 14: // TIMEOUT TEST 3: ZAMAN AŞIMI (17 sn boşluk, forceSync OLMALI)
                        // Uçak düz gidiyor.
                        _planeLon += 0.0003 * SIM_TICK * 20;
                        _planeLat += 0.0001 * SIM_TICK * 20;
                        _planeAlt = 1000;

                        // 10. ile 27. saniyeler arası: 17 saniyelik veri kesintisi.
                        // Beklenti: Ekstrapolasyon 15. saniyeye kadar devam eder, sonra durur.
                        // 27. saniyede veri gelince dtPacket > 15 → forceSync tetiklenir.
                        // Uçak anında yeni konuma ışınlanır.
                        _suppressPlanePacket = (_simTime >= 10.0 && _simTime <= 27.0);
                        break;
                    // ═══════════════════════════════════════════════════════════════
                    // KISA KESİNTİ TESTLERİ (5 sn boşluk) — Hafif, Gerçekçi Değişimler
                    // ═══════════════════════════════════════════════════════════════

                    case 15: // KISA KESİNTİ 1: DÜZ → 5sn gap → HAFİF VİRAJ BAŞLANGICI
                        // Uçak düz gidiyor, 5 sn kesinti, dönünce hafifçe sola kıvrılmaya başlamış.
                        // Gerçekçi: 5 saniyede bir uçak viraj başlatabilir.
                        // Beklenti: Motor düz ekstrapolasyon yapar, veri gelince hafif farkı süzüp yakalar.
                        {
                            if (_simTime < 10.0)
                            {
                                // Faz 1: Tamamen düz uçuş
                                _planeLon += 0.0003 * SIM_TICK * 20;
                                _planeLat += 0.0001 * SIM_TICK * 20;
                            }
                            else
                            {
                                // Faz 2 (kesinti dahil): Yavaşça sola kıvrılmaya başlıyor
                                // turnRate = 0.05 rad/s → 5 sn'de ~14° dönüş (çok hafif)
                                double dt15 = _simTime - 10.0;
                                double heading15 = 0.32175 + (0.05 * dt15); // Başlangıç heading + yavaş dönüş
                                double spd15 = 200.0; // m/s
                                double dLon15 = Math.Sin(heading15) * spd15 * SIM_TICK / (111320 * Math.Cos(_planeLat * Math.PI / 180));
                                double dLat15 = Math.Cos(heading15) * spd15 * SIM_TICK / 110540;
                                _planeLon += dLon15;
                                _planeLat += dLat15;
                            }
                            _planeAlt = 1000;
                            _suppressPlanePacket = (_simTime >= 10.0 && _simTime <= 15.0);
                        }
                        break;

                    case 166: // KISA KESİNTİ 2: DÖNÜŞ → 5sn gap → AYNI DÖNÜŞE DEVAM
                        // En yaygın senaryo: Uçak virajda, veri kesildi, aynı virajda devam.
                        // Beklenti: Motor dönüş ekstrapolasyonu yapar, veri gelince neredeyse birebir eşleşir.
                        {
                            double r16 = 0.01; // ~1.1 km yarıçap
                            double w16 = 0.2;  // ~200 m/s daire hızı
                            double t16 = _simTime * w16;
                            _planeLon = _shipLon + Math.Cos(t16) * r16;
                            _planeLat = _shipLat + Math.Sin(t16) * r16;
                            _planeAlt = 1000;
                            _suppressPlanePacket = (_simTime >= 10.0 && _simTime <= 15.0);//30.0);
                        }
                        break;

                    case 16: // gemiden bağımsız dönen case16
                        {
                            double centerLon16 = 26.46;
                            double centerLat16 = 40.54;
                            double r16 = 0.01; // ~1.1 km yarıçap
                            double w16 = 0.2;  // ~200 m/s daire hızı
                            double t16 = _simTime * w16;
                            _planeLon = centerLon16 + Math.Cos(t16) * r16;
                            _planeLat = centerLat16 + Math.Sin(t16) * r16;
                            _planeAlt = 1000;
                            _suppressPlanePacket = (_simTime >= 13.0 && _simTime <= 28.0);
                        }
                        break;

                    case 17: // KISA KESİNTİ 3: DÖNÜŞ → 5sn gap → TEĞET ÇIKIŞ (Düzleşme)
                        // Uçak virajda, 5 sn kesinti, sonra virajdan yavaşça çıkıp düzleşiyor.
                        // Gerçekçi: Pilot virajdan çıkar, teğet yönde devam eder.
                        // Beklenti: Motor dönüş tahminine devam eder, veri gelince kavisin düzleştiğini görür.
                        {
                            double r18 = 0.01;
                            double w18 = 0.2;
                            if (_simTime < 15.0)
                            {
                                // DAİRE (0-15 sn, kesinti 10-15 arası)
                                double t18 = _simTime * w18;
                                _planeLon = _shipLon + Math.Cos(t18) * r18;
                                _planeLat = _shipLat + Math.Sin(t18) * r18;
                            }
                            else
                            {
                                // 15. saniyede daireden TEĞET çıkış (düz uçuş)
                                double breakAngle18 = 15.0 * w18;
                                double breakLon18 = _shipLon + Math.Cos(breakAngle18) * r18;
                                double breakLat18 = _shipLat + Math.Sin(breakAngle18) * r18;
                                double vLon18 = -Math.Sin(breakAngle18) * r18 * w18;
                                double vLat18 = Math.Cos(breakAngle18) * r18 * w18;
                                double dt18 = _simTime - 15.0;
                                _planeLon = breakLon18 + vLon18 * dt18;
                                _planeLat = breakLat18 + vLat18 * dt18;
                            }
                            _planeAlt = 1000;
                            _suppressPlanePacket = (_simTime >= 10.0 && _simTime <= 15.0);
                        }
                        break;

                    // ═══════════════════════════════════════════════════════════════
                    // UZUN KESİNTİ TESTLERİ (14-17 sn boşluk) — Dramatik, Ama Gerçekçi
                    // 14 sn = timeout yok, 17 sn = forceSync
                    // ═══════════════════════════════════════════════════════════════

                    case 18: // UZUN KESİNTİ 1: DÜZ → 14sn gap → DÖNÜŞ
                        // Uçak düz gidiyordu, 14 sn veri kesildi, veri geldiğinde artık daire çiziyor.
                        // 14 sn'de rota değişimi tamamen makul (pilot emri, waypoint vs.)
                        // Beklenti: Motor 14 sn boyunca düz ekstrapolasyon yapar (epey uzaklaşır).
                        //           Veri gelince büyük fark var ama forceSync YOK (14<15).
                        //           Süzülerek yeni rotaya adapte olur.
                        {
                            if (_simTime < 10.0)
                            {
                                // Faz 1: Düz uçuş
                                _planeLon += 0.0003 * SIM_TICK * 20;
                                _planeLat += 0.0001 * SIM_TICK * 20;
                            }
                            else
                            {
                                // Faz 2: 10. saniyeden itibaren daire çiziyor (ama paket 24. sn'ye kadar yok)
                                double r17 = 0.008;
                                double w17 = 0.15; // Yavaş dönüş (~150 m/s)
                                double center17Lon = _shipLon + 0.025; // Son düz konuma yakın bir merkez
                                double center17Lat = _shipLat + 0.005;
                                double t17 = (_simTime - 10.0) * w17;
                                _planeLon = center17Lon + Math.Cos(t17) * r17;
                                _planeLat = center17Lat + Math.Sin(t17) * r17;
                            }
                            _planeAlt = 1000;
                            // 14 saniyelik kesinti (10-24 arası)
                            _suppressPlanePacket = (_simTime >= 10.0 && _simTime <= 24.0);
                        }
                        break;

                    case 19: // UZUN KESİNTİ 2: DÖNÜŞ → 17sn gap → TERS DÖNÜŞ (ForceSync!)
                        // Uçak saat yönünde dönerken 17 sn veri kesildi.
                        // Veri geldiğinde artık saat yönü tersine dönüyor.
                        // 17 sn'de yön değişimi tamamen makul.
                        // Beklenti: 15 sn'ye kadar ekstrapolasyon(saat yönü), sonra durur.
                        //           27. sn'de veri gelince dtPacket > 15 → ForceSync tetiklenir.
                        //           Uçak anında yeni konuma ışınlanır.
                        {
                            double r20 = 0.01;
                            double w20 = 0.2;
                            if (_simTime < 10.0)
                            {
                                // Saat yönünde daire
                                double t20 = _simTime * w20;
                                _planeLon = _shipLon + Math.Cos(t20) * r20;
                                _planeLat = _shipLat + Math.Sin(t20) * r20;
                            }
                            else
                            {
                                // 10. saniyeden itibaren ters yöne dönüş
                                double startAngle20 = 10.0 * w20; // Kopma açısı (2.0 rad)
                                double dt20 = _simTime - 10.0;
                                double t20 = startAngle20 - (dt20 * w20); // Ters yön
                                _planeLon = _shipLon + Math.Cos(t20) * r20;
                                _planeLat = _shipLat + Math.Sin(t20) * r20;
                            }
                            _planeAlt = 1000;
                            // 17 saniyelik kesinti → forceSync testi
                            _suppressPlanePacket = (_simTime >= 10.0 && _simTime <= 27.0);
                        }
                        break;

                    case 20: // UZUN KESİNTİ 3: TIRMANMA → 14sn gap → DALIŞ
                        // Uçak tırmanıyordu (10 m/s dikey), 14 sn veri kesildi.
                        // Veri geldiğinde artık dalış yapıyor (-15 m/s dikey).
                        // 14 sn'de irtifa manevra değişimi tamamen makul.
                        // Beklenti: Motor tırmanma ekstrapolasyonu yapar, veri gelince irtifayı süzüp yakalar.
                        {
                            _planeLon += 0.0002 * SIM_TICK * 20;
                            _planeLat += 0.0001 * SIM_TICK * 20;

                            if (_simTime < 10.0)
                            {
                                // Tırmanma: 10 m/s (gerçekçi)
                                _planeAlt = 500 + (_simTime * 10);
                            }
                            else if (_simTime < 20.0)
                            {
                                // 10-20 sn: Tırmanma devam ama yavaşlıyor, 15. sn'de zirve
                                double dt21 = _simTime - 10.0;
                                _planeAlt = 600 + (50 * dt21) - (2.5 * dt21 * dt21); // Parabolik zirve
                            }
                            else
                            {
                                // 20+ sn: Dalış (-15 m/s dikey → gerçekçi)
                                double peak21 = 600 + (50 * 10) - (2.5 * 100); // ~850m zirve
                                _planeAlt = peak21 - ((_simTime - 20.0) * 15);
                            }

                            if (_planeAlt < 100) _planeAlt = 100;
                            // 14 saniyelik kesinti
                            _suppressPlanePacket = (_simTime >= 10.0 && _simTime <= 24.0);
                        }
                        break;


                    case 21: // NİHAİ TIMEOUT TESTİ: Virajdayken 17 sn Kopma + Uzak Noktaya Işınlanma
                             // Bu test MovementEngine'in tüm limitlerini zorlar: 
                             // Yay İntegrali, Sönümleme, 15sn Freeze ve ForceSync(Amnezi) aynı anda çalışır.

                        double r21 = 0.01;
                        double w21 = 0.2; // Keskin dönüş hızı

                        if (_simTime < 10.0)
                        {
                            // 1. AŞAMA: Uçak saat yönünün tersine viraj dönüyor
                            double t21 = _simTime * w21;
                            _planeLon = _shipLon + Math.Cos(t21) * r21;
                            _planeLat = _shipLat + Math.Sin(t21) * r21;
                        }
                        else
                        {
                            // 2. AŞAMA: Gerçek dünyada uçak virajı bitirip Kuzey-Doğu'ya kaçıyor.
                            // Ancak 17 saniye boyunca bu bilgiyi Cesium'a göndermeyeceğiz.
                            double dt21 = _simTime - 10.0;

                            // 10. saniyedeki konumu (Kopma noktası)
                            double breakAngle = 10.0 * w21;
                            double startLon = _shipLon + Math.Cos(breakAngle) * r21;
                            double startLat = _shipLat + Math.Sin(breakAngle) * r21;

                            // Uçak o noktadan itibaren dümdüz ve çok hızlı bir şekilde uzaklaşıyor
                            _planeLon = startLon + (dt21 * 0.0001 * 20); // Doğuya gidiş
                            _planeLat = startLat + (dt21 * 0.0001 * 20); // Kuzeye gidiş
                        }

                        _planeAlt = 1500;

                        // KRİTİK NOKTA: 10. ile 27. saniyeler arasında (17 sn boyunca) PAKET GÖNDERME!
                        // Cesium 15. saniyede uçağı donduracak. 
                        // 27. saniyede paket ulaştığında dtPacket > 15 olacak ve ForceSync tetiklenecek.
                        _suppressPlanePacket = (_simTime >= 10.0 && _simTime <= 27.0);
                        break;


                    case 233: // TEST 23: DÜZENSİZ VERİ FREKANSI (Dalgalı Paket Gelişi)
                        // Uçak yavaşça viraj dönsün (Ekstrapolasyon ve yumuşatmayı en iyi virajda görürüz)
                        double r23 = 0.01;
                        double w23 = 0.2;
                        double t23 = _simTime * w23;
                        _planeLon = _shipLon + Math.Cos(t23) * r23;
                        _planeLat = _shipLat + Math.Sin(t23) * r23;
                        _planeAlt = 1000;

                        // RASTGELE ZAMANLAYICI (Düzensiz Frekans Simülasyonu)
                        long nowMs23 = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                        
                        // Eğer son paketin süresi dolduysa (yani birazdan aşağıdaki blokta paket gönderilecekse),
                        // BİR SONRAKİ paketin ne zaman geleceğini rastgele (Örn: 2 sn ile 6 sn arası) belirle.
                        if (nowMs23 - _lastPlaneSend >= _planeSendMs)
                        {
                            // Bir sonraki paket 2000 ms (2sn) ile 6000 ms (6sn) arasında rastgele bir sürede gelecek
                            _planeSendMs = Random.Shared.Next(400, 800); 
                        }
                        
                        _suppressPlanePacket = false;
                        break;

                    case 23: // GERÇEKÇİ 5Hz (200ms) AĞ DALGALANMASI (JITTER) TESTİ
                        // Uçak standart bir viraj dönüyor
                        double r24 = 0.01;
                        double w24 = 0.2;
                        double t24 = _simTime * w24;
                        _planeLon = _shipLon + Math.Cos(t24) * r24;
                        _planeLat = _shipLat + Math.Sin(t24) * r24;
                        _planeAlt = 1000;

                        long nowMs24 = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                        
                        if (nowMs24 - _lastPlaneSend >= _planeSendMs)
                        {
                            // 5Hz (200ms) için gerçekçi fiziksel ağ simülasyonu
                            double zar = Random.Shared.NextDouble();
                            
                            if (zar < 0.5) 
                            {
                                // %50 ihtimalle anlık bir takılma / 1 paket kaybı (300ms - 450ms)
                                _planeSendMs = Random.Shared.Next(300, 500); 
                            }
                            else 
                            {
                                // %95 ihtimalle sağlıklı ama hafif dalgalı (Jitter: 180ms - 220ms)
                                _planeSendMs = Random.Shared.Next(180, 220);
                            }
                        }
                        
                        _suppressPlanePacket = false;
                        break;

                    case 25: // TEST 25: GERÇEKÇİ SAVAŞ AĞI (Tıkanıklık ve Veri Patlaması / Lag & Burst)
                        // Uçak yine viraj dönüyor ki kavis tutturma yeteneğini görelim
                        double r25 = 0.01;
                        double w25 = 0.2;
                        double t25 = _simTime * w25;
                        _planeLon = _shipLon + Math.Cos(t25) * r25;
                        _planeLat = _shipLat + Math.Sin(t25) * r25;
                        _planeAlt = 1000;

                        long nowMs25 = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                        
                        if (nowMs25 - _lastPlaneSend >= _planeSendMs)
                        {
                            double zar = Random.Shared.NextDouble();
                            
                            if (zar < 0.20) 
                            {
                                // %20 İhtimalle AĞ TIKANIR (Lag Spike): 
                                // Veri 3-5 paket boyunca gelmez. (600ms ile 1200ms arası boşluk)
                                // Burada senin Yay İntegralin (CTRV) devreye girip uçağı 1 saniye boyunca kavisli uçurmak zorundadır.
                                _planeSendMs = Random.Shared.Next(600, 1200); 
                            }
                            else if (zar < 0.40)
                            {
                                // %20 İhtimalle TIKANIKLIK AÇILIR (Burst):
                                // Geciken paketler ağdan mermi gibi peş peşe dökülür (50ms ile 100ms arası)
                                // Burada İnterpolasyonun "zıplama" yapmadan uçağı hızlıca yakalatması gerekir.
                                _planeSendMs = Random.Shared.Next(50, 100);
                            }
                            else 
                            {
                                // %60 İhtimalle NORMAL AKIŞ:
                                // Ufak tefek pürüzlerle standart UDP akışı (150ms ile 300ms arası)
                                _planeSendMs = Random.Shared.Next(150, 300);
                            }
                        }
                        
                        _suppressPlanePacket = false;
                        break;

                    case 30: // TEST 30: GERÇEKÇİ UÇUŞ FİZİĞİ (S-Viraj ve İrtifa Dalgalanması)
                        double baseSpeed = 200.0; // 200 m/s yatay hız
                        double angularFreq = 0.2; 
                        
                        // 1. ROTA VE YATIŞ (ROLL) 
                        // S-Virajı için saniyede -0.1 ile +0.1 radyan arası salınım yapan dönüş hızı
                        double currentTurnRate = 0.1 * Math.Cos(_simTime * angularFreq); 
                        
                        // C# tarafında merkezkaç formülü: Roll = atan((V * w) / g)
                        _planeRoll = Math.Atan((baseSpeed * currentTurnRate) / 9.81);
                        _planeRoll = Math.Max(-1.047, Math.Min(1.047, _planeRoll)); // Max 60 derece

                        // Yön (Heading) integrali ve konum güncelleme
                        double simulatedHeading = 0.5 + (0.1 / angularFreq) * Math.Sin(_simTime * angularFreq);
                        double moveDist = baseSpeed * SIM_TICK;
                        
                        _planeLon += (Math.Sin(simulatedHeading) * moveDist) / (111320 * Math.Cos(_planeLat * Math.PI / 180));
                        _planeLat += (Math.Cos(simulatedHeading) * moveDist) / 110540;

                        // 2. İRTİFA VE YUNUSLAMA (PITCH)
                        double altAmplitude = 1000;
                        double altFreq = 0.15;
                        
                        // Uçak 1000m ile 3000m arasında inip çıkar
                        _planeAlt = 2000 + Math.Sin(_simTime * altFreq) * altAmplitude;
                        
                        // Dikey hız (Vz) hesabı (Sinüsün türevi Cos)
                        double currentVz = altAmplitude * altFreq * Math.Cos(_simTime * altFreq);
                        
                        // Pitch formülü: atan2(Vz, V)
                        _planePitch = Math.Atan2(currentVz, baseSpeed);
                        _planePitch = Math.Max(-0.785, Math.Min(0.785, _planePitch)); // Max 45 derece dalış
                        break;

                    case 31: // TEST 31: SABİT DAİRE (Koordineli Dönüş - Sabit Yatış Açısı)
                        // Uçak sabit bir hızla ve sabit bir yarıçapla geminin etrafında döner.
                        // Merkezkaç kuvvetine karşı koymak için daire boyunca hep aynı açıyla yan yatar.

                        double radius31 = 0.01; // Derece cinsinden yarıçap (~1.1 km)
                        double w31 = 0.15;      // Saniyede 0.15 radyanlık sabit dönüş hızı (sabit kavis)
                        double angle31 = _simTime * w31;

                        // 1. KONUM GÜNCELLEMESİ
                        _planeLon = _shipLon + Math.Cos(angle31) * radius31;
                        _planeLat = _shipLat + Math.Sin(angle31) * radius31;
                        _planeAlt = 1500; // İrtifa sabit

                        // 2. FİZİK (ROLL VE PITCH) HESAPLAMASI
                        // Yarıçapı metreye çevir (1 derece ortalama 111.32 km'dir)
                        double radiusInMeters = radius31 * 111320.0 * Math.Cos(_shipLat * Math.PI / 180);
                        double speed31 = radiusInMeters * w31; // Çizgisel Hız = Yarıçap * Açısal Hız (V = R * w)

                        // Sabit Yatış (Roll) Formülü: atan((V * w) / g)
                        _planeRoll = Math.Atan((speed31 * w31) / 9.81);

                        // Limitleri uygula (Maks 60 derece = 1.047 radyan)
                        _planeRoll = Math.Max(-1.047, Math.Min(1.047, _planeRoll));

                        // İrtifa değişmediği için (düz uçuş) yunuslama (Pitch) sıfır kalır
                        _planePitch = 0.0;
                        break;

                    case 32: // TEST 32: KAVİSTE VERİ KESİNTİSİ (Ekstrapolasyon Testi)
                        // Uçak sabit daire çizerken 8 saniyelik bir veri kopması yaşanır.
                        // Beklenti: Motor yatış açısını (Roll) ve dönüş kavisini 8 sn boyunca 
                        // kusursuz bir şekilde simüle etmeye devam eder.

                        double radius32 = 0.01;
                        double w32 = 0.15;
                        double angle32 = _simTime * w32;

                        // Konum hesaplama
                        _planeLon = _shipLon + Math.Cos(angle32) * radius32;
                        _planeLat = _shipLat + Math.Sin(angle32) * radius32;
                        _planeAlt = 1500;

                        // Fizik hesaplama
                        double radiusInMeters32 = radius32 * 111320.0 * Math.Cos(_shipLat * Math.PI / 180);
                        double speed32 = radiusInMeters32 * w32;

                        // Sabit Yatış
                        _planeRoll = Math.Atan((speed32 * w32) / 9.81);
                        _planeRoll = Math.Max(-1.047, Math.Min(1.047, _planeRoll));
                        _planePitch = 0.0;

                        // 10. ile 18. saniyeler arasında PAKET GÖNDERME (8 saniye kopukluk)
                        _suppressPlanePacket = (_simTime >= 20.0 && _simTime <= 28.0);
                        break;

                    default: // SPİRALDEN SABİT YÖRÜNGE (İniş yerine belirli bir irtifada dönme)
                        double startAlt = 300.0;
                        double targetAlt = 100.0; // Bu irtifada durup sadece dönecek
                        double descentRate = 2.0; 
                        
                        // 1. İrtifa Hesabı (targetAlt değerine kadar iner, orada durur)
                        _planeAlt = Math.Max(targetAlt, startAlt - (_simTime * descentRate));

                        // 2. Yarıçap Hesabı (İrtifa düştükçe 0.015'ten 0.005'e daralır, 100m'de sabitlenir)
                        double ratio = Math.Max(0, (_planeAlt - targetAlt) / (startAlt - targetAlt));
                        double orbitRadius = 0.005 + (0.010 * ratio); 

                        // 3. Konum Uygulama
                        double angle1 = _simTime * 0.1;
                        _planeLon = _shipLon + Math.Cos(angle1) * orbitRadius;
                        _planeLat = _shipLat + Math.Sin(angle1) * orbitRadius;
                        break;
                }

                // ─────────────────────────────────────────────
                // B) PAKET GÖNDERİMİ (ms bazlı — ayarlanabilir)
                // ─────────────────────────────────────────────

                // GEMİ PAKETİ
                if (now - _lastShipSend >= _shipSendMs)
                {
                    double dtShip = (now - _lastShipSend) / 1000.0;
                    double shipVx = ((_shipLon - _prevShipLon) * 111320 * Math.Cos(_shipLat * Math.PI / 180)) / dtShip;
                    double shipVy = ((_shipLat - _prevShipLat) * 110540) / dtShip;
                    double shipSpd = Math.Sqrt(shipVx * shipVx + shipVy * shipVy);
                    double shipH = Math.Atan2(shipVx, shipVy);
                    if (shipH < 0) shipH += 2 * Math.PI;

                    await hub.Clients.All.SendAsync("EntityPositionUpdated",
                        "SHIP_01", _shipLon, _shipLat, 2.0,
                        shipSpd, shipH, 0.0, 0.0, (double)now);

                    _prevShipLon = _shipLon; _prevShipLat = _shipLat;
                    _lastShipSend = now;
                }

                // PİST PAKETİ
                if (now - _lastDeckSend >= _deckSendMs)
                {
                    double dtDeck = (now - _lastDeckSend) / 1000.0;
                    double deckVx = ((_deckLon - _prevDeckLon) * 111320 * Math.Cos(_deckLat * Math.PI / 180)) / dtDeck;
                    double deckVy = ((_deckLat - _prevDeckLat) * 110540) / dtDeck;
                    double deckSpd = Math.Sqrt(deckVx * deckVx + deckVy * deckVy);
                    double deckH = Math.Atan2(deckVx, deckVy);
                    if (deckH < 0) deckH += 2 * Math.PI;

                    await hub.Clients.All.SendAsync("EntityPositionUpdated",
                        "DECK_01", _deckLon, _deckLat, 2.0,
                        deckSpd, deckH, 0.0, 0.0, (double)now);

                    _prevDeckLon = _deckLon; _prevDeckLat = _deckLat;
                    _lastDeckSend = now;
                }

                // UÇAK PAKETİ (suppressPlanePacket aktifken paket gönderilmez — timeout testi için)
                if (!_suppressPlanePacket && now - _lastPlaneSend >= _planeSendMs)
                {
                    double dtPlane = (now - _lastPlaneSend) / 1000.0;
                    double plVx = ((_planeLon - _prevPlaneLon) * 111320 * Math.Cos(_planeLat * Math.PI / 180)) / dtPlane;
                    double plVy = ((_planeLat - _prevPlaneLat) * 110540) / dtPlane;
                    double plSpd = Math.Sqrt(plVx * plVx + plVy * plVy);
                    double plH = Math.Atan2(plVx, plVy);
                    if (plH < 0) plH += 2 * Math.PI;

                    if (_planeMovementMode != 30 || _planeMovementMode != 31 || _planeMovementMode != 32) 
                    {
                        _planePitch = 0.0;
                        _planeRoll = 0.0;
                    }

                    await hub.Clients.All.SendAsync("EntityPositionUpdated",
                        "PLANE_01", _planeLon, _planeLat, _planeAlt,
                        plSpd, plH, _planePitch, _planeRoll, (double)now);

                    _prevPlaneLon = _planeLon; _prevPlaneLat = _planeLat; _prevPlaneAlt = _planeAlt;
                    _lastPlaneSend = now;
                }
            };
            _simTimer.Start();
        }

        public MainWindow()
        {
            // CefSharp'ı başlat (uygulama başına bir kez)
            InitializeCefSharp();
            InitializeComponent();
        }

        private void InitializeCefSharp()
        {
            if (Cef.IsInitialized) return;

            var settings = new CefSettings
            {
                // Cache ayarları
                CachePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CesiumWpfApp", "Cache"),
                
                // Log ayarları
                LogSeverity = LogSeverity.Warning,
                
                // Performans ayarları
                WindowlessRenderingEnabled = false,
            };

            // Chromium argümanları
            settings.CefCommandLineArgs.Add("disable-gpu-compositing");
            settings.CefCommandLineArgs.Add("enable-media-stream");
            settings.CefCommandLineArgs.Add("disable-web-security"); // Local SignalR için gerekli
            settings.CefCommandLineArgs.Add("disable-background-timer-throttling");
            settings.CefCommandLineArgs.Add("disable-backgrounding-occluded-windows");
            settings.CefCommandLineArgs.Add("disable-renderer-backgrounding");
            settings.CefCommandLineArgs.Add("intensive-wake-up-throttling-policy", "0");
            settings.CefCommandLineArgs.Add("disable-background-networking");
            settings.CefCommandLineArgs.Add("disable-features", "CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,ThrottleDisplayNoneAndVisibilityHiddenFrame");

            // Bellek ayarları
            settings.CefCommandLineArgs.Add("js-flags", "--max-old-space-size=256");

            Cef.Initialize(settings);
        }

        private async void Window_Loaded(object sender, RoutedEventArgs e)
        {
            try
            {
                // 1. SignalR sunucusunu başlat
                await StartSignalRServerAsync();

                // 2. Çoklu Nesne Simülasyonunu başlat
                StartMultiEntitySimulation();

                // 3. Browser'ı SignalR'a yönlendir
                string appDir = AppDomain.CurrentDomain.BaseDirectory;
                string wwwrootPath = Path.Combine(appDir, "wwwroot");

                if (Directory.Exists(wwwrootPath))
                {
                    browser.Address = $"{SignalRUrl}/index.html";
                    Debug.WriteLine($"[CefSharp] Navigating to: {browser.Address}");
                }
                else
                {
                    MessageBox.Show($"wwwroot klasörü bulunamadı: {wwwrootPath}", "Hata", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[INIT ERROR] {ex.Message}");
                MessageBox.Show($"Başlatma hatası: {ex.Message}", "Hata", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async Task StartSignalRServerAsync()
        {
            var builder = WebApplication.CreateBuilder();

            // Kestrel portunu ayarla
            builder.WebHost.UseUrls(SignalRUrl);

            // SignalR servislerini ekle
            builder.Services.AddSignalR(options =>
            {
                options.EnableDetailedErrors = true;
                options.MaximumReceiveMessageSize = 1024 * 1024; // 1MB
            });

            // CORS ekle (localhost için)
            builder.Services.AddCors(options =>
            {
                options.AddDefaultPolicy(policy =>
                {
                    policy.AllowAnyOrigin()
                          .AllowAnyMethod()
                          .AllowAnyHeader();
                });
            });

            _signalRApp = builder.Build();

            // CORS middleware
            _signalRApp.UseCors();

            // Statik dosyalar (wwwroot)
            string wwwrootPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot");
            if (Directory.Exists(wwwrootPath))
            {
                // F12 TUŞUNU AKTİF ET
                browser.KeyUp += (s, args) =>
                {
                    if (args.Key == System.Windows.Input.Key.F12)
                    {
                        browser.ShowDevTools();
                    }
                };

                // Browser konsol mesajlarını Debug çıktısına yönlendir
                browser.ConsoleMessage += (s, args) =>
                {
                    Debug.WriteLine($"[JS {args.Level}] {args.Message} ({args.Source}:{args.Line})");
                };

                _signalRApp.UseStaticFiles(new StaticFileOptions
                {
                    FileProvider = new PhysicalFileProvider(wwwrootPath),
                    RequestPath = "",
                    ServeUnknownFileTypes = true,
                    ContentTypeProvider = GetCesiumContentTypeProvider()
                });

                // Default dosya (index.html)
                _signalRApp.UseDefaultFiles(new DefaultFilesOptions
                {
                    FileProvider = new PhysicalFileProvider(wwwrootPath)
                });
            }

            // SignalR Hub endpoint
            _signalRApp.MapHub<CesiumHub>("/cesiumHub");

            Debug.WriteLine($"[SignalR] Starting server on {SignalRUrl}");

            // Arka planda başlat
            _ = Task.Run(async () =>
            {
                try
                {
                    await _signalRApp.RunAsync();
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[SignalR ERROR] {ex.Message}");
                }
            });

            // Sunucunun başlamasını bekle
            await Task.Delay(500);
            Debug.WriteLine("[SignalR] Server started successfully");
        }

        /// <summary>
        /// ENU (East-North-Up) hız vektörünü ECEF (X-Y-Z) hız vektörüne dönüştürür.
        /// Dönüşüm matrisi: geodetik lat/lon'a bağlı standart DCM (Direction Cosine Matrix)
        /// </summary>
        private static void EnuToEcef(double latDeg, double lonDeg,
            double vE, double vN, double vU,
            out double vX, out double vY, out double vZ)
        {
            double latRad = latDeg * Math.PI / 180.0;
            double lonRad = lonDeg * Math.PI / 180.0;
            double sinLat = Math.Sin(latRad);
            double cosLat = Math.Cos(latRad);
            double sinLon = Math.Sin(lonRad);
            double cosLon = Math.Cos(lonRad);

            // ENU → ECEF Rotation Matrix (sütunlar: East, North, Up yönleri ECEF'te)
            vX = -sinLon * vE  -  sinLat * cosLon * vN  +  cosLat * cosLon * vU;
            vY =  cosLon * vE  -  sinLat * sinLon * vN  +  cosLat * sinLon * vU;
            vZ =                   cosLat * vN            +  sinLat * vU;
        }

        private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            try
            {
                _simTimer?.Stop();
                // SignalR'ı durdur
                if (_signalRApp != null)
                {
                    _signalRApp.StopAsync().Wait(TimeSpan.FromSeconds(2));
                    Debug.WriteLine("[SignalR] Server stopped");
                }

                // CefSharp'ı temizle
                browser?.Dispose();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[CLEANUP ERROR] {ex.Message}");
            }
        }
        private static Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider GetCesiumContentTypeProvider()
        {
            var provider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
            provider.Mappings[".glb"] = "model/gltf-binary";
            provider.Mappings[".gltf"] = "model/gltf+json";
            provider.Mappings[".wasm"] = "application/wasm";
            provider.Mappings[".json"] = "application/json";
            provider.Mappings[".glsl"] = "text/plain";
            return provider;
        }
    }
}