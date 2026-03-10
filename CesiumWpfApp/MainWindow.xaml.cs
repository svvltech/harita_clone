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
        private int _planeMovementMode = 8;

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

                // UÇAK PAKETİ
                if (now - _lastPlaneSend >= _planeSendMs)
                {
                    double dtPlane = (now - _lastPlaneSend) / 1000.0;
                    double plVx = ((_planeLon - _prevPlaneLon) * 111320 * Math.Cos(_planeLat * Math.PI / 180)) / dtPlane;
                    double plVy = ((_planeLat - _prevPlaneLat) * 110540) / dtPlane;
                    double plSpd = Math.Sqrt(plVx * plVx + plVy * plVy);
                    double plH = Math.Atan2(plVx, plVy);
                    if (plH < 0) plH += 2 * Math.PI;

                    await hub.Clients.All.SendAsync("EntityPositionUpdated",
                        "PLANE_01", _planeLon, _planeLat, _planeAlt,
                        plSpd, plH, 0.0, 0.0, (double)now);

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