// DOM元素
let terminal;
let commandInput;
let sendButton;
let connectionButton;
let connectionStatus;
let hostInput;
let portInput;

// 变量
let connection = null;
let isConnected = false;

// ANSI颜色映射
const ANSI_COLOR_MAP = {
    '0': 'color: inherit; background-color: inherit;', // 重置
    '1': 'font-weight: bold;',                         // 粗体
    '4': 'text-decoration: underline;',                // 下划线
    '5': 'text-decoration: blink;',                    // 闪烁
    '7': 'filter: invert(100%);',                      // 反色
    '30': 'color: black;',
    '31': 'color: red;',
    '32': 'color: green;',
    '33': 'color: yellow;',
    '34': 'color: blue;',
    '35': 'color: magenta;',
    '36': 'color: cyan;',
    '37': 'color: white;',
    '40': 'background-color: black;',
    '41': 'background-color: red;',
    '42': 'background-color: green;',
    '43': 'background-color: yellow;',
    '44': 'background-color: blue;',
    '45': 'background-color: magenta;',
    '46': 'background-color: cyan;',
    '47': 'background-color: white;',
};

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    // 初始化DOM元素引用
    terminal = document.getElementById('terminal');
    commandInput = document.getElementById('commandInput');
    sendButton = document.getElementById('sendButton');
    connectionButton = document.getElementById('connectionButton');
    connectionStatus = document.getElementById('connectionStatus');
    hostInput = document.getElementById('hostInput');
    portInput = document.getElementById('portInput');
    
    // 初始化UI
    initializeUI();
    
    // 在控制台验证signalR是否可用
    if (typeof signalR === 'undefined') {
        console.error('SignalR库未正确加载');
        appendToTerminal('错误: SignalR库未正确加载，请刷新页面重试\n', 'error');
    } else {
        console.log('SignalR库已成功加载');
    }
});

function initializeUI() {
    // 添加事件监听器
    connectionButton.addEventListener('click', toggleConnection);
    sendButton.addEventListener('click', sendCommand);
    
    // 为命令输入添加回车键事件
    commandInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            sendCommand();
        }
    });
}

// 切换连接状态
function toggleConnection() {
    if (isConnected) {
        disconnect();
    } else {
        connect();
    }
}

async function connect() {
    const host = hostInput.value;
    const port = parseInt(portInput.value, 10);
    
    if (!host || isNaN(port)) {
        appendToTerminal('错误: 无效的主机或端口\n', 'error');
        return;
    }
    
    try {
        if (typeof signalR === 'undefined') {
            appendToTerminal('错误: SignalR库未加载，请刷新页面重试\n', 'error');
            return;
        }
        
        // 更新UI状态
        connectionButton.disabled = true;
        appendToTerminal(`正在连接到 ${host}:${port}...\n`, 'system');
        
        // 创建SignalR连接
        connection = new signalR.HubConnectionBuilder()
            .withUrl('/mudhub')
            .withAutomaticReconnect([0, 2000, 5000, 10000, 30000]) // 设置重连策略
            .configureLogging(signalR.LogLevel.Information) // 增加日志级别
            .build();
        
        // 设置接收消息的处理程序
        connection.on('ReceiveData', data => {
            appendToTerminal(data);
        });
        
        // 处理连接断开事件
        connection.onclose(error => {
            if (isConnected) {
                isConnected = false;
                updateConnectionStatus(false);
                appendToTerminal('与服务器的连接已断开\n', 'error');
                
                // 更新UI
                commandInput.disabled = true;
                sendButton.disabled = true;
                connectionButton.disabled = false;
                connectionButton.textContent = '连接';
            }
        });
        
        // 启动连接，添加超时处理
        await connection.start().catch(err => {
            console.error('无法启动连接:', err);
            throw new Error(`连接服务器失败: ${err.message}`);
        });
        
        // 连接到MUD服务器
        const result = await connection.invoke('Connect', host, port);
        
        if (result) {
            isConnected = true;
            updateConnectionStatus(true);
            appendToTerminal('已连接到MUD服务器!\n', 'success');
            
            // 启用UI元素
            commandInput.disabled = false;
            sendButton.disabled = false;
            connectionButton.disabled = false;
            connectionButton.textContent = '断开连接';
            
            // 聚焦到命令输入框
            commandInput.focus();
        } else {
            appendToTerminal('无法连接到MUD服务器\n', 'error');
            await connection.stop();
            connectionButton.disabled = false;
            connectionButton.textContent = '连接';
        }
    } catch (error) {
        console.error('连接错误:', error);
        appendToTerminal(`连接错误: ${error.message}\n`, 'error');
        updateConnectionStatus(false);
        connectionButton.disabled = false;
        connectionButton.textContent = '连接';
    }
}

