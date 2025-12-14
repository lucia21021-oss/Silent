(function() {
    try {
    // === 1. 初始化配置与变量 ===
    const DEFAULT_PROMPT = `# 剧情总结助手

你是一个专业的剧情总结助手，负责分析对话文本并生成结构化的剧情总结。

## 处理规则
1. 自动识别连续的剧情对话，忽略角色设定、系统指令、OOC内容等非剧情部分
2. 以最近的连贯剧情段落作为总结范围
3. 保持第三人称客观叙述视角
4. 忽略重复性日常细节，但对于NSFW内容请保持客观描述，不过度夸张也不一笔带过。
5. 合并零散对话为连贯叙述。

## 输出格式
严格按照以下格式输出，不添加任何额外内容：

【核心事件】[用一句话概括核心主题]

• [第一关键情节点：包含主要人物动作、关键对话及情感变化，使用完整叙述句]
• [第二关键情节点：包含主要人物动作、关键对话及情感变化，使用完整叙述句]
• [后续关键情节点：保持同样格式，按时间顺序排列]

## 强制要求
- 必须输出总结，不得继续编写剧情
- 必须严格使用指定格式
- 必须基于提供的文本内容
- 必须保持第三人称客观叙述`;
    const STATE = {
        config: {
            url: localStorage.getItem('ss_url') || 'https://api.openai.com/v1',
            key: localStorage.getItem('ss_key') || '',
            model: localStorage.getItem('ss_model') || 'gpt-3.5-turbo',
            customPrompt: localStorage.getItem('ss_custom_prompt') || '', 
            ballVisible: localStorage.getItem('ss_ball_visible') === 'true'
        },
        history: JSON.parse(localStorage.getItem('ss_history') || '[]'),
        modelsList: []
    };

    // 注入CSS
    if(!document.getElementById('ss-styles')) {
        const style = document.createElement('style');
        style.id = 'ss-styles';
        style.textContent = `/* 侧边栏样式 */.ss-drawer-content { padding: 8px; background: rgba(0,0,0,0.4); border-radius: 4px; }.ss-setting-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }.ss-full-input { width: 100%; background: #ffffff; color: #000; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-size: 14px; }.ss-btn-sidebar { flex: 1; background: #374151; color: #eee; border: 1px solid #4b5563; padding: 8px; cursor: pointer; border-radius: 4px; font-size: 13px; display: flex; align-items: center; justify-content: center; gap:4px; }.ss-btn-sidebar:hover { background: #4b5563; }.ss-btn-action { background: #1f2937; margin-bottom: 8px; width: 100%; padding: 10px; border-radius: 4px; border: 1px solid #374151; cursor: pointer; color: white; font-weight: bold; font-size: 14px; }.ss-toggle-on { background: #059669; border-color: #047857; }/* 悬浮球 (最高层级) */#ss-float-btn {    position: fixed; bottom: 150px; right: 20px;    width: 48px; height: 48px;    background: #4f46e5; border-radius: 50%;    color: white; display: none; /* 默认隐藏 */    align-items: center; justify-content: center;    box-shadow: 0 4px 20px rgba(0,0,0,0.6);    z-index: 999999; cursor: pointer; font-size: 22px;    border: 2px solid rgba(255,255,255,0.3);    user-select: none; touch-action: none;}#ss-float-btn:active { transform: scale(0.9); }/* 主面板 (顶部定位) */#ss-panel {    position: fixed;     top: 5vh; left: 50%;     transform: translateX(-50%);    width: 95%; max-width: 450px;     height: 85vh;    background-color: #111827; border: 1px solid #374151;    border-radius: 12px; box-shadow: 0 10px 50px rgba(0,0,0,0.9);    z-index: 999998; display: none; flex-direction: column;    color: #e5e7eb; font-family: sans-serif; font-size: 14px;}.ss-header { padding: 12px 16px; background: #1f2937; border-bottom: 1px solid #374151; display: flex; justify-content: space-between; align-items: center; font-weight: bold; flex-shrink: 0; }.ss-content { flex: 1; overflow-y: auto; padding: 16px; display: none; }.ss-content.active { display: block; }.ss-tab-bar { display: flex; background: #1f2937; border-top: 1px solid #374151; overflow-x: auto; flex-shrink: 0; }.ss-tab { flex: 1; text-align: center; padding: 12px 0; font-size: 11px; color: #9ca3af; cursor: pointer; border-bottom: 2px solid transparent; }.ss-tab.active { color: #818cf8; background: rgba(79, 70, 229, 0.05); border-bottom-color: #818cf8; }/* 通用控件 */.ss-textarea { width: 100%; box-sizing: border-box; resize: vertical; padding: 8px; border-radius: 6px; font-family: inherit; font-size: 13px; }.ss-textarea-light { background: #fff; color: #000; border: 1px solid #ccc; }.ss-textarea-dark { background: rgba(0,0,0,0.3); color: #e5e7eb; border: 1px solid #4b5563; }.ss-input-dark { width: 100%; background: #030712; border: 1px solid #374151; color: white; padding: 8px; border-radius: 6px; margin-bottom: 10px; box-sizing: border-box; }.ss-btn-primary { background: #4f46e5; color: white; border: none; padding: 10px; width: 100%; border-radius: 6px; cursor: pointer; font-weight: bold; margin-bottom: 5px; }.ss-btn-group { display: flex; gap: 5px; margin-bottom: 10px; }.ss-label { display: block; font-size: 12px; color: #9ca3af; margin-bottom: 4px; margin-top: 8px; }`;
        document.head.appendChild(style);
    }

    const $ = (id) => document.getElementById(id);
    const saveConfig = () => {
        localStorage.setItem('ss_url', STATE.config.url);
        localStorage.setItem('ss_key', STATE.config.key);
        localStorage.setItem('ss_model', STATE.config.model);
        localStorage.setItem('ss_custom_prompt', STATE.config.customPrompt);
        localStorage.setItem('ss_ball_visible', STATE.config.ballVisible);
    };
    
    // 兼容获取聊天记录
    const getChat = () => (window.SillyTavern && window.SillyTavern.getConte
                               // === 3. 主面板构建 ===
    function createMainUI() {
        if ($('ss-panel')) return;
        const root = document.createElement('div');
        root.innerHTML = `
        <div id="ss-float-btn">📝</div>
        <div id="ss-panel">
            <div class="ss-header"><span>全功能面板</span><span id="ss-close" style="cursor:pointer">✖</span></div>
            
            <div class="ss-content active" id="tab-sum">
                <div class="ss-setting-row">
                    <input id="ss-m-start" class="ss-input-dark" type="number" placeholder="起始">
                    <input id="ss-m-end" class="ss-input-dark" type="number" placeholder="结束">
                </div>
                <button id="ss-m-gen" class="ss-btn-primary">生成详细总结</button>
                <textarea id="ss-m-out" class="ss-textarea ss-textarea-dark" style="height:200px; margin-top:10px"></textarea>
            </div>

            <div class="ss-content" id="tab-hide">
                <div class="ss-label">批量隐藏楼层</div>
                <input id="ss-hide-s" class="ss-input-dark" placeholder="起始楼层 ID">
                <input id="ss-hide-e" class="ss-input-dark" placeholder="结束楼层 ID">
                <button id="ss-do-hide" class="ss-btn-primary ss-btn-danger">执行隐藏</button>
            </div>

            <div class="ss-content" id="tab-auto">
                <div class="ss-setting-row" style="color:white;">
                    <input type="checkbox" id="ss-auto-toggle" style="width:20px; height:20px"> <span>启用自动后台总结</span>
                </div>
                <div class="ss-label">触发间隔 (每N层)</div>
                <input id="ss-auto-int" type="number" class="ss-input-dark" value="30">
                <div id="ss-auto-status" style="color:#10b981; font-size:12px; margin-top:5px"></div>
            </div>

            <div class="ss-content" id="tab-hist">
                <div id="ss-hist-list"></div>
            </div>

            <div class="ss-content" id="tab-wb">
                <div class="ss-label">目标世界书</div>
                <select id="ss-wb-select" class="ss-input-dark"></select>
                <div class="ss-label">关键词</div>
                <input id="ss-wb-keys" class="ss-input-dark" value="summary">
                <button id="ss-save-wb" class="ss-btn-primary">存入世界书</button>
            </div>

            <div class="ss-content" id="tab-set">
                <div class="ss-label" style="margin-top:0">配置存档 (5个槽位)</div>
                <div class="ss-btn-group">
                    <button class="ss-btn-sidebar" onclick="window.ssLoadProfile(1)">存档1</button>
                    <button class="ss-btn-sidebar" onclick="window.ssLoadProfile(2)">存档2</button>
                    <button class="ss-btn-sidebar" onclick="window.ssLoadProfile(3)">存档3</button>
                    <button class="ss-btn-sidebar" onclick="window.ssLoadProfile(4)">存档4</button>
                    <button class="ss-btn-sidebar" onclick="window.ssLoadProfile(5)">存档5</button>
                </div>
                <button class="ss-btn-primary" style="background:#059669; height:30px; font-size:12px; margin-bottom:15px" onclick="window.ssSaveProfile()">保存当前配置到选中存档</button>

                <div class="ss-label">API Endpoint</div>
                <input id="ss-set-url" class="ss-input-dark" value="${STATE.config.url}">
                <div class="ss-label">API Key</div>
                <input id="ss-set-key" class="ss-input-dark" type="password" value="${STATE.config.key}">
                <div class="ss-btn-group" style="margin-top:10px">
                    <button id="ss-fetch-models" class="ss-btn-primary" style="flex:1">📡 获取模型列表</button>
                </div>
                <div class="ss-label">Select Model</div>
                <select id="ss-model-select" class="ss-input-dark" style="display:none"></select>
                <input id="ss-set-model" class="ss-input-dark" value="${STATE.config.model}" placeholder="或手动输入模型名称">
                <hr style="border:0; border-top:1px solid #374151; margin:15px 0">
                <div class="ss-label">系统提示词 (留空则使用默认)</div>
                <textarea id="ss-set-prompt" class="ss-textarea ss-textarea-dark" style="height:100px" placeholder="默认提示词隐藏中...如需修改请在此输入">${STATE.config.customPrompt}</textarea>
                <button id="ss-save-prompt" class="ss-btn-primary" style="margin-top:10px">仅保存提示词</button>
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
        bindMainEvents();
        updateBallState();
    }
            // === 4. 逻辑与事件 ===
    let currentSlot = 1;
    window.ssLoadProfile = (id) => {
        currentSlot = id;
        const raw = localStorage.getItem('ss_profile_'+id);
        if(raw) {
            const p = JSON.parse(raw);
            $('ss-set-url').value = p.url || '';
            $('ss-set-key').value = p.key || '';
            $('ss-set-model').value = p.model || '';
            alert('已加载存档 '+id);
        } else alert('存档 '+id+' 为空');
    };
    window.ssSaveProfile = () => {
        const p = { url: $('ss-set-url').value, key: $('ss-set-key').value, model: $('ss-set-model').value };
        localStorage.setItem('ss_profile_'+currentSlot, JSON.stringify(p));
        STATE.config.url = p.url; STATE.config.key = p.key; STATE.config.model = p.model;
        saveConfig(); alert('已保存至存档 '+currentSlot);
    };

    async function fetchModels() {
        const url = $('ss-set-url').value.replace(/\/+$/, '');
        const key = $('ss-set-key').value;
        const btn = $('ss-fetch-models');
        if(!url) return alert('请先输入API URL');
        btn.innerText = '获取中...';
        try {
            const ep = url.includes('v1') ? `${url}/models` : `${url}/v1/models`;
            const res = await fetch(ep, { headers: { 'Authorization': `Bearer ${key}` } });
            const data = await res.json();
            const list = (data.data || data).map(m => m.id || m);
            const sel = $('ss-model-select'); sel.innerHTML = ''; sel.style.display = 'block';
            list.forEach(m => { const opt = document.createElement('option'); opt.value = m; opt.innerText = m; sel.appendChild(opt); });
            sel.onchange = () => $('ss-set-model').value = sel.value;
            alert(`获取成功，共 ${list.length} 个模型`);
        } catch(e) { alert('获取失败: '+e.message); }
        btn.innerText = '📡 获取模型列表';
    }

    async function doSummary(sId, eId, oId, btnId) {
        if(!STATE.config.key) return alert('请先在API管理中配置Key');
        const chat = getChat();
        const start = parseInt($(sId).value)||0;
        const end = parseInt($(eId).value)||(chat.length-1);
        const slice = chat.slice(start, end+1);
        if(!slice.length) return alert('该范围无内容');
        const btn = $(btnId); const originTxt = btn.innerText;
        btn.innerText = '生成中...'; btn.disabled=true;
        const finalPrompt = STATE.config.customPrompt.trim() || DEFAULT_PROMPT;
        try {
            const url = STATE.config.url.replace(/\/+$/, '');
            const ep = url.includes('v1') ? `${url}/chat/completions` : `${url}/v1/chat/completions`;
            const res = await fetch(ep, {
                method:'POST',
                headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${STATE.config.key}`},
                body:JSON.stringify({
                    model: STATE.config.model,
                    messages:[{role:"system", content:finalPrompt}, {role:"user", content:slice.map(m=>`${m.name}: ${m.mes}`).join('\n')}],
                    temperature:0.7
                })
            });
            const d = await res.json();
            const txt = d.choices?.[0]?.message?.content || "API Error";
            $(oId).value = txt;
            STATE.history.unshift({time:new Date().toLocaleTimeString(), content:txt});
            localStorage.setItem('ss_history', JSON.stringify(STATE.history));
            if(window.renderHist) window.renderHist();
        } catch(e) { $(oId).value = "Error: "+e.message; }
        btn.innerText = originTxt; btn.disabled=false;
    }

    function updateBallState() { const ball = $('ss-float-btn'); if(ball) ball.style.display = STATE.config.ballVisible ? 'flex' : 'none'; }

    function bindMainEvents() {
        const ball = $('ss-float-btn');
        let isDragging=false, offX=0, offY=0;
        ball.addEventListener('touchstart', e=>{ isDragging=true; offX=e.touches[0].clientX-ball.offsetLeft; offY=e.touches[0].clientY-ball.offsetTop; });
        document.addEventListener('touchmove', e=>{ if(isDragging){ e.preventDefault(); ball.style.left=(e.touches[0].clientX-offX)+'px'; ball.style.top=(e.touches[0].clientY-offY)+'px'; ball.style.right='auto'; ball.style.bottom='auto'; } }, {passive:false});
        document.addEventListener('touchend', ()=>isDragging=false);
        ball.onclick = () => { if(!isDragging) $('ss-panel').style.display = 'flex'; };
        $('ss-close').onclick = () => $('ss-panel').style.display = 'none';
        $('ss-m-gen').onclick = () => doSummary('ss-m-start', 'ss-m-end', 'ss-m-out', 'ss-m-gen');
        $('ss-fetch-models').onclick = fetchModels;
        $('ss-save-prompt').onclick = () => { STATE.config.customPrompt = $('ss-set-prompt').value; $('ss-sb-prompt').value = STATE.config.customPrompt; saveConfig(); alert('提示词已更新'); };
        window.ssActivateTab = (tabId) => {
            document.querySelectorAll('.ss-tab').forEach(t => t.dataset.t === tabId ? t.classList.add('active') : t.classList.remove('active'));
            document.querySelectorAll(
                
