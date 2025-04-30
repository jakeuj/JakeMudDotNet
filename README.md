# MUD Web客户端

这是一个使用.NET 9开发的网页版MUD Telnet客户端，可以让用户通过Web浏览器连接到MUD服务器并进行游戏交互。

## 功能特点

- 通过WebSocket连接到MUD服务器
- 支持Big5编码处理
- 响应式设计，适配不同屏幕尺寸
- 使用Noto Sans Mono TC等宽字体，确保繁体中文正确显示
- 实时接收和发送MUD服务器指令

## 技术栈

- 后端：.NET 9 ASP.NET Core
- 前端：HTML5, CSS3, JavaScript
- 实时通信：SignalR
- 字符编码：Big5

## 部署说明

### 本地运行

1. 确保已安装.NET 9 SDK
2. 克隆仓库或下载源代码
3. 在项目根目录运行：`dotnet run`
4. 浏览器访问：`http://localhost:5000`或`https://localhost:5001`

### 部署到Azure App Service

1. 在Azure Portal创建一个新的App Service
2. 配置为.NET 9运行时
3. 启用HTTP 2.0支持
4. 使用以下命令发布：
   ```
   dotnet publish -c Release
   ```
5. 将发布输出部署到Azure App Service

## 默认连接设置

- 主机：mud.csie.org
- 端口：3838
- 编码：Big5

## 注意事项

- 客户端使用WebSocket与服务器进行通信，确保防火墙和网络设置允许WebSocket连接
- 浏览器需要支持WebSocket和现代CSS功能
- 为获得最佳体验，建议使用最新版Chrome、Firefox或Edge浏览器 