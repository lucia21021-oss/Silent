// --- Silent Summary Extension v1.0 ---
(function() {
    // 1. 创建 UI 容器
    const rootDiv = document.createElement('div');
    rootDiv.id = 'ss-root-modal';
    document.body.appendChild(rootDiv);

    const floatBtn = document.createElement('div');
    floatBtn.id = 'ss-float-btn';
    floatBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>'; // Zap Icon
    document.body.appendChild(floatBtn);

    // 状态变量
    let isOpen = false;
    let activeTab = 0;
    let settings = { url: "https://api.openai.com/v1", key: "", model: "" };
    
    // 拖拽逻辑
    let isDragging = false;
    let startY = 0;
    floatBtn.addEventListener('touchstart', (e) => {
        isDragging = false; startY = e.touches[0].clientY;
    });
    floatBtn.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const y = e.touches[0].clientY;
        if(Math.abs(y - startY) > 5) isDragging = true;
        floatBtn.style.top = y + 'px';
    });
    floatBtn.addEventListener('touchend', (e) => {
        if(!isDragging) toggleUI();
    });
    floatBtn.addEventListener('click', () => { if(!isDragging) toggleUI(); });

    function toggleUI() {
        isOpen = !isOpen;
        rootDiv.className = isOpen ? 'active' : '';
        if(isOpen) renderApp();
    }

 // 渲染主应用
    function renderApp() {
        rootDiv.innerHTML = `
            <div style="height: 50px; background: #111827; border-bottom: 1px solid #374151; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; color: #818cf8; font-weight: bold;">
                <span>剧情助手 Pro</span>
                <button id="ss-close" style="background:none; border:none; color:#9ca3af; font-size: 20px;">×</button>
            </div>
            
            <div class="ss-scroll" style="flex: 1; overflow-y: auto; padding: 15px; color: #e5e7eb;">
                ${renderTabContent()}
            </div>

            <div style="height: 60px; background: #111827; border-top: 1px solid #374151; display: flex; justify-content: space-around; align-items: center;">
                ${['总结','隐藏','自动','历史','设置'].map((t,i) => 
                    `<button class="ss-tab-btn" data-idx="${i}" style="background:none; border:none; color: ${activeTab===i?'#818cf8':'#6b7280'}; font-size: 12px; display:flex; flex-direction:column; align-items:center;">
                        <span style="font-size:16px; margin-bottom:2px;">${['📝','👁️','⚡','📜','⚙️'][i]}</span>${t}
                    </button>`
                ).join('')}
            </div>
        `;

        // 绑定事件
        document.getElementById('ss-close').onclick = toggleUI;
        document.querySelectorAll('.ss-tab-btn').forEach(b => {
            b.onclick = () => { activeTab = parseInt(b.dataset.idx); renderApp(); };
        });
        
        bindTabEvents();
    }

 function renderTabContent() {
        if(activeTab === 0) return `
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <input id="ss-start" type="number" placeholder="开始楼层" style="flex:1; background:#1f2937; border:1px solid #374151; color:white; padding:8px; border-radius:6px;">
                <input id="ss-end" type="number" placeholder="结束楼层" style="flex:1; background:#1f2937; border:1px solid #374151; color:white; padding:8px; border-radius:6px;">
            </div>
            <button id="ss-gen-btn" style="width:100%; background:#4f46e5; color:white; padding:12px; border:none; border-radius:8px; font-weight:bold; margin-bottom:10px;">生成总结</button>
            <textarea id="ss-output" style="width:100%; height:150px; background:rgba(0,0,0,0.3); border:1px solid #374151; color:#d1d5db; padding:8px; border-radius:6px;"></textarea>
        `;
        
        if(activeTab === 4) return `
            <div style="background:#1f2937; padding:15px; border-radius:8px;">
                <h3 style="margin:0 0 10px 0; font-size:14px;">API 设置</h3>
                <input id="ss-url" value="${settings.url}" placeholder="API Endpoint" style="width:100%; margin-bottom:10px; padding:8px; background:#111827; border:1px solid #374151; color:white; border-radius:4px;">
                <input id="ss-key" type="password" value="${settings.key}" placeholder="API Key" style="width:100%; margin-bottom:10px; padding:8px; background:#111827; border:1px solid #374151; color:white; border-radius:4px;">
                <button id="ss-save-set" style="width:100%; background:#059669; color:white; padding:10px; border:none; border-radius:6px;">保存配置</button>
            </div>
        `;
        
        return `<div style="text-align:center; color:#6b7280; padding:20px;">功能开发中...</div>`;
    }

    function bindTabEvents() {
        if(activeTab === 0) {
            document.getElementById('ss-gen-btn').onclick = async () => {
                const btn = document.getElementById('ss-gen-btn');
                const out = document.getElementById('ss-output');
                btn.innerText = "生成中...";
                try {
                    // 这里模拟获取 SillyTavern 上下文 (实际需替换为 ST API)
                    const prompt = "请总结剧情。"; 
                    const res = await fetch(`${settings.url}/chat/completions`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${settings.key}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: settings.model || 'gpt-3.5-turbo',
                            messages: [{role: 'user', content: prompt}]
                        })
                    });
                    const data = await res.json();
                    out.value = data.choices[0].message.content;
                } catch(e) { out.value = "错误: " + e.message; }
                btn.innerText = "生成总结";
            };
        }
        if(activeTab === 4) {
            document.getElementById('ss-save-set').onclick = () => {
                settings.url = document.getElementById('ss-url').value;
                settings.key = document.getElementById('ss-key').value;
                alert("设置已保存");
            };
        }
    }
})();
