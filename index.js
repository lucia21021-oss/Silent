import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "silent_summarizer";
const scriptUrl = import.meta.url;
const extensionFolderPath = scriptUrl.substring(0, scriptUrl.lastIndexOf('/'));

// v16 核心提示词
const SYSTEM_PROMPT = `请将提供的对话内容总结为按时间顺序排列的核心事件列表。

【核心事件】[用一句话概括核心主题]

• [第一关键情节点：包含主要人物动作、关键对话及情感变化]
• [第二关键情节点：包含主要人物动作、关键对话及情感变化]
• [后续关键情节点：保持同样格式，按时间顺序排列]

要求：
1. 只提取推动剧情发展的核心事件
2. 每个情节点用完整叙述句描述
3. 保持第三人称客观视角
4. 忽略重复性日常细节，但对于NSFW内容请保持客观描述。`;

const WI_PROMPT = `基于以下剧情总结，生成一个世界书(World Info)条目。
提取最核心的一个名词（地点/物品/事件/概念）。

输出格式(JSON):
{
    "keys": "关键词1, 关键词2",
    "entry": "详细条目内容...",
    "depth": 2
}`;

const defaultSettings = {
    enabled: true,
    provider: 'openai',
    url: 'http://127.0.0.1:5000/v1',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    autoBookName: 'SilentSummaries',
    systemPrompt: SYSTEM_PROMPT.trim(),
    autoEnabled: false,
    autoThreshold: 20,
    autoKeep: 5
};

const state = {
    isOpen: false,
    activeTab: 'manual',
    startFloor: '', endFloor: '',
    summaryResult: '',
    wiEntries: [], availableBooks: [],
    expandedCards: new Set()
};

function getNativeCsrfToken() {
    // 优先使用导入的 getContext，这是最准确的
    if (typeof getContext !== 'undefined') return getContext().csrfToken;
    // 其次尝试全局对象
    if (window.SillyTavern?.getContext) return window.SillyTavern.getContext().csrfToken;
    // 最后尝试 Cookie
    const m = document.cookie.match(/csrf_token=([^;]+)/);
    return m ? m[1] : null;
}

async function stFetch(endpoint, options = {}) {
    const headers = options.headers || {};
    headers['Content-Type'] = 'application/json';
    headers['X-Requested-With'] = 'XMLHttpRequest';
    const token = getNativeCsrfToken();
    if (token) headers['X-CSRF-Token'] = token;
    
    // 关键修复：确保携带凭证
    const fetchOptions = { ...options, headers, credentials: 'include' };
    const res = await fetch(endpoint, fetchOptions);
    if (!res.ok) {
        if(res.status === 403) throw new Error("CSRF校验失败，请尝试刷新网页");
        throw new Error(`API Error ${res.status}`);
    }
    return res.json();
}

function getMessages() {
    const els = Array.from(document.querySelectorAll('.mes'));
    return els.map(el => {
        const id = parseInt(el.getAttribute('mesid'));
        if (isNaN(id)) return null;
        if (el.style.display === 'none' || el.classList.contains('hidden')) return { floor: id, isHidden: true };
        const n = el.querySelector('.name_text');
        const t = el.querySelector('.mes_text');
        return { floor: id, sender: n?n.innerText.trim():'?', content: t?t.innerText.trim():'', isHidden: false };
    }).filter(m => m !== null);
}

function executeSlash(cmd) {
    if (window.SillyTavern?.getContext) window.SillyTavern.getContext().executeCommand(cmd);
    else if (window.executeSlashCommands) window.executeSlashCommands(cmd);
}

