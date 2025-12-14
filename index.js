(function() {
    // === 1. 全局状态 ===
    const STATE = {
        config: {
            url: localStorage.getItem('ss_url') || 'https://api.openai.com/v1',
            key: localStorage.getItem('ss_key') || '',
            model: localStorage.getItem('ss_model') || 'gpt-3.5-turbo',
            prompt: localStorage.getItem('ss_prompt') || '# 剧情总结助手\n\n【核心事件】...',
            ballVisible: localStorage.getItem('ss_ball_visible') === 'true'
        },
        history: JSON.parse(localStorage.getItem('ss_history') || '[]'),
        autoTimer: null,
        logs: []
    };

    // === 2. 注入样式 ===
    const style = document.createElement('style');
    style.textContent = `/* Silent Summarizer Styles *//* 侧边栏注入样式 */.ss-drawer-content { padding: 10px; background: rgba(0,0,0,0.2); }.ss-setting-item { margin-bottom: 12px; }.ss-setting-item label { display: block; font-size: 12px; color: #aaa; margin-bottom: 4px; }.ss-full-input { width: 100%; background: #fff; color: #000; padding: 6px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }.ss-checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; color: #eee; font-weight: bold; }/* 悬浮球 (默认隐藏) */#ss-float-btn {    position: fixed; bottom: 120px; right: 20px;    width: 50px; height: 50px;    background: #4f46e5; border-radius: 50%;    color: white; display: none; /* 由侧边栏控制显示 */    align-items: center; justify-content: center;    box-shadow: 0 4px 15px rgba(0,0,0,0.5);    z-index: 9999; cursor: pointer; font-size: 24px;    border: 2px solid rgba(255,255,255,0.2);    user-select: none; touch-action: none; transition: transform 0.1s;}#ss-float-btn:active { transform: scale(0.95); }/* 主界面面板 */#ss-panel {    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);    width: 95%; max-width: 450px; height: 85vh;    background-color: #111827; border: 1px solid #374151;    border-radius: 12px; box-shadow: 0 0 50px rgba(0,0,0,0.9);    z-index: 10000; display: none; flex-direction: column;    color: #e5e7eb; font-family: sans-serif;}.ss-header { padding: 15px; background: #1f2937; border-bottom: 1px solid #374151; display: flex; justify-content: space-between; align-items: center; font-weight: bold; }.ss-content { flex: 1; overflow-y: auto; padding: 15px; display: none; }.ss-content.active { display: block; }.ss-tab-bar { display: flex; background: #1f2937; border-top: 1px solid #374151; overflow-x: auto; flex-shrink: 0; }.ss-tab { flex: 1; text-align: center; padding: 12px 5px; font-size: 11px; color: #9ca3af; cursor: pointer; white-space: nowrap; }.ss-tab.active { color: #818cf8; background: rgba(79, 70, 229, 0.1); }/* 通用组件 */.ss-input, .ss-select { width: 100%; background: #030712; border: 1px solid #374151; color: white; padding: 8px; border-radius: 6px; margin-bottom: 10px; box-sizing: border-box; }.ss-btn { width: 100%; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; border: none; margin-bottom: 10px; color: white; display: flex; align-items: center; justify-content: center; gap: 5px; }.ss-btn-primary { background: #4f46e5; }.ss-btn-danger { background: #7f1d1d; color: #fecaca; }.ss-textarea { width: 100%; height: 120px; background: rgba(0,0,0,0.3); border: 1px solid #374151; color: #d1d5db; padding: 10px; border-radius: 8px; resize: none; box-sizing: border-box; }.ss-history-item { background: #1f2937; padding: 10px; margin-bottom: 8px; border-radius: 6px; border: 1px solid #374151; font-size: 12px; cursor: pointer; }.ss-row { display: flex; gap: 10px; }`;
    document.head.appendChild(style);

    // 辅助函数
    const $ = (id) => document.getElementById(id);
    const saveConfig = () => {
        localStorage.setItem('ss_url', STATE.config.url);
        localStorage.setItem('ss_key', STATE.config.key);
        localStorage.setItem('ss_model', STATE.config.model);
        localStorage.setItem('ss_prompt', STATE.config.prompt);
        localStorage.setItem('ss_ball_visible', STATE.config.ballVisible);
    };
    const getChat = () => (window.SillyTavern && window.SillyTavern.getContext) ? window.SillyTavern.getContext().chat : (window.chat || []);
        // === 3. 侧边栏注入 ===
    function injectSidebar() {
        const container = document.getElementById('extensions_settings');
        if (!container) return setTimeout(injectSidebar, 1000); // 等待 ST 加载

        if ($('ss-drawer-content')) return; // 防止重复注入

        const html = `
        <div class="inline-drawer">
            <div class="inline-drawer-header inline-drawer-toggle" id="ss-drawer-toggle">
                <b>⚡ 剧情总结助手 V35</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
            </div>
            <div class="inline-drawer-content" id="ss-drawer-content" style="display:none">
                <div class="ss-setting-item">
                    <label>API URL</label>
                    <input id="ss-sb-url" class="ss-full-input" type="text" value="${STATE.config.url}">
                </div>
                <div class="ss-setting-item">
                    <label>API Key</label>
                    <input id="ss-sb-key" class="ss-full-input" type="password" value="${STATE.config.key}">
                </div>
                <div class="ss-setting-item">
                    <label>模型名称</label>
                    <input id="ss-sb-model" class="ss-full-input" type="text" value="${STATE.config.model}">
                </div>
                <div class="ss-setting-item">
                    <label class="ss-checkbox-label">
                        <input type="checkbox" id="ss-sb-ball" ${STATE.config.ballVisible ? 'checked' : ''}>
                        显示悬浮球 (开启后点击球体打开主面板)
                    </label>
                </div>
                <button id="ss-sb-save" class="menu_button">保存设置</button>
            </div>
        </div>`;
        
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        container.appendChild(wrapper);

        // 绑定侧边栏事件
        $('ss-drawer-toggle').onclick = () => {
            const content = $('ss-drawer-content');
            content.style.display = content.style.display === 'none' ? 'block' : 'none';
        };
        $('ss-sb-save').onclick = () => {
            STATE.config.url = $('ss-sb-url').value;
            STATE.config.key = $('ss-sb-key').value;
            STATE.config.model = $('ss-sb-model').value;
            STATE.config.ballVisible = $('ss-sb-ball').checked;
            saveConfig();
            updateBallVisibility();
            alert('设置已保存');
        };
        $('ss-sb-ball').onchange = (e) => {
            STATE.config.ballVisible = e.target.checked;
            updateBallVisibility();
            saveConfig();
        }
    }
        // === 4. 主界面构建 ===
    function createMainUI() {
        const root = document.createElement('div');
        root.innerHTML = `
        <div id="ss-float-btn">📝</div>
        <div id="ss-panel">
            <div class="ss-header">
                <span>剧情助手功能面板</span>
                <span id="ss-close" style="cursor:pointer">✖</span>
            </div>
            
            <!-- Tab 1: 总结 -->
            <div class="ss-content active" id="tab-sum">
                <div class="ss-row">
                    <input type="number" id="ss-start" class="ss-input" placeholder="起始楼层">
                    <input type="number" id="ss-end" class="ss-input" placeholder="结束楼层">
                </div>
                <button id="ss-do-sum" class="ss-btn ss-btn-primary">生成总结</button>
                <textarea id="ss-out" class="ss-textarea" placeholder="结果..."></textarea>
            </div>

            <!-- Tab 2: 隐藏 -->
            <div class="ss-content" id="tab-hide">
                <div class="ss-row">
                    <input type="number" id="ss-hide-s" class="ss-input" placeholder="Start">
                    <input type="number" id="ss-hide-e" class="ss-input" placeholder="End">
                </div>
                <button id="ss-do-hide" class="ss-btn ss-btn-danger">执行隐藏</button>
                <button id="ss-reset-hide" class="ss-btn" style="background:#374151">恢复可见</button>
            </div>

            <!-- Tab 3: 自动 -->
            <div class="ss-content" id="tab-auto">
                <label class="ss-checkbox-label" style="color:#fff; margin-bottom:10px">
                    <input type="checkbox" id="ss-auto-toggle"> 启用自动托管
                </label>
                <input type="number" id="ss-auto-int" class="ss-input" placeholder="间隔 (层)" value="30">
                <div id="ss-auto-status" style="font-size:12px; color:#059669"></div>
            </div>

            <!-- Tab 4: 历史 -->
            <div class="ss-content" id="tab-hist">
                <div id="ss-hist-list"></div>
            </div>

            <!-- Tab 5: 世界书 -->
            <div class="ss-content" id="tab-wb">
                <select id="ss-wb-select" class="ss-select"></select>
                <button id="ss-save-wb" class="ss-btn ss-btn-primary">存入当前总结</button>
            </div>

            <!-- Tab 6: 更多设置 -->
            <div class="ss-content" id="tab-set">
                <div class="ss-setting-item"><label>Prompt</label><textarea id="ss-prompt" class="ss-textarea">${STATE.config.prompt}</textarea></div>
                <button id="ss-sync-save" class="ss-btn ss-btn-primary">保存提示词</button>
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
        updateBallVisibility();
        bindMainEvents();
    }
    
    function updateBallVisibility() {
        const ball = $('ss-float-btn');
        if(ball) ball.style.display = STATE.config.ballVisible ? 'flex' : 'none';
    }
        // === 5. 核心逻辑 ===
    async function generateSummary(text) {
        const url = STATE.config.url.replace(/\/+$/, '');
        const endpoint = url.includes('v1') ? `${url}/chat/completions` : `${url}/v1/chat/completions`;
        
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
        return data.choices?.[0]?.message?.content || "Error";
    }

    function bindMainEvents() {
        const panel = $('ss-panel');
        // 拖拽逻辑
        let isDragging=false, offX=0, offY=0;
        const ball = $('ss-float-btn');
        ball.addEventListener('touchstart', e=>{ isDragging=true; offX=e.touches[0].clientX-ball.offsetLeft; offY=e.touches[0].clientY-ball.offsetTop; });
        document.addEventListener('touchmove', e=>{ if(isDragging){ e.preventDefault(); ball.style.left=(e.touches[0].clientX-offX)+'px'; ball.style.top=(e.touches[0].clientY-offY)+'px'; ball.style.right='auto'; ball.style.bottom='auto'; } }, {passive:false});
        document.addEventListener('touchend', ()=>isDragging=false);
        ball.onclick = (e) => { if(!isDragging) panel.style.display = 'flex'; };
        $('ss-close').onclick = () => panel.style.display = 'none';

        // Tab 切换
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

        // 生成总结
        $('ss-do-sum').onclick = async () => {
            const btn = $('ss-do-sum');
            const chat = getChat();
            const start = parseInt($('ss-start').value)||0;
            const end = parseInt($('ss-end').value)||(chat.length-1);
            const slice = chat.slice(start, end+1);
            if(!slice.length) return alert('范围无效');
            
            btn.innerText = '生成中...';
            try {
                const text = slice.map(m => `${m.name}: ${m.mes}`).join('\n');
                const res = await generateSummary(text);
                $('ss-out').value = res;
                STATE.history.unshift({id:Date.now(), time:new Date().toLocaleTimeString(), content:res});
                localStorage.setItem('ss_history', JSON.stringify(STATE.history));
            } catch(e) { $('ss-out').value = 'Err: ' + e.message; }
            btn.innerText = '生成总结';
        };
                // 隐藏/显示
        $('ss-do-hide').onclick = () => {
            const s = parseInt($('ss-hide-s').value), e = parseInt($('ss-hide-e').value);
            // ST Specific: manipulate DOM or chat object
            alert('需在ST环境中操作DOM，此处仅演示逻辑');
        };

        // 自动托管
        $('ss-auto-toggle').onchange = (e) => {
            if(e.target.checked) {
                STATE.autoTimer = setInterval(() => {
                    $('ss-auto-status').innerText = `监控中...当前楼层 ${getChat().length}`;
                }, 5000);
            } else clearInterval(STATE.autoTimer);
        };

        // 历史记录
        window.renderHist = () => {
            const c = $('ss-hist-list'); c.innerHTML = '';
            STATE.history.forEach(h => {
                const d = document.createElement('div'); d.className = 'ss-history-item';
                d.innerText = `[${h.time}] ${h.content.slice(0,50)}...`;
                d.onclick = () => $('ss-out').value = h.content;
                c.appendChild(d);
            });
        };

        // 世界书
        window.refreshWB = () => {
            const sel = $('ss-wb-select'); sel.innerHTML = '';
            const wb = window.world_info || {}; 
            Object.keys(wb).forEach(k => { const o = document.createElement('option'); o.value=k; o.innerText=k; sel.appendChild(o); });
        };
        $('ss-save-wb').onclick = () => alert('尝试写入世界书 (需ST API支持)');

        // 保存 Prompt
        $('ss-sync-save').onclick = () => {
            STATE.config.prompt = $('ss-prompt').value;
            saveConfig();
            alert('提示词已保存');
        };
    }

    // === 6. 启动 ===
    setTimeout(() => {
        injectSidebar();
        createMainUI();
    }, 2000);
})();