async function disconnect() {
    if (!connection) return;
    
    try {
        // 通知服务器断开连接
        await connection.invoke('Disconnect');
        
        // 停止SignalR连接
        await connection.stop();
        
        // 更新状态
        isConnected = false;
        updateConnectionStatus(false);
        appendToTerminal('已断开连接\n', 'system');
        
        // 更新UI
        commandInput.disabled = true;
        sendButton.disabled = true;
        connectionButton.disabled = false;
        connectionButton.textContent = '连接';
    } catch (error) {
        console.error('断开连接错误:', error);
        appendToTerminal(`断开连接错误: ${error.message}\n`, 'error');
    }
}

async function sendCommand() {
    if (!isConnected || !connection) return;
    
    const command = commandInput.value;
    
    try {
        // 在终端中回显命令（如果不是空字符串）
        if (command) {
            appendToTerminal(`> ${command}\n`, 'command');
        } else {
            appendToTerminal(`> [空行]\n`, 'command');
        }
        
        // 发送命令到服务器
        await connection.invoke('SendCommand', command);
        
        // 清空输入框并聚焦
        commandInput.value = '';
        commandInput.focus();
    } catch (error) {
        console.error('发送命令错误:', error);
        
        // 检查是否是连接已断开的错误
        if (error.message.includes('connection') || error.message.includes('disconnected')) {
            isConnected = false;
            updateConnectionStatus(false);
            appendToTerminal('与服务器的连接已断开\n', 'error');
            
            // 更新UI
            commandInput.disabled = true;
            sendButton.disabled = true;
            connectionButton.disabled = false;
            connectionButton.textContent = '连接';
        } else {
            appendToTerminal(`发送命令错误: ${error.message}\n`, 'error');
        }
    }
}

function appendToTerminal(text, className = '') {
    // 处理ANSI颜色代码
    const coloredHtml = convertAnsiToHtml(text);
    
    const div = document.createElement('div');
    div.className = className;
    div.innerHTML = coloredHtml;
    terminal.appendChild(div);
    
    // 自动滚动到底部
    terminal.scrollTop = terminal.scrollHeight;
}

function convertAnsiToHtml(text) {
    // 首先，将文本中的HTML特殊字符进行转义
    text = text.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
    
    // 然后处理换行符
    text = text.replace(/\r?\n/g, '<br>');
    
    // 正则表达式匹配ANSI颜色代码: \x1B[ 或 ESC[ 开头，后面跟着数字、分号和字母m
    // 或者匹配类似 [1;33m 这样的格式
    const ansiRegex = /(?:\x1B\[|\[)([0-9;]+)m/g;
    
    let styleStack = [];  // 用于跟踪当前生效的样式
    let currentStyles = {}; // 当前的样式集合
    
    // 替换所有ANSI代码
    let result = text.replace(ansiRegex, function(match, p1) {
        // 分割样式代码
        const codes = p1.split(';');
        
        // 处理重置代码
        if (codes.includes('0')) {
            styleStack = [];
            currentStyles = {};
            return '</span><span style="">';
        }
        
        // 处理其他代码
        let styleString = '';
        for (const code of codes) {
            if (ANSI_COLOR_MAP[code]) {
                currentStyles[code] = ANSI_COLOR_MAP[code];
            }
        }
        
        // 构建样式字符串
        styleString = Object.values(currentStyles).join(' ');
        
        // 关闭之前的span并打开新的
        return `</span><span style="${styleString}">`;
    });
    
    // 确保文本开始和结束时有适当的span标签
    result = `<span style="">${result}</span>`;
    
    // 确保不会有空的span标签
    result = result.replace(/<span style=""><\/span>/g, '');
    
    return result;
}

function updateConnectionStatus(connected) {
    connectionStatus.textContent = connected ? '已连接' : '未连接';
    connectionStatus.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
}

// 处理页面卸载
window.addEventListener('beforeunload', async () => {
    if (isConnected && connection) {
        try {
            await connection.invoke('Disconnect');
            await connection.stop();
        } catch (error) {
            console.error('卸载时断开连接错误:', error);
        }
    }
}); 