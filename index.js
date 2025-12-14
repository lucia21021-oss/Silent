(function() {
    // === 1. 全局状态 ===
    const STATE = {
        config: {
            url: localStorage.getItem('ss_url') || 'https://api.openai.com/v1',
            key: localStorage.getItem('ss_key') || '',
            model: localStorage.getItem('ss_model') || 'gpt-3.5-turbo',
            prompt: localStorage.getItem('ss_prompt') || '# 剧情总结助手\n\n【核心事件】[一句话概括]...',
            ballVisible: localStorage.getItem('ss_ball_visible') === 'true'
        },
        history: JSON.parse(localStorage.getItem('ss_history') || '[]'),
        autoTimer: null
    };

    // 注入 CSS
    const style = document.createElement('style');
    style.textContent = `/* 侧边栏样式优化 */.ss-drawer-content { padding: 5px; background: rgba(0,0,0,0.2); }.ss-setting-row { display: flex; gap: 5px; margin-bottom: 8px; align-items: center; }.ss-full-input { width: 100%; background: #ffffff; color: #000; padding: 6px; border: 1px solid #ccc; border-radius: 4px; }.ss-btn-sidebar { width: 100%; background: #1f2937; color: #eee; border: 1px solid #374151; padding: 6px; cursor: pointer; border-radius: 4px; margin-bottom: 5px; }.ss-btn-sidebar:hover { background: #374151; }.ss-label-small { font-size: 12px; color: #888; margin-bottom: 2px; display: block; }.ss-toggle-btn { background: #059669; color: white; border: none; }.ss-toggle-off { background: #4b5563; }/* 悬浮球 (默认由侧边栏控制) */#ss-float-btn {    position: fixed; bottom: 120px; right: 20px;    width: 50px; height: 50px;    background: #4f46e5; border-radius: 50%;    color: white; display: none; /* 默认隐藏 */    align-items: center; justify-content: center;    box-shadow: 0 4px 15px rgba(0,0,0,0.5);    z-index: 9999; cursor: pointer; font-size: 24px;    border: 2px solid rgba(255,255,255,0.2);    user-select: none; touch-action: none;}/* 主面板 (全功能) */#ss-panel {    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);    width: 95%; max-width: 450px; height: 85vh;    background-color: #111827; border: 1px solid #374151;    border-radius: 12px; box-shadow: 0 0 50px rgba(0,0,0,0.9);    z-index: 10000; display: none; flex-direction: column;    color: #e5e7eb; font-family: sans-serif;}.ss-header { padding: 15px; background: #1f2937; border-bottom: 1px solid #374151; display: flex; justify-content: space-between; align-items: center; font-weight: bold; }.ss-content { flex: 1; overflow-y: auto; padding: 15px; display: none; }.ss-content.active { display: block; }.ss-tab-bar { display: flex; background: #1f2937; border-top: 1px solid #374151; overflow-x: auto; flex-shrink: 0; }.ss-tab { flex: 1; text-align: center; padding: 12px 5px; font-size: 11px; color: #9ca3af; cursor: pointer; white-space: nowrap; }.ss-tab.active { color: #818cf8; background: rgba(79, 70, 229, 0.1); }.ss-textarea { width: 100%; background: #fff; color: #000; border: 1px solid #ccc; padding: 5px; border-radius: 4px; resize: vertical; box-sizing: border-box; }.ss-textarea-dark { background: rgba(0,0,0,0.3); color: #ddd; border: 1px solid #444; }.ss-input-dark { width: 100%; background: #030712; border: 1px solid #374151; color: white; padding: 8px; border-radius: 6px; margin-bottom: 10px; }.ss-btn-primary { background: #4f46e5; color: white; border: none; padding: 10px; width: 100%; border-radius: 6px; cursor: pointer; }.ss-history-item { padding: 8px; border-bottom: 1px solid #333; cursor: pointer; }`;
    document.head.appendChild(style);

    const $ = (id) => document.getElementById(id);
    const saveConfig = () => {
        localStorage.setItem('ss_url', STATE.config.url);
        localStorage.setItem('ss_key', STATE.config.key);
        localStorage.setItem('ss_model', STATE.config.model);
        localStorage.setItem('ss_prompt', STATE.config.prompt);
        localStorage.setItem('ss_ball_visible', STATE.config.ballVisible);
    };
    const getChat = () => (window.SillyTavern && window.SillyTavern.getContext) ? window.SillyTavern.getContext().chat : (window.chat || []);
        // === 2. 侧边栏注入 ===
    function injectSidebar() {
        const container = document.getElementById('extensions_settings');
        if (!container) return setTimeout(injectSidebar, 1000); 
        if ($('ss-drawer')) return; 

        // 仅保留：楼层选择、Prompt折叠、立即总结、结果、复制、悬浮球开关
        const html = `
        <div class="inline-drawer" id="ss-drawer">
            <div class="inline-drawer-header inline-drawer-toggle" id="ss-drawer-header">
                <b>⚡ 剧情总结助手</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down" id="ss-drawer-icon"></div>
            </div>
            <div class="inline-drawer-content" id="ss-drawer-content" style="display:none">
                <div class="ss-setting-row">
                    <input id="ss-sb-start" class="ss-full-input" type="number" placeholder="起始层(0)">
                    <input id="ss-sb-end" class="ss-full-input" type="number" placeholder="结束层(末)">
                </div>
                
                <button id="ss-sb-toggle-prompt" class="ss-btn-sidebar">设置提示词 (点击展开)</button>
                <textarea id="ss-sb-prompt" class="ss-textarea" style="display:none; height:100px; margin-bottom:5px">${STATE.config.prompt}</textarea>
                
                <button id="ss-sb-gen" class="menu_button" style="width:100%; margin-bottom:5px">立即总结</button>
                <textarea id="ss-sb-out" class="ss-textarea" style="height:120px; margin-bottom:5px" placeholder="总结结果..."></textarea>
                
                <div class="ss-setting-row">
                    <button id="ss-sb-copy" class="ss-btn-sidebar" style="flex:1">复制结果</button>
                    <button id="ss-sb-ball-toggle" class="ss-btn-sidebar ${STATE.config.ballVisible?'ss-toggle-btn':'ss-toggle-off'}" style="flex:1">
                        ${STATE.config.ballVisible ? '隐藏悬浮球' : '显示悬浮球'}
                    </button>
                </div>
                <div class="ss-label-small" style="text-align:center">更多功能(历史/隐藏/世界书/API设置)请打开悬浮球</div>
            </div>
        </div>`;
        
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        container.appendChild(wrapper);

        // 修复折叠事件 (使用 stopPropagation)
        $('ss-drawer-header').onclick = (e) => {
            e.stopPropagation();
            const c = $('ss-drawer-content');
            const icon = $('ss-drawer-icon');
            const isHidden = c.style.display === 'none';
            c.style.display = isHidden ? 'block' : 'none';
            icon.className = isHidden ? 'inline-drawer-icon fa-solid fa-circle-chevron-up' : 'inline-drawer-icon fa-solid fa-circle-chevron-down';
        };

        // 事件绑定
        $('ss-sb-toggle-prompt').onclick = () => {
            const p = $('ss-sb-prompt');
            p.style.display = p.style.display === 'none' ? 'block' : 'none';
        };
        $('ss-sb-prompt').onchange = (e) => { STATE.config.prompt = e.target.value; saveConfig(); };
        $('ss-sb-ball-toggle').onclick = (e) => {
            STATE.config.ballVisible = !STATE.config.ballVisible;
            updateBallVisibility();
            saveConfig();
            e.target.innerText = STATE.config.ballVisible ? '隐藏悬浮球' : '显示悬浮球';
            e.target.className = `ss-btn-sidebar ${STATE.config.ballVisible?'ss-toggle-btn':'ss-toggle-off'}`;
        };
        $('ss-sb-copy').onclick = () => {
            navigator.clipboard.writeText($('ss-sb-out').value);
            alert('已复制');
        };
        $('ss-sb-gen').onclick = () => doSummary('ss-sb-start', 'ss-sb-end', 'ss-sb-out', 'ss-sb-gen');
    }
        // === 3. 主面板构建 ===
    function createMainUI() {
        const root = document.createElement('div');
        root.innerHTML = `
        <div id="ss-float-btn">📝</div>
        <div id="ss-panel">
            <div class="ss-header"><span>全功能面板</span><span id="ss-close" style="cursor:pointer">✖</span></div>
            
            <!-- Tab 1: 总结 -->
            <div class="ss-content active" id="tab-sum">
                <div class="ss-setting-row">
                    <input id="ss-m-start" class="ss-input-dark" type="number" placeholder="起始">
                    <input id="ss-m-end" class="ss-input-dark" type="number" placeholder="结束">
                </div>
                <button id="ss-m-gen" class="ss-btn-primary">生成总结</button>
                <textarea id="ss-m-out" class="ss-textarea ss-textarea-dark" style="height:150px; margin-top:10px"></textarea>
            </div>

            <!-- Tab 2: 隐藏 -->
            <div class="ss-content" id="tab-hide">
                <input id="ss-hide-s" class="ss-input-dark" placeholder="Start ID">
                <input id="ss-hide-e" class="ss-input-dark" placeholder="End ID">
                <button id="ss-do-hide" class="ss-btn-primary" style="background:#7f1d1d">隐藏指定范围</button>
            </div>

            <!-- Tab 3: 自动 -->
            <div class="ss-content" id="tab-auto">
                <label style="color:white"><input type="checkbox" id="ss-auto-toggle"> 开启自动托管</label>
                <div id="ss-auto-status" style="color:#059669; margin-top:10px"></div>
            </div>

            <!-- Tab 4: 历史 -->
            <div class="ss-content" id="tab-hist">
                <div id="ss-hist-list"></div>
            </div>

            <!-- Tab 5: 世界书 -->
            <div class="ss-content" id="tab-wb">
                <select id="ss-wb-select" class="ss-input-dark"></select>
                <button id="ss-save-wb" class="ss-btn-primary">存入世界书</button>
            </div>

            <!-- Tab 6: 设置 (API在这里) -->
            <div class="ss-content" id="tab-set">
                <label style="color:#aaa">API URL</label>
                <input id="ss-set-url" class="ss-input-dark" value="${STATE.config.url}">
                <label style="color:#aaa">API Key</label>
                <input id="ss-set-key" class="ss-input-dark" type="password" value="${STATE.config.key}">
                <label style="color:#aaa">Model</label>
                <input id="ss-set-model" class="ss-input-dark" value="${STATE.config.model}">
                <button id="ss-set-save" class="ss-btn-primary">保存配置</button>
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
        // === 4. 逻辑实现 ===
    async function doSummary(startId, endId, outId, btnId) {
        const chat = getChat();
        const start = parseInt($(startId).value)||0;
        const end = parseInt($(endId).value)||(chat.length-1);
        const btn = $(btnId);
        
        if(!STATE.config.key) return alert('请先在悬浮球面板->设置中配置API Key');

        const slice = chat.slice(start, end+1);
        if(!slice.length) return alert('该范围内无消息');
        const text = slice.map(m => `${m.name}: ${m.mes}`).join('\n');

        btn.innerText = '生成中...';
        btn.disabled = true;

        try {
            const url = STATE.config.url.replace(/\/+$/, '');
            const ep = url.includes('v1') ? `${url}/chat/completions` : `${url}/v1/chat/completions`;
            const res = await fetch(ep, {
                method: 'POST',
                headers: {'Content-Type':'application/json', 'Authorization':`Bearer ${STATE.config.key}`},
                body: JSON.stringify({
                    model: STATE.config.model,
                    messages: [{role:"system",content:STATE.config.prompt}, {role:"user",content:text}],
                    temperature: 0.7
                })
            });
            const data = await res.json();
            const result = data.choices?.[0]?.message?.content || "API Error";
            $(outId).value = result;
            
            // 存入历史
            STATE.history.unshift({time:new Date().toLocaleTimeString(), content: result});
            localStorage.setItem('ss_history', JSON.stringify(STATE.history));
            if(window.renderHist) window.renderHist();

        } catch(e) { $(outId).value = "Error: "+e.message; }
        btn.innerText = '立即总结';
        btn.disabled = false;
    }

    function bindMainEvents() {
        // 面板拖拽与开关
        const ball=$('ss-float-btn'), panel=$('ss-panel');
        ball.onclick = () => panel.style.display = 'flex';
        $('ss-close').onclick = () => panel.style.display = 'none';
        
        // Tab切换
        document.querySelectorAll('.ss-tab').forEach(t => {
            t.onclick = () => {
                document.querySelectorAll('.ss-tab').forEach(x => x.classList.remove('active'));
                document.querySelectorAll('.ss-content').forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                $(t.dataset.t).classList.add('active');
                if(t.dataset.t==='tab-hist') renderHist();
                if(t.dataset.t==='tab-wb') refreshWB();
            }
        });

        // 主面板功能绑定
        $('ss-m-gen').onclick = () => doSummary('ss-m-start', 'ss-m-end', 'ss-m-out', 'ss-m-gen');
        $('ss-set-save').onclick = () => {
            STATE.config.url = $('ss-set-url').value;
            STATE.config.key = $('ss-set-key').value;
            STATE.config.model = $('ss-set-model').value;
            saveConfig(); alert('配置已保存');
        };

        // 辅助功能
        window.renderHist = () => {
            const c = $('ss-hist-list'); c.innerHTML = '';
            STATE.history.forEach(h => {
                const d = document.createElement('div'); d.className='ss-history-item';
                d.innerText = `[${h.time}] ${h.content.slice(0,30)}...`;
                d.onclick=()=>$('ss-m-out').value=h.content;
                c.appendChild(d);
            });
        };
        window.refreshWB = () => {
            const s=$('ss-wb-select'); s.innerHTML='';
            const wb = window.world_info || {};
            Object.keys(wb).forEach(k=>{ const o=document.createElement('option'); o.value=k; o.innerText=k; s.appendChild(o); });
        };
        $('ss-save-wb').onclick = () => alert('需ST环境支持写入');
        $('ss-do-hide').onclick = () => alert('需ST环境支持DOM操作');
    }

    // 启动
    setTimeout(() => { injectSidebar(); createMainUI(); }, 2000);
})();
