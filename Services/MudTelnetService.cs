using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;
using System.Threading;

namespace MudWebClient.Services
{
    public class MudTelnetService
    {
        private readonly ILogger<MudTelnetService> _logger;
        private readonly ConcurrentDictionary<string, TcpClient> _connections = new();
        private readonly ConcurrentDictionary<string, NetworkStream> _streams = new();
        private readonly ConcurrentDictionary<string, Task> _readTasks = new();
        private readonly ConcurrentDictionary<string, CancellationTokenSource> _cancellationTokens = new();

        // 定义数据接收事件
        public event Func<string, string, Task> DataReceived;

        // Telnet命令码
        private const byte IAC = 255;    // 解释为命令
        private const byte DONT = 254;   // 你不要
        private const byte DO = 253;     // 你要
        private const byte WONT = 252;   // 我不要
        private const byte WILL = 251;   // 我要
        private const byte SB = 250;     // 子协商开始
        private const byte SE = 240;     // 子协商结束
        private const byte ECHO = 1;     // 回显
        private const byte SUPPRESS_GA = 3; // 抑制继续进行
        private const byte NAWS = 31;    // 窗口大小

        public MudTelnetService(ILogger<MudTelnetService> logger)
        {
            _logger = logger;
        }

        public async Task<bool> ConnectAsync(string connectionId, string host, int port)
        {
            try
            {
                var client = new TcpClient();
                await client.ConnectAsync(host, port);
                
                _connections[connectionId] = client;
                _streams[connectionId] = client.GetStream();
                _cancellationTokens[connectionId] = new CancellationTokenSource();
                
                _logger.LogInformation("Connected to MUD server {Host}:{Port} for connection {ConnectionId}", host, port, connectionId);
                
                // 发送Telnet初始化设置
                await SendTelnetInitializationAsync(connectionId);
                
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to connect to MUD server {Host}:{Port} for connection {ConnectionId}", host, port, connectionId);
                return false;
            }
        }

