using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using System.Threading.Tasks;

namespace MudWebClient.Services
{
    public class MudHub : Hub
    {
        private readonly MudTelnetService _mudService;
        private readonly ILogger<MudHub> _logger;
        private static readonly ConcurrentDictionary<string, string> _connectionMapping = new();
        private static IHubContext<MudHub> _hubContext;
        private static bool _eventHandlerRegistered = false;
        private static readonly object _lockObject = new object();
        
        public MudHub(MudTelnetService mudService, ILogger<MudHub> logger, IHubContext<MudHub> hubContext)
        {
            _mudService = mudService;
            _logger = logger;
            _hubContext = hubContext;
            
            lock (_lockObject)
            {
                if (!_eventHandlerRegistered)
                {
                    _logger.LogInformation("注册MUD数据接收事件处理程序");
                    _mudService.DataReceived += OnMudDataReceived;
                    _eventHandlerRegistered = true;
                }
            }
        }
        
        // 数据接收处理方法
        private async Task OnMudDataReceived(string connectionId, string data)
        {
            // 查找Hub的上下文
            if (_connectionMapping.TryGetValue(connectionId, out var hubConnectionId))
            {
                try
                {
                    // 使用注入的hubContext发送数据
                    await _hubContext.Clients.Client(hubConnectionId).SendAsync("ReceiveData", data);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error sending data to client {ClientId}", hubConnectionId);
                }
            }
        }

        public override async Task OnConnectedAsync()
        {
            await base.OnConnectedAsync();
            _logger.LogInformation("Client connected: {ConnectionId}", Context.ConnectionId);
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            string? mudConnectionId = null;
            
            // 查找并移除连接映射
            foreach (var pair in _connectionMapping.Where(p => p.Value == Context.ConnectionId))
            {
                mudConnectionId = pair.Key;
                _connectionMapping.TryRemove(pair.Key, out _);
            }
            
            if (mudConnectionId != null)
            {
                await _mudService.DisconnectAsync(mudConnectionId);
            }
            
            await base.OnDisconnectedAsync(exception);
            _logger.LogInformation("Client disconnected: {ConnectionId}", Context.ConnectionId);
        }

        public async Task<bool> Connect(string host, int port)
        {
            _logger.LogInformation("Connecting to MUD server {Host}:{Port}", host, port);
            string mudConnectionId = Guid.NewGuid().ToString();
            bool connected = await _mudService.ConnectAsync(mudConnectionId, host, port);
            
            if (connected)
            {
                // 存储映射关系
                _connectionMapping[mudConnectionId] = Context.ConnectionId;
                
                // 开始读取数据
                await _mudService.StartReadingAsync(mudConnectionId);
            }
            
            return connected;
        }

        public async Task SendCommand(string command)
        {
            string mudConnectionId = _connectionMapping.FirstOrDefault(x => x.Value == Context.ConnectionId).Key;
            if (string.IsNullOrEmpty(mudConnectionId))
            {
                _logger.LogWarning("No MUD connection found for client {ConnectionId}", Context.ConnectionId);
                return;
            }
            
            _logger.LogInformation("Sending command to MUD server for connection {ConnectionId}", mudConnectionId);
            await _mudService.SendCommandAsync(mudConnectionId, command);
        }

        public async Task Disconnect()
        {
            string mudConnectionId = _connectionMapping.FirstOrDefault(x => x.Value == Context.ConnectionId).Key;
            if (string.IsNullOrEmpty(mudConnectionId))
            {
                return;
            }
            
            _logger.LogInformation("Disconnecting from MUD server for connection {ConnectionId}", mudConnectionId);
            await _mudService.DisconnectAsync(mudConnectionId);
            _connectionMapping.TryRemove(mudConnectionId, out _);
        }
    }
} 