async function callLlmApi(prompt, content) {
    const settings = extension_settings[extensionName];
    const { apiKey, url, provider, model } = settings;
    if (!url) throw new Error("URL未设置");
    
    let target = url;
    let body = {};
    let headers = { 'Content-Type': 'application/json' };
    
    if (provider === 'gemini') {
        if(!url.includes('key=') && apiKey) target = `${url}?key=${apiKey}`;
        body = { contents: [{ role: "user", parts: [{ text: content }] }], systemInstruction: { parts: [{ text: prompt }] } };
    } else {
        if(!target.endsWith('/chat/completions') && provider!=='openai') target = target.replace(/\/$/, '')+'/chat/completions';
        if(apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        body = { model: model||'gpt-3.5-turbo', messages: [{role:'system',content:prompt}, {role:'user',content:content}] };
    }
    
    const res = await fetch(target, { method:'POST', headers, body: JSON.stringify(body) });
    const data = await res.json();
    if(data.error) throw new Error(JSON.stringify(data.error));
    const txt = provider==='gemini' ? data.candidates?.[0]?.content?.parts?.[0]?.text : data.choices?.[0]?.message?.content;
    if(!txt) throw new Error("API返回空");
    return txt;
}

async function performSummary(s, e) {
    const msgs = getMessages().filter(m => m.floor >= s && m.floor <= e && !m.isHidden);
    if(!msgs.length) throw new Error("范围内无消息");
    const text = msgs.map(m => `${m.sender}: ${m.content}`).join('\n');
    return await callLlmApi(extension_settings[extensionName].systemPrompt, text);
}

async function performWiInjection(content, book) {
    if(!book) book = "SilentSummaries";
    let entry = { keys: "Summary", entry: content, depth: 2 };
    try {
        const raw = await callLlmApi(WI_PROMPT, content);
        const json = JSON.parse(raw.match(/\{.*\}/s)?.[0] || raw);
        entry = { ...entry, ...json };
    } catch(e) {}
    
    try {
        const newEntry = {
            name: entry.keys.split(',')[0] || "Summary",
            content: entry.entry,
            strategy: {
                type: 'selective',
                keys: entry.keys.split(',').map(k => k.trim())
            },
            position: {
                type: 'at_depth',
                depth: entry.depth || 2
            }
        };
        
        // 确保世界书存在
        let books = [];
        if (typeof getWorldbookNames === 'function') {
            books = getWorldbookNames();
        } else if (window.getWorldbookNames) {
            books = window.getWorldbookNames();
        }
        
        if (!books.includes(book)) {
            if (typeof createWorldbook === 'function') {
                await createWorldbook(book, []);
            } else if (window.createWorldbook) {
                await window.createWorldbook(book, []);
            }
        }
        
        // 插入条目
        if (typeof createWorldbookEntries === 'function') {
            await createWorldbookEntries(book, [newEntry]);
        } else if (window.createWorldbookEntries) {
            await window.createWorldbookEntries(book, [newEntry]);
        } else {
            throw new Error("找不到 createWorldbookEntries 函数，请确保 SillyTavern 版本支持");
        }
        
        alert(`✅ 已存入: ${book}`);
    } catch (err) {
        console.error(err);
        alert("保存到世界书失败: " + err.message);
    }
}

// --- UI: Tab 1 & 2 (Manual/Auto) ---
async function renderTab(tab) {
    const c = document.getElementById('ss-tab-content');
    const S = extension_settings[extensionName];
    c.innerHTML = '';

    if (tab === 'manual') {
        c.innerHTML = `
            <div class="ss-card">
                <label class="ss-label">范围</label>
                <div style="display:flex;gap:5px"><input id="ss-s" class="ss-input" type="number" value="${state.startFloor}"><input id="ss-e" class="ss-input" type="number" value="${state.endFloor}"></div>
                <button id="ss-gen" class="ss-btn">✨ 开始总结</button>
            </div>
            ${state.summaryResult ? `
                <div class="ss-card" style="border-color:#7c3aed">
                    <textarea class="ss-input" style="height:100px">${state.summaryResult}</textarea>
                    <button id="ss-save" class="ss-btn green">📂 存入世界书</button>
                    <button id="ss-hide" class="ss-btn gray">🙈 隐藏楼层</button>
                </div>`:''}
            <button id="ss-unhide" class="ss-btn gray">显示隐藏楼层</button>
        `;
        c.querySelector('#ss-s').oninput=e=>state.startFloor=e.target.value;
        c.querySelector('#ss-e').oninput=e=>state.endFloor=e.target.value;
        c.querySelector('#ss-gen').onclick=async(e)=>{
            e.target.innerText='...'; try{state.summaryResult=await performSummary(state.startFloor,state.endFloor);renderTab('manual');}catch(err){alert(err.message);renderTab('manual');}
        };
        if(state.summaryResult){
            c.querySelector('#ss-save').onclick=()=>performWiInjection(state.summaryResult, S.autoBookName);
            c.querySelector('#ss-hide').onclick=()=>executeSlash(`/hide ${state.startFloor}-${state.endFloor}`);
        }
        c.querySelector('#ss-unhide').onclick=()=>executeSlash('/unhide');
    }
    else if (tab === 'auto') {
        c.innerHTML = `
            <div class="ss-card">
                <label><input type="checkbox" id="a-en" ${S.autoEnabled?'checked':''}> 启用自动模式</label>
                <hr style="border:0;border-top:1px solid #333;margin:10px 0">
                <label class="ss-label">阈值</label><input id="a-th" class="ss-input" type="number" value="${S.autoThreshold}">
                <label class="ss-label">保留</label><input id="a-kp" class="ss-input" type="number" value="${S.autoKeep}">
                <label class="ss-label">书名</label><input id="a-bn" class="ss-input" value="${S.autoBookName}">
                <button id="a-save" class="ss-btn">保存设置</button>
            </div>
        `;
        c.querySelector('#a-save').onclick=()=>{
            S.autoEnabled=c.querySelector('#a-en').checked;
            S.autoThreshold=c.querySelector('#a-th').value;
            S.autoKeep=c.querySelector('#a-kp').value;
            S.autoBookName=c.querySelector('#a-bn').value;
            saveSettingsDebounced(); alert("已保存");
        };
    }
    // (Next part...)

    // --- UI: Tab 3, 4, 5 ---
    else if (tab === 'wi') {
        try { 
            if (typeof getWorldbookNames === 'function') {
                state.availableBooks = getWorldbookNames();
            } else if (window.getWorldbookNames) {
                state.availableBooks = window.getWorldbookNames();
            }
        } catch(e) { console.error(e); }
        
        const opts = state.availableBooks.map(b=>`<option value="${b}" ${b===S.autoBookName?'selected':''}>${b}</option>`).join('');
        c.innerHTML = `<div class="ss-card"><select id="w-sel" class="ss-input">${opts}</select><button id="w-load" class="ss-btn gray">刷新内容</button></div><div id="w-list"></div>`;
        c.querySelector('#w-sel').onchange=e=>{S.autoBookName=e.target.value;saveSettingsDebounced();};
        const load=async()=>{
            const l=c.querySelector('#w-list'); l.innerHTML='Loading...';
            try{
                let entries = [];
                if (typeof getWorldbook === 'function') {
                    entries = await getWorldbook(S.autoBookName);
                } else if (window.getWorldbook) {
                    entries = await window.getWorldbook(S.autoBookName);
                }
                
                l.innerHTML='';
                [...entries].reverse().forEach(e=>{
                    const d=document.createElement('div'); d.className='ss-card'; const ex=state.expandedCards.has(e.uid);
                    const keysStr = e.strategy?.keys ? e.strategy.keys.join(', ') : e.name;
                    d.innerHTML=`<b>${keysStr.slice(0,20)}</b> ${ex?e.content:'...'}`;
                    d.onclick=()=>{ ex?state.expandedCards.delete(e.uid):state.expandedCards.add(e.uid); load(); };
                    l.appendChild(d);
                });
            }catch(e){l.innerHTML='Error: ' + e.message;}
        };
        c.querySelector('#w-load').onclick=load; load();
    }
    else if (tab === 'data') {
        c.innerHTML = `
            <div class="ss-card"><label class="ss-label">导入配置 (JSON)</label><textarea id="d-in" class="ss-input"></textarea><button id="d-imp" class="ss-btn green">导入</button></div>
            <div class="ss-card"><label class="ss-label">导出配置</label><textarea class="ss-input" readonly>${JSON.stringify(S)}</textarea></div>
        `;
        c.querySelector('#d-imp').onclick=()=>{ try{Object.assign(S,JSON.parse(c.querySelector('#d-in').value));saveSettingsDebounced();alert("导入成功");}catch(e){alert("格式错误");} };
    }
    else if (tab === 'settings') {
        c.innerHTML=`
            <div class="ss-card">
                <label class="ss-label">API URL</label><input id="s-u" class="ss-input" value="${S.url}">
                <label class="ss-label">API Key</label><input type="password" id="s-k" class="ss-input" value="${S.apiKey}">
                <label class="ss-label">Prompt</label><textarea id="s-p" class="ss-input" rows="5">${S.systemPrompt}</textarea>
                <button id="s-save" class="ss-btn">保存</button>
            </div>
        `;
        c.querySelector('#s-save').onclick=()=>{ S.url=c.querySelector('#s-u').value; S.apiKey=c.querySelector('#s-k').value; S.systemPrompt=c.querySelector('#s-p').value; saveSettingsDebounced(); alert("已保存"); };
    }
}

// --- INIT ---
function createUI() {
    if (document.getElementById('ss-root')) return;
    const root = document.createElement('div'); root.id = 'ss-root'; document.body.appendChild(root);
    
    // Float Button
    const btn = document.createElement('div'); btn.id='ss-float-btn'; btn.innerHTML='📝'; root.appendChild(btn);
    
    // Overlay
    const ol = document.createElement('div'); ol.className='ss-modal-overlay';
    ol.innerHTML = `
        <div class="ss-modal">
            <div style="padding:10px;background:#111;display:flex;justify-content:space-between;align-items:center"><b>SS v36</b><span id="ss-x" style="padding:5px">×</span></div>
            <div class="ss-tabs">
                <button class="ss-tab active" data-t="manual">手动</button><button class="ss-tab" data-t="auto">自动</button>
                <button class="ss-tab" data-t="wi">世界书</button><button class="ss-tab" data-t="data">数据</button>
                <button class="ss-tab" data-t="settings">设置</button>
            </div>
            <div class="ss-content" id="ss-tab-content"></div>
        </div>
    `;
    root.appendChild(ol);

    // Events
    const close=()=>{ ol.style.display='none'; state.isOpen=false; };
    const open=()=>{ 
        ol.style.display='flex'; state.isOpen=true; 
        const m = getMessages();
        if(m.length) { state.startFloor=m[0].floor; state.endFloor=m[m.length-1].floor; }
        renderTab('manual');
    };
    
    ol.querySelector('#ss-x').onclick=close;
    ol.onclick=e=>{if(e.target===ol)close();};
    btn.onclick=open;
    window._ss_open_ui=open;

    ol.querySelectorAll('.ss-tab').forEach(t=>{
        t.onclick=()=>{
            state.activeTab=t.dataset.t;
            ol.querySelectorAll('.ss-tab').forEach(x=>x.classList.toggle('active',x.dataset.t===state.activeTab));
            renderTab(state.activeTab);
        }
    });
}

jQuery(async () => {
    try {
        extension_settings[extensionName] = extension_settings[extensionName] || {};
        for(const k in defaultSettings) if(extension_settings[extensionName][k]===undefined) extension_settings[extensionName][k]=defaultSettings[k];

        const html = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings").append(html);
        
        $("#ss_settings_container .inline_drawer_header").click(function(){ $(this).next().slideToggle(); });
        
        $("#ss_enabled_cb").prop("checked", extension_settings[extensionName].enabled).on("change", function(){
            extension_settings[extensionName].enabled = $(this).prop("checked");
            saveSettingsDebounced();
            $("#ss-float-btn").toggle($(this).prop("checked"));
        });
        
        $("#ss_open_ui_btn").click(()=>window._ss_open_ui && window._ss_open_ui());
        
        createUI();
        if(!extension_settings[extensionName].enabled) $("#ss-float-btn").hide();
        console.log("SS v36 Loaded");
    } catch(e) { console.error("SS Init Error", e); }
});

