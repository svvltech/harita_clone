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


        // SİMÜLASYON VERİLERİ
        private System.Timers.Timer? _simTimer;
        private double _simTicks = 0;
        

        private void StartMultiEntitySimulation()
        {

            _simTimer = new System.Timers.Timer(500); // 0.5 saniyede bir tick
            _simTimer.Elapsed += async (s, e) =>
            {
                _simTicks += 1;
                
                if (_signalRApp == null) return;
                var hubContext = _signalRApp.Services.GetRequiredService<IHubContext<CesiumHub>>();

                // 1. GEMİ GÜNCELLEME (Her 1 saniyede bir - 2 tick)
                if (_simTicks % 2 == 0)
                {
                    double prevLon = _shipLon;
                    double prevLat = _shipLat;

                    _shipLon += 0.0002; // Biraz daha hızlı (yaklaşık 30 knot)

                    double dtShip = 1.0; // 1 sn aralık (2 tick × 0.5s)
                    double shipVx = ((_shipLon - prevLon) * 111320 * Math.Cos(_shipLat * Math.PI / 180)) / dtShip;
                    double shipVy = ((_shipLat - prevLat) * 110540) / dtShip;
                    double shipSpeed = Math.Sqrt(shipVx * shipVx + shipVy * shipVy); // Yatay hız (m/s)

                    // Heading (radyan)
                    double shipHeadingRad = Math.Atan2(shipVx, shipVy);
                    if (shipHeadingRad < 0) shipHeadingRad += 2 * Math.PI;

                    long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                    // Paket: id, lon, lat, height, speed, heading, pitch, roll, timestamp
                    await hubContext.Clients.All.SendAsync("EntityPositionUpdated",
                        "SHIP_01", _shipLon, _shipLat, 2.0,
                        shipSpeed, shipHeadingRad, 0.0, 0.0, (double)timestamp);
                }

                // 1b. PİST GÜNCELLEME
                // Fiziksel hareket geminin aynısı (her 1s = %2), paket gönderimi farklı (her 3s = %6)
                if (_simTicks % 2 == 0)
                {
                    _deckLon += 0.0002; // Gemiyle aynı hızda, aynı frekansta hareket
                }

                if (_simTicks % 6 == 0)
                {
                    double dtDeck = 3.0; // 6 tick × 0.5s
                    double deckVx = ((_deckLon - _prevDeckLon) * 111320 * Math.Cos(_deckLat * Math.PI / 180)) / dtDeck;
                    double deckVy = ((_deckLat - _prevDeckLat) * 110540) / dtDeck;
                    double deckSpeed = Math.Sqrt(deckVx * deckVx + deckVy * deckVy);

                    double deckHeading = Math.Atan2(deckVx, deckVy);
                    if (deckHeading < 0) deckHeading += 2 * Math.PI;

                    long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                    await hubContext.Clients.All.SendAsync("EntityPositionUpdated",
                        "DECK_01", _deckLon, _deckLat, 2.0,
                        deckSpeed, deckHeading, 0.0, 0.0, (double)timestamp);

                    // Önceki konumu HESAPLAMADAN SONRA güncelle (önce yazarsan delta=0 olur)
                    _prevDeckLon = _deckLon;
                    _prevDeckLat = _deckLat;
                }
                // 2. UÇAK GÜNCELLEME (Her 2 saniyede bir - 4 tick)
                if (_simTicks % 4 == 0)
                {
                    double prevLon = _planeLon;
                    double prevLat = _planeLat;
                    double prevAlt = _planeAlt;

                    // ═══════════════════════════════════════════════
                    // TEST MODU (değiştir ve yeniden derle)
                    // 0 = Spiral iniş (mevcut)
                    // 1 = Düz çizgi (sapma sıfır olmalı)
                    // 2 = Sabit daire (sabit turnRate)
                    // ═══════════════════════════════════════════════
                    int testMode = 0;

                    switch (testMode)
                    {
                        case 1: // DÜZ ÇİZGİ
                            _planeLon += 0.0003;
                            _planeLat += 0.0001;
                            _planeAlt = 500;
                            break;

                        case 2: // SABİT DAİRE
                            double fixedRadius = 0.01;
                            double circleAngle = _simTicks * 0.05;
                            _planeLon = _shipLon + Math.Cos(circleAngle) * fixedRadius;
                            _planeLat = _shipLat + Math.Sin(circleAngle) * fixedRadius;
                            _planeAlt = 500;
                            break;

                        default: // SPİRAL İNİŞ (case 0) — Agresif taktik iniş (gerçekçi max)
                            
                            // ilk kullandığım değerler
                            //double radius = Math.Max(0, 0.015 - (_simTicks * 0.00005));
                            //double angle = _simTicks * 0.1;
                            
                            // 2. kullandığım yavaş
                            // Başlangıç yarıçapı: ~3 km (0.027°), yavaş daralma
                            //double radius = Math.Max(0, 0.027 - (_simTicks * 0.00001));
                            // Açısal hız: 0.025 rad/tick → 0.05 rad/s → ~2.9°/s (TB2 gerçekçi)
                            //double angle = _simTicks * 0.025;
                            
                            // turnRate: 0.05 rad/tick = 0.1 rad/s ≈ 5.7°/s (45° bank, taktik limit)
                            // 2sn'de ~11.5° dönüş — gerçekçi agresif
                            double angle = _simTicks * 0.05;
                            // Yarıçap: ~1.7 km başlangıç, yavaş daralma
                            double radius = Math.Max(0, 0.015 - (_simTicks * 0.000015));
                    
                            _planeLon = _shipLon + Math.Cos(angle) * radius;
                            _planeLat = _shipLat + Math.Sin(angle) * radius;
                    
                            // ilk kullandığım değerler
                            //_planeAlt = 500 - (_simTicks * 1.5);

                            // 2. kullandığım yavaş
                            // Alçalma: ~0.3 m/tick = 0.6 m/s (gerçekçi iniş sürüşü)
                            //_planeAlt = 500 - (_simTicks * 0.3);

                            // Alçalma: 0.7 m/tick = 1.4 m/s (agresif iniş)
                            _planeAlt = 500 - (_simTicks * 0.7);
                    
                            if (_planeAlt < 10) 
                            {
                                _planeAlt = 10;
                                _planeLon = _shipLon;
                                _planeLat = _shipLat;
                            }
                            break;
                    }

                    double dtPlane = 2.0;
                    double planeVx = ((_planeLon - prevLon) * 111320 * Math.Cos(_planeLat * Math.PI / 180)) / dtPlane;
                    double planeVy = ((_planeLat - prevLat) * 110540) / dtPlane;
                    double planeSpeed = Math.Sqrt(planeVx * planeVx + planeVy * planeVy); // Yatay hız (m/s)

                    // Heading (radyan)
                    double planeHeadingRad = Math.Atan2(planeVx, planeVy);
                    if (planeHeadingRad < 0) planeHeadingRad += 2 * Math.PI;

                    long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                    await hubContext.Clients.All.SendAsync("EntityPositionUpdated",
                        "PLANE_01", _planeLon, _planeLat, _planeAlt,
                        planeSpeed, planeHeadingRad, 0.0, 0.0, (double)timestamp);
                    
                    
                    // Döngü reset
                    // if (_simTicks > 1000) _simTicks = 0;
                    // Döngü reset kaldırıldı — _simTicks sıfırlanınca
                    // radius aniden 0→0.015'e döner ve uçak sıçrıyordu.
                    // double taşmaz, güvenle artmaya devam edebilir.
                }
            };
            _simTimer.Start();
        }

}