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

// 命令历史记录
let commandHistory = [];
let historyIndex = -1;
let currentCommand = '';

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
    
    // 为命令输入添加键盘事件
    commandInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            sendCommand();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            navigateHistory('up');
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            navigateHistory('down');
        } else {
            // 如果用户开始输入新内容，重置历史索引
            if (historyIndex !== -1 && event.key.length === 1) {
                historyIndex = -1;
            }
        }
    });
}

// 命令历史导航功能
function navigateHistory(direction) {
    if (commandHistory.length === 0) return;
    
    if (direction === 'up') {
        if (historyIndex === -1) {
            // 保存当前正在输入的命令
            currentCommand = commandInput.value;
            historyIndex = commandHistory.length - 1;
        } else if (historyIndex > 0) {
            historyIndex--;
        }
        commandInput.value = commandHistory[historyIndex];
    } else if (direction === 'down') {
        if (historyIndex === -1) return;
        
        if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            commandInput.value = commandHistory[historyIndex];
        } else {
            // 回到当前正在输入的命令
            historyIndex = -1;
            commandInput.value = currentCommand;
        }
    }
    
    // 将光标移到末尾
    commandInput.setSelectionRange(commandInput.value.length, commandInput.value.length);
}

// 添加命令到历史记录
function addToHistory(command) {
    // 不添加空命令
    if (!command.trim()) return;
    
    // 如果与最后一个命令相同，不重复添加
    if (commandHistory.length > 0 && commandHistory[commandHistory.length - 1] === command) {
        return;
    }
    
    commandHistory.push(command);
    
    // 限制历史记录数量（最多保存100条）
    if (commandHistory.length > 100) {
        commandHistory.shift();
    }
    
    // 重置历史索引
    historyIndex = -1;
    currentCommand = '';
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
        // 添加到历史记录
        addToHistory(command);
        
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
    // 首先，將文本中的HTML特殊字符進行轉義
    text = text.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
    
    // 然後處理換行符
    text = text.replace(/\r?\n/g, '<br>');
    
    // 正則表達式匹配各種ANSI控制碼
    // 光標定位: [row;colH 或 [rowH 或 [H
    const cursorPosRegex = /\[(?:\d+;)?\d*H/g;
    
    // 光標移動: [nA (上移) [nB (下移) [nC (右移) [nD (左移)
    const cursorMoveRegex = /\[(?:\d+)?[ABCD]/g;
    
    // 清屏控制: [2J (清全屏) [K (清行)
    const clearRegex = /\[(?:[0-2]?J|[0-2]?K)/g;
    
    // 其他控制碼: [?xxh [?xxl (設置/重置模式)
    const modeRegex = /\[\?\d+[hl]/g;
    
    // 保存/恢復光標: [s [u
    const saveCursorRegex = /\[[su]/g;
    
    // 移除各種控制碼但保留顏色碼
    text = text.replace(cursorPosRegex, '');
    text = text.replace(cursorMoveRegex, '');
    text = text.replace(clearRegex, '');
    text = text.replace(modeRegex, '');
    text = text.replace(saveCursorRegex, '');
    
    // 處理顏色ANSI碼：\x1B[ 或 ESC[ 開頭，後面跟著數字、分號和字母m
    // 或者匹配類似 [1;33m 這樣的格式
    const ansiColorRegex = /(?:\x1B\[|\[)([0-9;]+)m/g;
    
    let styleStack = [];  // 用於跟蹤當前生效的樣式
    let currentStyles = {}; // 當前的樣式集合
    
    // 替換所有ANSI顏色代碼
    let result = text.replace(ansiColorRegex, function(match, p1) {
        // 分割樣式代碼
        const codes = p1.split(';');
        
        // 處理重置代碼
        if (codes.includes('0')) {
            styleStack = [];
            currentStyles = {};
            return '</span><span style="">';
        }
        
        // 處理其他代碼
        let styleString = '';
        for (const code of codes) {
            if (ANSI_COLOR_MAP[code]) {
                currentStyles[code] = ANSI_COLOR_MAP[code];
            }
        }
        
        // 構建樣式字符串
        styleString = Object.values(currentStyles).join(' ');
        
        // 關閉之前的span並打開新的
        return `</span><span style="${styleString}">`;
    });
    
    // 確保文本開始和結束時有適當的span標籤
    result = `<span style="">${result}</span>`;
    
    // 確保不會有空的span標籤
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