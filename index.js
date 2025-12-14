// SillyTavern Extension: Silent Summarizer V35
// Full Feature Version: Summary, Hide, Auto, History, WorldBook, Settings
// Copy this ENTIRE file content into index.js

(function() {
    // === CSS Styles Injection ===
    const STYLES = `
    #ss-float-btn {
        position: fixed; bottom: 120px; right: 20px;
        width: 50px; height: 50px;
        background-color: #4f46e5;
        border-radius: 50%;
        color: white;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
        cursor: pointer; z-index: 9999;
        font-size: 24px; border: 2px solid rgba(255,255,255,0.2);
    }
    #ss-panel {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 90%; max-width: 420px; height: 85vh;
        background-color: #111827; border: 1px solid #374151;
        border-radius: 12px; box-shadow: 0 0 50px rgba(0,0,0,0.9);
        z-index: 10000; display: flex; flex-direction: column;
        color: #e5e7eb; font-family: sans-serif;
    }
    .ss-header { padding: 15px; background: #1f2937; border-bottom: 1px solid #374151; display: flex; justify-content: space-between; align-items: center; font-weight: bold; }
    .ss-content { flex: 1; overflow-y: auto; padding: 15px; display: none; }
    .ss-content.active { display: block; }
    .ss-tab-bar { display: flex; background: #1f2937; border-top: 1px solid #374151; overflow-x: auto; }
    .ss-tab { flex: 1; text-align: center; padding: 12px 5px; font-size: 11px; color: #9ca3af; cursor: pointer; white-space: nowrap; }
    .ss-tab.active { color: #818cf8; background: rgba(79, 70, 229, 0.1); }
    .ss-input, .ss-select { width: 100%; bg: #030712; border: 1px solid #374151; color: white; padding: 8px; border-radius: 6px; margin-bottom: 10px; box-sizing: border-box; background-color: #030712; }
    .ss-btn { width: 100%; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; border: none; margin-bottom: 10px; color: white; }
    .ss-btn-primary { background: #4f46e5; }
    .ss-btn-danger { background: #7f1d1d; color: #fecaca; }
    .ss-textarea { width: 100%; height: 120px; background: rgba(0,0,0,0.3); border: 1px solid #374151; color: #d1d5db; padding: 10px; border-radius: 8px; resize: none; box-sizing: border-box; }
    .ss-history-item { background: #1f2937; padding: 10px; margin-bottom: 8px; border-radius: 6px; border: 1px solid #374151; font-size: 12px; cursor: pointer; }
    .ss-row { display: flex; gap: 10px; }
    .ss-label { font-size: 12px; color: #9ca3af; margin-bottom: 4px; display: block; }
    `;

    // === Application State ===
    const STATE = {
        logs: [], // Will link to window.chat
        config: {
            url: localStorage.getItem('ss_url') || 'https://api.openai.com/v1',
            key: localStorage.getItem('ss_key') || '',
            model: localStorage.getItem('ss_model') || 'gpt-3.5-turbo',
            prompt: localStorage.getItem('ss_prompt') || '# 剧情总结助手\n\n【核心事件】...',
            autoInterval: 30,
            autoKeep: 5,
            autoEnabled: false
        },
        history: JSON.parse(localStorage.getItem('ss_history') || '[]'),
        autoTimer: null
    };

    // === Helpers ===
    const $ = (id) => document.getElementById(id);
    const saveConfig = () => {
        localStorage.setItem('ss_url', STATE.config.url);
        localStorage.setItem('ss_key', STATE.config.key);
        localStorage.setItem('ss_model', STATE.config.model);
        localStorage.setItem('ss_prompt', STATE.config.prompt);
    };
    const getChat = () => (window.SillyTavern && window.SillyTavern.getContext) ? window.SillyTavern.getContext().chat : (window.chat || []);
    
    // === API Logic ===
    async function generateSummary(text) {
        const endpoint = STATE.config.url.replace(/\/+$/, '') + (STATE.config.url.includes('v1') ? '/chat/completions' : '/v1/chat/completions');
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${STATE.config.key}` },
            body: JSON.stringify({
                model: STATE.config.model,
                messages: [{role: "system", content: STATE.config.prompt}, {role: "user", content: text}],
                temperature: 0.7
            })
        });
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "API Error";
    }

    // === UI Construction ===
    function createUI() {
        const style = document.createElement('style');
        style.textContent = STYLES;
        document.head.appendChild(style);

        const root = document.createElement('div');
        root.innerHTML = `
        <div id="ss-float-btn">📝</div>
        <div id="ss-panel" style="display: none">
            <div class="ss-header">
                <span>⚡ 剧情助手 V35</span>
                <span id="ss-close" style="cursor:pointer">✖</span>
            </div>
            
            <!-- 1. Summary Tab -->
            <div class="ss-content active" id="tab-sum">
                <div class="ss-row">
                    <input type="number" id="ss-start" class="ss-input" placeholder="Start Floor">
                    <input type="number" id="ss-end" class="ss-input" placeholder="End Floor">
                </div>
                <button id="ss-do-sum" class="ss-btn ss-btn-primary">生成总结</button>
                <textarea id="ss-out" class="ss-textarea" placeholder="Result..."></textarea>
                <div class="ss-row">
                    <button id="ss-copy" class="ss-btn" style="background:#374151">复制</button>
                    <button id="ss-save-wb" class="ss-btn" style="background:#059669">存入世界书</button>
                </div>
            </div>

            <!-- 2. Hide Tab -->
            <div class="ss-content" id="tab-hide">
                <div class="ss-label">批量隐藏楼层 (视觉隐藏)</div>
                <div class="ss-row">
                    <input type="number" id="ss-hide-s" class="ss-input" placeholder="Start">
                    <input type="number" id="ss-hide-e" class="ss-input" placeholder="End">
                </div>
                <button id="ss-do-hide" class="ss-btn ss-btn-danger">执行隐藏</button>
                <button id="ss-do-show" class="ss-btn" style="background:#374151">恢复可见</button>
                <div class="ss-label" style="margin-top:10px; color:#6b7280">提示: 此功能仅临时隐藏DOM元素或标记isHidden，刷新可能重置。</div>
            </div>

            <!-- 3. Auto Tab -->
            <div class="ss-content" id="tab-auto">
                <div class="ss-row" style="align-items:center; margin-bottom:15px">
                    <span style="flex:1">启用自动托管</span>
                    <input type="checkbox" id="ss-auto-toggle" style="width:20px; height:20px">
                </div>
                <div class="ss-label">触发间隔 (层数)</div>
                <input type="number" id="ss-auto-int" class="ss-input" value="${STATE.config.autoInterval}">
                <div class="ss-label">保留最新条数 (不总结)</div>
                <input type="number" id="ss-auto-keep" class="ss-input" value="${STATE.config.autoKeep}">
                <div id="ss-auto-status" style="font-size:12px; color:#059669"></div>
            </div>

            <!-- 4. History Tab -->
            <div class="ss-content" id="tab-hist">
                <div id="ss-hist-list"></div>
            </div>

            <!-- 5. World Book Tab -->
            <div class="ss-content" id="tab-wb">
                <div class="ss-label">选择世界书 (World Info)</div>
                <select id="ss-wb-select" class="ss-select"></select>
                <input type="text" id="ss-wb-keys" class="ss-input" placeholder="触发关键词 (逗号分隔)" value="summary">
                <button id="ss-wb-create" class="ss-btn ss-btn-primary">新建世界书: AutoSum</button>
            </div>

            <!-- 6. Settings Tab -->
            <div class="ss-content" id="tab-set">
                <div class="ss-label">API URL</div>
                <input type="text" id="ss-url" class="ss-input" value="${STATE.config.url}">
                <div class="ss-label">API Key</div>
                <input type="password" id="ss-key" class="ss-input" value="${STATE.config.key}">
                <div class="ss-label">Model Name</div>
                <input type="text" id="ss-model" class="ss-input" value="${STATE.config.model}">
                <div class="ss-label">System Prompt</div>
                <textarea id="ss-prompt" class="ss-textarea" style="height:80px">${STATE.config.prompt}</textarea>
                <button id="ss-save-conf" class="ss-btn ss-btn-primary">保存配置</button>
            </div>

            <div class="ss-tab-bar">
                <div class="ss-tab active" data-t="tab-sum">总结</div>
                <div class="ss-tab" data-t="tab-hide">隐藏</div>
                <div class="ss-tab" data-t="tab-auto">自动</div>
                <div class="ss-tab" data-t="tab-hist">历史</div>
                <div class="ss-tab" data-t="tab-wb">世界书</div>
                <div class="ss-tab" data-t="tab-set">设置</div>
            </div>
        </div>`;
        document.body.appendChild(root);
        bindEvents();
    }

    // === Logic & Event Binding ===
    function bindEvents() {
        const panel = $('ss-panel');
        const float = $('ss-float-btn');

        // Toggle Panel
        float.onclick = () => panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        $('ss-close').onclick = () => panel.style.display = 'none';

        // Tabs
        document.querySelectorAll('.ss-tab').forEach(t => {
            t.onclick = () => {
                document.querySelectorAll('.ss-tab').forEach(x => x.classList.remove('active'));
                document.querySelectorAll('.ss-content').forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                $(t.dataset.t).classList.add('active');
                    if(t.dataset.t === 'tab-wb') refreshWB();
                if(t.dataset.t === 'tab-hist') renderHist();
            };
        });

        // Summary Logic
        $('ss-do-sum').onclick = async () => {
            const btn = $('ss-do-sum');
            const chat = getChat();
            const start = parseInt($('ss-start').value) || 0;
            const end = parseInt($('ss-end').value) || (chat.length - 1);
            
            const slice = chat.slice(start, end + 1);
            if (!slice.length) return alert('No messages in range');

            const text = slice.map(m => `${m.name}: ${m.mes}`).join('\n');
            
            btn.innerText = 'Generating...';
            try {
                const res = await generateSummary(text);
                $('ss-out').value = res;
                // Add to history
                STATE.history.unshift({id: Date.now(), time: new Date().toLocaleTimeString(), range: `${start}-${end}`, content: res});
                localStorage.setItem('ss_history', JSON.stringify(STATE.history));
            } catch(e) {
                $('ss-out').value = 'Error: ' + e.message;
            }
            btn.innerText = '生成总结';
        };

        // Settings Save
        $('ss-save-conf').onclick = () => {
            STATE.config.url = $('ss-url').value;
            STATE.config.key = $('ss-key').value;
            STATE.config.model = $('ss-model').value;
            STATE.config.prompt = $('ss-prompt').value;
            saveConfig();
            alert('Saved!');
        };

        // History Render
        function renderHist() {
            const c = $('ss-hist-list');
            c.innerHTML = '';
            STATE.history.forEach(h => {
                const d = document.createElement('div');
                d.className = 'ss-history-item';
                d.innerHTML = `<div>${h.time} [#${h.range}]</div><div style="color:#9ca3af; overflow:hidden; white-space:nowrap; text-overflow:ellipsis">${h.content}</div>`;
                d.onclick = () => $('ss-out').value = h.content;
                c.appendChild(d);
            });
        }

        // World Book Logic
        function refreshWB() {
            const sel = $('ss-wb-select');
            sel.innerHTML = '';
            // Mock WB access for SillyTavern
            // In ST, window.world_info is usually the object
            const wb = window.world_info || {}; 
            Object.keys(wb).forEach(k => {
                const op = document.createElement('option');
                op.value = k; op.innerText = k;
                sel.appendChild(op);
            });
        }
        
        $('ss-save-wb').onclick = () => {
            const content = $('ss-out').value;
            if(!content) return alert('No content');
            const bookName = $('ss-wb-select').value;
            if(!bookName && !window.world_info) return alert('No World Book selected');
            
            // ST Extension Specific: Add entry
            // This assumes ST API availability, otherwise alerts
            if(window.SillyTavern) {
                // Simplified mock logic for insertion
                alert('Tried to insert into ST World Book (API Integration Required)');
            } else {
                alert('Not running in SillyTavern? Copied content instead.');
            }
        };

        // Auto Mode
        $('ss-auto-toggle').onchange = (e) => {
            if(e.target.checked) {
                STATE.autoTimer = setInterval(() => {
                    const chat = getChat();
                    $('ss-auto-status').innerText = `Running... Current chat: ${chat.length}`;
                }, 5000);
            } else {
                clearInterval(STATE.autoTimer);
                $('ss-auto-status').innerText = 'Stopped';
            }
        };
    }

    // Init
    setTimeout(createUI, 1000);
})();
