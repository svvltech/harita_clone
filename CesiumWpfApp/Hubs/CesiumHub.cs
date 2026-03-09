using Microsoft.AspNetCore.SignalR;
using System.Net.Http;

namespace CesiumWpfApp.Hubs
{
    public class CesiumHub : Hub
    {
        private static readonly HttpClient httpClient = new HttpClient();
        private static readonly Random random = new Random();

        // JS → C#: Ping
        public async Task SendPing(int counter)
        {
            await Clients.Caller.SendAsync("ReceivePong", counter, DateTime.Now.ToString("HH:mm:ss.fff"));
        }

        // C# → JS: Nesne Pozisyonu Güncelle (Broadcast)
        // speed: yatay hız (m/s), h/p/r: radyan, timestamp: ms
        public async Task UpdateEntityPosition(string entityId, double lon, double lat, double height,
            double speed, double h, double p, double r, double timestamp)
        {
            await Clients.All.SendAsync("EntityPositionUpdated",
                entityId, lon, lat, height, speed, h, p, r, timestamp);
        }

        // JS → C#: HTTP Request (WPF tarafında yap, sonucu gönder)
        public async Task RequestHttp(string url, int msgId)
        {
            try
            {
                var startTime = DateTime.Now;
                var response = await httpClient.GetStringAsync(url);
                var duration = (DateTime.Now - startTime).TotalMilliseconds;

                await Clients.Caller.SendAsync("HttpResponse", new
                {
                    msgId,
                    success = true,
                    dataLength = response.Length,
                    durationMs = duration
                });
            }
            catch (Exception ex)
            {
                await Clients.Caller.SendAsync("HttpResponse", new
                {
                    msgId,
                    success = false,
                    error = ex.Message
                });
            }
        }

        // JS → C#: Heavy Data Request
        public async Task RequestHeavyData(int size, int msgId)
        {
            var items = new List<object>();
            for (int i = 0; i < size * 10; i++)
            {
                items.Add(new
                {
                    id = i,
                    lat = 38.0 + random.NextDouble() * 5,
                    lon = 26.0 + random.NextDouble() * 10,
                    value = random.NextDouble() * 100,
                    ts = DateTime.Now.Ticks
                });
            }

            await Clients.Caller.SendAsync("HeavyDataResponse", new
            {
                msgId,
                itemCount = items.Count,
                data = items
            });
        }

        // JS → C#: Process Data from JS
        public async Task ProcessData(object[] payload, int msgId)
        {
            double sum = 0;
            foreach (var item in payload)
            {
                // Simple processing simulation
                sum += 1;
            }

            await Clients.Caller.SendAsync("DataProcessed", new
            {
                msgId,
                itemsProcessed = payload.Length,
                result = sum,
                processedAt = DateTime.Now.ToString("HH:mm:ss.fff")
            });
        }

        // JS → C#: Long running process
        public async Task ProcessRequest(string requestId, int msgId)
        {
            await Task.Delay(2000); // 2 saniye simülasyon

            await Clients.Caller.SendAsync("ProcessResponse", new
            {
                msgId,
                requestId,
                result = "Processed after 2 seconds",
                completedAt = DateTime.Now.ToString("HH:mm:ss.fff")
            });
        }

        public override async Task OnConnectedAsync()
        {
            Console.WriteLine($"[SignalR] Client connected: {Context.ConnectionId}");
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            Console.WriteLine($"[SignalR] Client disconnected: {Context.ConnectionId}");
            await base.OnDisconnectedAsync(exception);
        }
    }
}