        private async Task SendTelnetInitializationAsync(string connectionId)
        {
            try
            {
                if (!_streams.TryGetValue(connectionId, out var stream))
                {
                    return;
                }

                // 发送一些常用的Telnet协商选项
                // 我愿意抑制GA
                byte[] willSuppressGA = new byte[] { IAC, WILL, SUPPRESS_GA };
                await stream.WriteAsync(willSuppressGA);

                // 我愿意回显
                byte[] willEcho = new byte[] { IAC, WILL, ECHO };
                await stream.WriteAsync(willEcho);

                // 设置窗口大小
                byte[] windowSize = new byte[] { IAC, WILL, NAWS };
                await stream.WriteAsync(windowSize);

                _logger.LogInformation("Sent Telnet initialization for connection {ConnectionId}", connectionId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending Telnet initialization for connection {ConnectionId}", connectionId);
            }
        }

        public async Task StartReadingAsync(string connectionId)
        {
            if (!_streams.TryGetValue(connectionId, out var stream))
            {
                throw new InvalidOperationException($"No stream found for connection {connectionId}");
            }

            if (!_cancellationTokens.TryGetValue(connectionId, out var cts))
            {
                cts = new CancellationTokenSource();
                _cancellationTokens[connectionId] = cts;
            }

            _readTasks[connectionId] = Task.Run(async () =>
            {
                try
                {
                    byte[] buffer = new byte[4096];
                    using var ms = new MemoryStream();
                    bool inTelnetCommand = false;
                    int telnetBytesRemaining = 0;

                    while (!cts.Token.IsCancellationRequested)
                    {
                        try
                        {
                            int bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length, cts.Token);
                            if (bytesRead == 0)
                            {
                                // 连接已关闭
                                _logger.LogInformation("Server closed connection for {ConnectionId}", connectionId);
                                break;
                            }

                            ms.SetLength(0);

                            // 处理Telnet命令
                            for (int i = 0; i < bytesRead; i++)
                            {
                                byte b = buffer[i];

                                if (inTelnetCommand)
                                {
                                    // 跳过Telnet命令序列
                                    telnetBytesRemaining--;
                                    if (telnetBytesRemaining <= 0)
                                    {
                                        inTelnetCommand = false;
                                    }
                                    continue;
                                }

                                if (b == IAC && i + 1 < bytesRead)
                                {
                                    byte next = buffer[i + 1];
                                    if (next == WILL || next == WONT || next == DO || next == DONT)
                                    {
                                        inTelnetCommand = true;
                                        telnetBytesRemaining = 2; // 命令 + 选项
                                        
                                        // 如果服务器要求我们做某事，通常回复不愿意
                                        if (next == DO && i + 2 < bytesRead)
                                        {
                                            byte option = buffer[i + 2];
                                            await RespondToTelnetCommandAsync(connectionId, option);
                                        }
                                        continue;
                                    }
                                }

                                // 正常数据
                                if (!inTelnetCommand)
                                {
                                    ms.WriteByte(b);
                                }
                            }

                            if (ms.Length > 0)
                            {
                                // 使用Big5编码解码数据
                                Encoding big5 = Encoding.GetEncoding("big5");
                                string data = big5.GetString(ms.ToArray());
                                
                                // 触发事件通知数据接收
                                if (DataReceived != null)
                                {
                                    try
                                    {
                                        await DataReceived.Invoke(connectionId, data);
                                    }
                                    catch (Exception ex)
                                    {
                                        _logger.LogError(ex, "Error invoking DataReceived for connection {ConnectionId}", connectionId);
                                    }
                                }
                            }
                        }
                        catch (OperationCanceledException)
                        {
                            // 取消操作，正常退出
                            break;
                        }
                        catch (IOException ex) when (ex.InnerException is SocketException socketEx && 
                                                    (socketEx.SocketErrorCode == SocketError.ConnectionReset || 
                                                     socketEx.SocketErrorCode == SocketError.ConnectionAborted))
                        {
                            _logger.LogError(ex, "Connection reset by server for {ConnectionId}", connectionId);
                            break;
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Error reading from MUD server for connection {ConnectionId}", connectionId);
                            break;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in read loop for connection {ConnectionId}", connectionId);
                }
                finally
                {
                    // 清理连接
                    await DisconnectAsync(connectionId);
                }
            });
        }

        private async Task RespondToTelnetCommandAsync(string connectionId, byte option)
        {
            try
            {
                if (!_streams.TryGetValue(connectionId, out var stream))
                {
                    return;
                }

                // 对大多数选项，我们回复WONT
                byte[] response = new byte[] { IAC, WONT, option };
                
                // 特殊情况处理
                if (option == ECHO || option == SUPPRESS_GA)
                {
                    // 对一些常用选项，我们回复WILL
                    response = new byte[] { IAC, WILL, option };
                }

                await stream.WriteAsync(response);
                _logger.LogDebug("Sent Telnet response for option {Option} on connection {ConnectionId}", option, connectionId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending Telnet response for connection {ConnectionId}", connectionId);
            }
        }

        public async Task SendCommandAsync(string connectionId, string command)
        {
            if (!_streams.TryGetValue(connectionId, out var stream))
            {
                throw new InvalidOperationException($"No stream found for connection {connectionId}");
            }

            try
            {
                // 使用Big5编码将命令转换为字节
                Encoding big5 = Encoding.GetEncoding("big5");
                byte[] buffer = big5.GetBytes(command + "\r\n");
                
                await stream.WriteAsync(buffer);
                _logger.LogInformation("Sent command to MUD server for connection {ConnectionId}", connectionId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send command to MUD server for connection {ConnectionId}", connectionId);
                throw;
            }
        }

        public async Task DisconnectAsync(string connectionId)
        {
            // 首先取消读取任务
            if (_cancellationTokens.TryGetValue(connectionId, out var cts))
            {
                cts.Cancel();
                _cancellationTokens.TryRemove(connectionId, out _);
            }

            // 等待读取任务完成
            if (_readTasks.TryGetValue(connectionId, out var task))
            {
                try
                {
                    await Task.WhenAny(task, Task.Delay(1000)); // 等待最多1秒
                }
                catch { }
                _readTasks.TryRemove(connectionId, out _);
            }

            // 关闭连接
            if (_connections.TryRemove(connectionId, out var client))
            {
                client.Close();
                _streams.TryRemove(connectionId, out _);
                _logger.LogInformation("Disconnected from MUD server for connection {ConnectionId}", connectionId);
            }
        }
    }
} 