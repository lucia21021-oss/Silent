(function() {
    // === 1. 初始化 ===
    const STATE = {
        config: {
            url: localStorage.getItem('ss_url') || 'https://api.openai.com/v1',
            key: localStorage.getItem('ss_key') || '',
            model: localStorage.getItem('ss_model') || 'gpt-3.5-turbo',
            prompt: localStorage.getItem('ss_prompt') || '# 剧情总结助手\n\n【核心事件】...',
            ballVisible: localStorage.getItem('ss_ball_visible') === 'true'
        },
        history: JSON.parse(localStorage.getItem('ss_history') || '[]'),
        autoTimer: null
    };

    const style = document.createElement('style');
    style.textContent = `/* 侧边栏样式 */.ss-drawer-content { padding: 8px; background: rgba(0,0,0,0.2); }.ss-setting-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }.ss-full-input { width: 100%; background: #ffffff; color: #000; padding: 6px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }.ss-btn-sidebar { flex: 1; background: #374151; color: #eee; border: 1px solid #4b5563; padding: 6px; cursor: pointer; border-radius: 4px; font-size: 12px; display: flex; align-items: center; justify-content: center; gap:4px; }.ss-btn-sidebar:hover { background: #4b5563; }.ss-btn-action { background: #1f2937; margin-bottom: 8px; width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #374151; cursor: pointer; color: white; font-weight: bold; }.ss-btn-action:hover { background: #374151; }.ss-toggle-on { background: #059669; border-color: #047857; }/* 悬浮球 */#ss-float-btn {    position: fixed; bottom: 100px; right: 20px;    width: 48px; height: 48px;    background: #4f46e5; border-radius: 50%;    color: white; display: none; /* 默认隐藏 */    align-items: center; justify-content: center;    box-shadow: 0 4px 15px rgba(0,0,0,0.5);    z-index: 20000; cursor: pointer; font-size: 20px;    border: 2px solid rgba(255,255,255,0.2);    user-select: none; touch-action: none; transition: transform 0.1s;}#ss-float-btn:active { transform: scale(0.9); }/* 主面板 */#ss-panel {    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);    width: 90%; max-width: 420px; height: 80vh;    background-color: #111827; border: 1px solid #374151;    border-radius: 12px; box-shadow: 0 0 50px rgba(0,0,0,0.9);    z-index: 20001; display: none; flex-direction: column;    color: #e5e7eb; font-family: sans-serif;    font-size: 14px;}.ss-header { padding: 12px 16px; background: #1f2937; border-bottom: 1px solid #374151; display: flex; justify-content: space-between; align-items: center; font-weight: bold; }.ss-content { flex: 1; overflow-y: auto; padding: 16px; display: none; }.ss-content.active { display: block; }.ss-tab-bar { display: flex; background: #1f2937; border-top: 1px solid #374151; overflow-x: auto; flex-shrink: 0; }.ss-tab { flex: 1; text-align: center; padding: 12px 0; font-size: 11px; color: #9ca3af; cursor: pointer; border-bottom: 2px solid transparent; }.ss-tab.active { color: #818cf8; background: rgba(79, 70, 229, 0.05); border-bottom-color: #818cf8; }/* 通用控件 */.ss-textarea { width: 100%; box-sizing: border-box; resize: vertical; padding: 8px; border-radius: 6px; font-family: inherit; }.ss-textarea-light { background: #fff; color: #000; border: 1px solid #ccc; }.ss-textarea-dark { background: rgba(0,0,0,0.3); color: #e5e7eb; border: 1px solid #4b5563; }.ss-input-dark { width: 100%; background: #030712; border: 1px solid #374151; color: white; padding: 8px; border-radius: 6px; margin-bottom: 10px; box-sizing: border-box; }.ss-btn-primary { background: #4f46e5; color: white; border: none; padding: 10px; width: 100%; border-radius: 6px; cursor: pointer; font-weight: bold; }.ss-btn-danger { background: #7f1d1d; color: #fecaca; }.ss-label { display: block; font-size: 12px; color: #9ca3af; margin-bottom: 4px; }.ss-hist-item { padding: 10px; border: 1px solid #374151; border-radius: 6px; margin-bottom: 8px; background: #1f2937; cursor: pointer; }`;
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
    
    // 切换Tab辅助函数
    window.ssActivateTab = (tabId) => {
        document.querySelectorAll('.ss-tab').forEach(t => {
            if(t.dataset.t === tabId) t.classList.add('active');
            else t.classList.remove('active');
        });
        document.querySelectorAll('.ss-content').forEach(c => {
            if(c.id === tabId) c.classList.add('active');
            else c.classList.remove('active');
        });
    };
        // === 2. 侧边栏构建 ===
    function injectSidebar() {
        const container = document.getElementById('extensions_settings');
        if (!container) return setTimeout(injectSidebar, 1000); 
        if ($('ss-drawer')) return; 

        const html = `
        <div class="inline-drawer" id="ss-drawer">
            <div class="inline-drawer-header inline-drawer-toggle" id="ss-drawer-header">
                <b>⚡ 剧情总结助手</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down" id="ss-drawer-icon"></div>
            </div>
            <div class="inline-drawer-content" id="ss-drawer-content" style="display:none">
                <div class="ss-setting-row">
                    <input id="ss-sb-start" class="ss-full-input" type="number" placeholder="起始(0)">
                    <input id="ss-sb-end" class="ss-full-input" type="number" placeholder="结束(末)">
                </div>
                
                <div class="ss-setting-row">
                    <button id="ss-sb-toggle-prompt" class="ss-btn-sidebar">📝 编辑提示词</button>
                </div>
                <textarea id="ss-sb-prompt" class="ss-textarea ss-textarea-light" style="display:none; height:100px; margin-bottom:8px">${STATE.config.prompt}</textarea>
                
                <button id="ss-sb-gen" class="ss-btn-action">⚡ 立即总结</button>
                <textarea id="ss-sb-out" class="ss-textarea ss-textarea-light" style="height:100px; margin-bottom:8px" placeholder="结果..."></textarea>
                
                <div class="ss-setting-row">
                    <button id="ss-sb-copy" class="ss-btn-sidebar">复制结果</button>
                    <button id="ss-sb-api" class="ss-btn-sidebar" style="background:#3b82f6; border-color:#2563eb">⚙️ API管理</button>
                </div>
                
                <button id="ss-sb-ball-toggle" class="ss-btn-sidebar ${STATE.config.ballVisible?'ss-toggle-on':''}" style="width:100%">
                    ${STATE.config.ballVisible ? '🟢 悬浮球已开启' : '🔴 悬浮球已隐藏'}
                </button>
            </div>
        </div>`;
        
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        container.appendChild(wrapper);

        // 侧边栏事件
        $('ss-drawer-header').onclick = (e) => {
            e.stopPropagation();
            const c = $('ss-drawer-content');
            const icon = $('ss-drawer-icon');
            const hidden = c.style.display === 'none';
            c.style.display = hidden ? 'block' : 'none';
            icon.className = hidden ? 'inline-drawer-icon fa-solid fa-circle-chevron-up' : 'inline-drawer-icon fa-solid fa-circle-chevron-down';
        };

        $('ss-sb-toggle-prompt').onclick = () => { const p=$('ss-sb-prompt'); p.style.display = p.style.display==='none'?'block':'none'; };
        $('ss-sb-prompt').onchange = (e) => { STATE.config.prompt = e.target.value; saveConfig(); };
        $('ss-sb-copy').onclick = () => { navigator.clipboard.writeText($('ss-sb-out').value); alert('已复制'); };
        
        // 关键逻辑：API管理直接打开主面板
        $('ss-sb-api').onclick = () => {
            $('ss-panel').style.display = 'flex';
            window.ssActivateTab('tab-set'); // 跳转到设置页
        };

        // 悬浮球开关
        $('ss-sb-ball-toggle').onclick = (e) => {
            STATE.config.ballVisible = !STATE.config.ballVisible;
            updateBallState();
            saveConfig();
            e.target.innerText = STATE.config.ballVisible ? '🟢 悬浮球已开启' : '🔴 悬浮球已隐藏';
            e.target.className = `ss-btn-sidebar ${STATE.config.ballVisible?'ss-toggle-on':''}`;
        };
        
        $('ss-sb-gen').onclick = () => doSummary('ss-sb-start', 'ss-sb-end', 'ss-sb-out', 'ss-sb-gen');
    }

     // === 3. 主面板构建 ===
    function createMainUI() {
        const root = document.createElement('div');
        root.innerHTML = `
        <div id="ss-float-btn">📝</div>
        <div id="ss-panel">
            <div class="ss-header"><span>剧情助手全功能</span><span id="ss-close" style="cursor:pointer">✖</span></div>
            
            <!-- Tab 1: 总结 -->
            <div class="ss-content active" id="tab-sum">
                <div class="ss-setting-row">
                    <input id="ss-m-start" class="ss-input-dark" type="number" placeholder="起始">
                    <input id="ss-m-end" class="ss-input-dark" type="number" placeholder="结束">
                </div>
                <button id="ss-m-gen" class="ss-btn-primary">生成详细总结</button>
                <textarea id="ss-m-out" class="ss-textarea ss-textarea-dark" style="height:200px; margin-top:10px"></textarea>
            </div>

            <!-- Tab 2: 隐藏 -->
            <div class="ss-content" id="tab-hide">
                <div class="ss-label">批量隐藏楼层 (仅前端视觉隐藏)</div>
                <input id="ss-hide-s" class="ss-input-dark" placeholder="起始楼层 ID">
                <input id="ss-hide-e" class="ss-input-dark" placeholder="结束楼层 ID">
                <button id="ss-do-hide" class="ss-btn-primary ss-btn-danger">执行隐藏</button>
            </div>

            <!-- Tab 3: 自动 -->
            <div class="ss-content" id="tab-auto">
                <div class="ss-setting-row" style="color:white; margin-bottom:15px">
                    <input type="checkbox" id="ss-auto-toggle" style="width:20px; height:20px">
                    <span>启用自动后台总结</span>
                </div>
                <div class="ss-label">触发间隔 (每N层)</div>
                <input id="ss-auto-int" type="number" class="ss-input-dark" value="30">
                <div id="ss-auto-status" style="color:#10b981; font-size:12px"></div>
            </div>

            <!-- Tab 4: 历史 -->
            <div class="ss-content" id="tab-hist">
                <div id="ss-hist-list"></div>
            </div>

            <!-- Tab 5: 世界书 -->
            <div class="ss-content" id="tab-wb">
                <div class="ss-label">选择目标世界书</div>
                <select id="ss-wb-select" class="ss-input-dark"></select>
                <div class="ss-label">触发关键词</div>
                <input id="ss-wb-keys" class="ss-input-dark" value="summary">
                <button id="ss-save-wb" class="ss-btn-primary">将当前总结存入条目</button>
            </div>

            <!-- Tab 6: 设置 -->
            <div class="ss-content" id="tab-set">
                <div class="ss-label">API Endpoint</div>
                <input id="ss-set-url" class="ss-input-dark" value="${STATE.config.url}">
                <div class="ss-label">API Key</div>
                <input id="ss-set-key" class="ss-input-dark" type="password" value="${STATE.config.key}">
                <div class="ss-label">Model Name</div>
                <input id="ss-set-model" class="ss-input-dark" value="${STATE.config.model}">
                <button id="ss-set-save" class="ss-btn-primary">保存连接配置</button>
                <hr style="border:0; border-top:1px solid #374151; margin:15px 0">
                <div class="ss-label">默认 System Prompt</div>
                <textarea id="ss-set-prompt" class="ss-textarea ss-textarea-dark" style="height:100px">${STATE.config.prompt}</textarea>
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
        updateBallState();
        bindMainEvents();
    }
    
    function updateBallState() {
        const ball = $('ss-float-btn');
        if(ball) ball.style.display = STATE.config.ballVisible ? 'flex' : 'none';
    }

     // === 4. 功能实现 ===
    async function doSummary(sId, eId, oId, btnId) {
        if(!STATE.config.key) return alert('请先配置API Key');
        const chat = getChat();
        const start = parseInt($(sId).value)||0;
        const end = parseInt($(eId).value)||(chat.length-1);
        const slice = chat.slice(start, end+1);
        
        if(!slice.length) return alert('无内容');
        const btn = $(btnId);
        const originTxt = btn.innerText;
        btn.innerText = '生成中...'; btn.disabled=true;

        try {
            const url = STATE.config.url.replace(/\/+$/, '');
            const ep = url.includes('v1') ? `${url}/chat/completions` : `${url}/v1/chat/completions`;
            const res = await fetch(ep, {
                method:'POST',
                headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${STATE.config.key}`},
                body:JSON.stringify({
                    model: STATE.config.model,
                    messages:[{role:"system", content:STATE.config.prompt}, {role:"user", content:slice.map(m=>`${m.name}: ${m.mes}`).join('\n')}],
                    temperature:0.7
                })
            });
            const d = await res.json();
            const txt = d.choices?.[0]?.message?.content || "Error";
            $(oId).value = txt;
            STATE.history.unshift({time:new Date().toLocaleTimeString(), content:txt});
            localStorage.setItem('ss_history', JSON.stringify(STATE.history));
            if(window.renderHist) window.renderHist();
        } catch(e) { $(oId).value = "Error: "+e.message; }
        
        btn.innerText = originTxt; btn.disabled=false;
    }

    function bindMainEvents() {
        // 拖拽
        const ball = $('ss-float-btn');
        let isDragging=false, offX=0, offY=0;
        ball.addEventListener('touchstart', e=>{ isDragging=true; offX=e.touches[0].clientX-ball.offsetLeft; offY=e.touches[0].clientY-ball.offsetTop; });
        document.addEventListener('touchmove', e=>{ if(isDragging){ e.preventDefault(); ball.style.left=(e.touches[0].clientX-offX)+'px'; ball.style.top=(e.touches[0].clientY-offY)+'px'; ball.style.right='auto'; ball.style.bottom='auto'; } }, {passive:false});
        document.addEventListener('touchend', ()=>isDragging=false);
        ball.onclick = () => { if(!isDragging) $('ss-panel').style.display = 'flex'; };
        
        $('ss-close').onclick = () => $('ss-panel').style.display = 'none';

        // Tabs
        document.querySelectorAll('.ss-tab').forEach(t => t.onclick = () => {
            window.ssActivateTab(t.dataset.t);
            if(t.dataset.t==='tab-hist') window.renderHist();
            if(t.dataset.t==='tab-wb') window.refreshWB();
        });

        // 绑定事件
        $('ss-m-gen').onclick = () => doSummary('ss-m-start', 'ss-m-end', 'ss-m-out', 'ss-m-gen');
        $('ss-set-save').onclick = () => {
            STATE.config.url = $('ss-set-url').value;
            STATE.config.key = $('ss-set-key').value;
            STATE.config.model = $('ss-set-model').value;
            STATE.config.prompt = $('ss-set-prompt').value;
            saveConfig(); alert('已保存');
        };

        // 历史与世界书
        window.renderHist = () => {
            const c=$('ss-hist-list'); c.innerHTML='';
            STATE.history.forEach(h=>{
                const d=document.createElement('div'); d.className='ss-hist-item';
                d.innerHTML=`<b>${h.time}</b><div style="font-size:11px;color:#aaa;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${h.content}</div>`;
                d.onclick=()=>$('ss-m-out').value=h.content;
                c.appendChild(d);
            });
        };
        window.refreshWB = () => {
            const s=$('ss-wb-select'); s.innerHTML='';
            const wb = window.world_info || {};
            Object.keys(wb).forEach(k=>{ const o=document.createElement('option'); o.value=k; o.innerText=k; s.appendChild(o); });
        };
        $('ss-save-wb').onclick = () => alert('需ST环境支持 (API缺失)');
        $('ss-do-hide').onclick = () => alert('需ST DOM操作');
    }

    // 启动
    setTimeout(() => { injectSidebar(); createMainUI(); }, 2000);
})();

