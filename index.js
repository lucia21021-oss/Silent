// SillyTavern Extension - Silent Summarizer (Vanilla JS Version)
// 这是一个自包含的脚本，无需编译即可运行。

(function() {
    // === 配置与状态 ===
    const CONFIG = {
        url: localStorage.getItem('ss_url') || 'https://api.openai.com/v1',
        key: localStorage.getItem('ss_key') || '',
        model: localStorage.getItem('ss_model') || 'gpt-3.5-turbo',
        prompt: `# 剧情总结助手
你是一个专业的剧情总结助手。
## 输出格式
【核心事件】[一句话概括]
• [关键情节点1]
• [关键情节点2]`
    };

    // === HTML 模板构建 ===
    const UI_HTML = `
    <div id="ss-float-btn">📝</div>
    
    <div id="ss-panel" class="hidden">
        <div class="ss-header">
            <span>剧情助手 (V35)</span>
            <span class="ss-close-btn" id="ss-close">✖</span>
        </div>
        
        <div class="ss-content" id="tab-summary">
            <h3>生成总结</h3>
            <input type="number" id="ss-start" class="ss-input" placeholder="起始楼层 (默认0)">
            <input type="number" id="ss-end" class="ss-input" placeholder="结束楼层 (默认末尾)">
            <button id="ss-btn-gen" class="ss-btn ss-btn-primary">生成剧情总结</button>
            <textarea id="ss-output" class="ss-textarea" placeholder="结果将显示在这里..."></textarea>
        </div>

        <div class="ss-content hidden" id="tab-settings">
            <h3>API 设置</h3>
            <label>API 地址</label>
            <input type="text" id="ss-url" class="ss-input" value="${CONFIG.url}">
            <label>API Key</label>
            <input type="password" id="ss-key" class="ss-input" value="${CONFIG.key}">
            <label>模型名称</label>
            <input type="text" id="ss-model" class="ss-input" value="${CONFIG.model}">
            <button id="ss-save" class="ss-btn ss-btn-primary">保存配置</button>
        </div>

        <div class="ss-tab-bar">
            <div class="ss-tab active" data-target="tab-summary">总结</div>
            <div class="ss-tab" data-target="tab-settings">设置</div>
        </div>
    </div>
    `;

    // === 初始化函数 ===
    function init() {
        // 1. 注入 HTML
        const container = document.createElement('div');
        container.innerHTML = UI_HTML;
        document.body.appendChild(container);

        // 2. 获取 DOM 元素
        const floatBtn = document.getElementById('ss-float-btn');
        const panel = document.getElementById('ss-panel');
        const closeBtn = document.getElementById('ss-close');
        const tabs = document.querySelectorAll('.ss-tab');
        
        // 3. 事件：开关面板
        floatBtn.addEventListener('click', () => {
            panel.classList.toggle('hidden');
        });
        closeBtn.addEventListener('click', () => {
            panel.classList.add('hidden');
        });

        // 4. 事件：Tab 切换
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // 移除所有激活状态
                document.querySelectorAll('.ss-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.ss-content').forEach(c => c.classList.add('hidden'));
                
                // 激活当前
                tab.classList.add('active');
                document.getElementById(tab.dataset.target).classList.remove('hidden');
            });
        });

        // 5. 事件：保存设置
        document.getElementById('ss-save').addEventListener('click', () => {
            const url = document.getElementById('ss-url').value;
            const key = document.getElementById('ss-key').value;
            const model = document.getElementById('ss-model').value;

            localStorage.setItem('ss_url', url);
            localStorage.setItem('ss_key', key);
            localStorage.setItem('ss_model', model);
            
            CONFIG.url = url; CONFIG.key = key; CONFIG.model = model;
            alert('配置已保存！');
        });

        // 6. 事件：生成总结 (核心逻辑)
        document.getElementById('ss-btn-gen').addEventListener('click', async () => {
            const btn = document.getElementById('ss-btn-gen');
            const output = document.getElementById('ss-output');
            
            // 获取 SillyTavern 的聊天记录
            // 注意：window.chat 是 SillyTavern 全局变量，如果没有则使用模拟数据
            let chatLog = [];
            if (typeof window.SillyTavern !== 'undefined' && window.SillyTavern.getContext) {
                chatLog = window.SillyTavern.getContext().chat; 
            } else if (window.chat) {
                chatLog = window.chat;
            } else {
                output.value = "未找到 SillyTavern 聊天记录 (window.chat 未定义)";
                return;
            }

            // 计算范围
            let start = parseInt(document.getElementById('ss-start').value) || 0;
            let end = parseInt(document.getElementById('ss-end').value) || (chatLog.length - 1);
            
            // 提取文本
            const slice = chatLog.slice(start, end + 1);
            if (slice.length === 0) {
                alert('所选范围内没有消息');
                return;
            }

            const textContent = slice.map(msg => `${msg.name}: ${msg.mes}`).join('\n');
            
            // UI 状态更新
            btn.innerText = "生成中...";
            btn.disabled = true;
            output.value = "正在请求 API...";

            try {
                const result = await callApi(textContent);
                output.value = result;
            } catch (err) {
                output.value = "错误: " + err.message;
            } finally {
                btn.innerText = "生成剧情总结";
                btn.disabled = false;
            }
        });

        // 7. 悬浮球拖拽逻辑 (简单版)
        let isDragging = false;
        let dragOffsets = { x: 0, y: 0 };

        floatBtn.addEventListener('touchstart', (e) => {
            isDragging = true;
            const touch = e.touches[0];
            dragOffsets.x = touch.clientX - floatBtn.getBoundingClientRect().left;
            dragOffsets.y = touch.clientY - floatBtn.getBoundingClientRect().top;
        }, {passive: false});

        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const touch = e.touches[0];
            floatBtn.style.left = (touch.clientX - dragOffsets.x) + 'px';
            floatBtn.style.top = (touch.clientY - dragOffsets.y) + 'px';
            floatBtn.style.right = 'auto'; // 清除默认 right
            e.preventDefault(); // 防止滚动
        }, {passive: false});

        document.addEventListener('touchend', () => isDragging = false);
    }

    // === API 调用函数 ===
    async function callApi(content) {
        const endpoint = CONFIG.url.endsWith('/') ? CONFIG.url + 'chat/completions' : CONFIG.url + '/chat/completions';
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.key}`
            },
            body: JSON.stringify({
                model: CONFIG.model,
                messages: [
                    { role: "system", content: CONFIG.prompt },
                    { role: "user", content: content }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    // 启动扩展
    // 稍微延迟一下确保 ST 加载完毕
    setTimeout(init, 2000);

})();
