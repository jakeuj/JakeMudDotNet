using System.Text;
using MudWebClient.Services;

var builder = WebApplication.CreateBuilder(args);

// 确保支持Big5编码
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

// 为Azure App Service添加端口配置
// 检查环境变量PORT (Azure App Service使用的变量)
string port = Environment.GetEnvironmentVariable("PORT") ?? "5166";
builder.WebHost.UseUrls($"http://*:{port}");

// 添加服务到容器
builder.Services.AddSignalR();
builder.Services.AddSingleton<MudTelnetService>();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(builder =>
    {
        builder.AllowAnyOrigin()
               .AllowAnyHeader()
               .AllowAnyMethod();
    });
});

var app = builder.Build();

// 配置HTTP请求管道
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseCors();

// 配置SignalR Hub
app.MapHub<MudHub>("/mudhub");

// 主页路由
app.MapGet("/", async context =>
{
    await context.Response.SendFileAsync("wwwroot/index.html");
});

// 输出启动信息
app.Logger.LogInformation("应用程序启动中，监听端口: {Port}", port);

app.Run();
