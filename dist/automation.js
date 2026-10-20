/* Server-connected mode. The static single-file view remains available. */
(async function(){
  if(!/^https?:$/.test(location.protocol)){document.documentElement.dataset.loadState='ready';document.documentElement.classList.add('fonts-ready');return;}
  const pageRoot=document.documentElement;
  let initialLoaded=false;
  function loadFailed(message){
    if(initialLoaded)return;
    pageRoot.dataset.loadState='error';
    $('#content').setAttribute('aria-busy','false');
    $('#cloudLoadingTitle').textContent='暂时无法读取云端数据';
    $('#cloudLoadingText').textContent=message+'。请稍后重新连接，原有数据不会被删除。';
    $('#retryCloudLoad').hidden=false;
  }
  $('#retryCloudLoad').onclick=()=>location.reload();
  function loadReady(){
    if(initialLoaded)return;
    initialLoaded=true;pageRoot.dataset.loadState='ready';
    $('#content').setAttribute('aria-busy','false');
    // Download the large display fonts only after the first dataset has rendered.
    setTimeout(()=>pageRoot.classList.add('fonts-ready'),1500);
  }
  async function readResponse(url){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    try{
      const response=await fetch(url,{signal:controller.signal});
      const data=await response.json();
      if(response.status===401){location.assign('/login');throw Error('登录已过期，请重新登录')}
      if(!response.ok)throw Error(data.error||'请求返回 HTTP '+response.status);
      return data;
    }catch(e){if(e.name==='AbortError')throw Error('读取数据超时');throw e}
    finally{clearTimeout(timer)}
  }
  const apiRoot=location.pathname.startsWith('/team/')?'/team':'';
  let autoNav=document.querySelector('nav button[data-view="automation"]');
  if(!autoNav){autoNav=document.createElement('button');autoNav.textContent='▷　自动测试';autoNav.dataset.view='automation';$('nav').appendChild(autoNav)}
  let connectionError='正在连接自动测试服务';
  autoNav.onclick=()=>{
    document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b===autoNav));
    $('#breadcrumb').textContent='自动测试';$('#title').textContent='自动测试服务连接状态';
    $('#content').innerHTML='<div class="panel"><h2>自动测试暂时无法连接</h2><p>'+esc(connectionError)+'</p><p>原有题库和测试数据未被删除。请检查看板后台和 Supabase 连接，再点击重新连接。</p><button id="retryAutomationConnection">重新连接</button></div>';
    $('#retryAutomationConnection').onclick=()=>location.reload();
  };
  let config;try{config=await readResponse(apiRoot+'/api/config');if(config.version!==2)throw Error('配置接口版本不兼容')}
  catch(e){connectionError='连接失败：'+e.message;$('#notice').textContent=connectionError;loadFailed(e.message);return}

  const MAX_BATCH_TASKS=540; // 180 prompts × three platforms × one repeat.
  let submittingRun=false;let runNotice='';let uncertainRun=false;let schedule=null;let savingPrompts=false;let promptSaveNotice='';
  let autoLibrary='';
  let source='coze',runs=[],chosenPlatforms=new Set(['Perplexity']),chosenPrompts=new Set(),repeats=1,loading=false,saveState='数据库已连接';
  async function api(path,body){if(body===undefined)return readResponse(apiRoot+path);if(body!==undefined&&config.can_edit===false)throw Error('请先从团队入口登录');let res=await fetch(apiRoot+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-GEO-Token':config.csrf_token},body:body===undefined?undefined:JSON.stringify(body)});let data=await res.json();if(!res.ok)throw Error(data.error||'请求失败');return data}
  const baseRender=render;
  $('#import').hidden=true;if($('#manualButton'))$('#manualButton').hidden=true;document.querySelectorAll('header button').forEach(b=>{if(b.textContent.includes('添加首轮'))b.hidden=true});
  $('.stamp span').textContent='AUTOMATION / 02';

  const statusText={queued:'等待执行',running:'运行中',completed:'已完成',failed:'全部失败',partial:'部分失败',interrupted:'运行中断'};
  function setNav(){document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view))}
  function overrideNotice(){ document.querySelectorAll('#startBatch, #runMode, #repeatCount, [data-run-platform]').forEach(el=>el.disabled=!config.can_run||submittingRun||uncertainRun);document.querySelectorAll('#promptForm textarea, #promptForm input, #promptForm select, #promptForm button, [data-toggle], [data-edit]').forEach(el=>el.disabled=!config.can_edit||savingPrompts);
    $('#mode').textContent=source==='simulation'?'自动化模拟':source==='direct'?'Perplexity 直连验证':'Coze 真实测试';
    $('#notice').innerHTML=(source==='simulation'?'◉ 自动化模拟结果：未调用真实 AI 平台，不能用于判断 ACE GEO 表现。':source==='direct'?'◉ Perplexity 直连验证：绕过 Coze 验证 API → 提取 → Supabase → 看板；不是已完成的 Coze 链路。':'◉ Coze 真实测试：结果从 Supabase 读取；未配置凭据时不会产生真实测试数据。')+` <span>${esc(saveState)}</span>`;
    let saveNotice=document.querySelector('#promptSaveNotice');
    if(!saveNotice){saveNotice=document.createElement('div');saveNotice.id='promptSaveNotice';saveNotice.className='notice';saveNotice.setAttribute('role','status');saveNotice.setAttribute('aria-live','polite');$('#notice').after(saveNotice)}
    saveNotice.hidden=!(promptSaveNotice||runNotice);saveNotice.textContent=[promptSaveNotice,runNotice].filter(Boolean).join(' · ');
    $('#dataSource')?.closest('label')?.remove();
  }
  render=function(){
    const hideFilters=['guide','compare','gaps','automation'].includes(view);
    $('.filters').hidden=hideFilters;if(hideFilters)ACEPromptLibrary.resetDetails();
    if(hideFilters)['topic','platform','language','market','surface'].forEach(id=>$('#'+id).value='');
    demo=false;
    if(view!=='automation'){
      baseRender();
      if(view==='guide')$('#content').innerHTML='<div class="panel guide"><h2>Supabase 云端数据看板</h2><p>题目、批次和结果从 Supabase 读取；n8n Cloud 负责测试调度，Coze 负责调用 AI。题目编辑和手动测试按当前启动入口开放。</p><p>补测通过 retry_of_task_id 关联原任务，同一任务链优先采用最近成功结果；不同正式批次独立保留。批次历史保留原始成功与失败数量。</p><p>自然发现与品牌诊断继续按题型区分，失败结果不计入成功回答指标。</p></div>';
      overrideNotice();setNav();return
    }
    const listScrollTop=$('#promptSelectionList')?.scrollTop||0;
    $('#breadcrumb').textContent='自动测试';$('#title').textContent='从问题到指标，自动跑完。';$('#subtitle').textContent='数据库题库 → Coze 工作流 → 平台调用 → 结构化处理 → Supabase → 看板自动刷新';
    let enabled=prompts.filter(p=>p.active&&!ACEPromptLibrary.archived(p)),shown=enabled.filter(p=>!autoLibrary||ACEPromptLibrary.group(p)===autoLibrary),total=chosenPrompts.size*chosenPlatforms.size*repeats;
    let busy=submittingRun||uncertainRun;
    $('#content').innerHTML=`<div class="panel"><h2>定期自动测试 · 每 7 天 · 北京时间 09:00</h2><p id="dailyScheduleStatus"></p><p class="hint">每隔 7 天将启用的自然发现题目在三个平台各测一次；新增题目可在下方手动测试。定时计划由 n8n Cloud 管理，电脑无需保持开机。本页面尚未验证计划的启用状态和下次触发时间。</p></div><div class="panel wide"><div class="row"><h2>自动化链路</h2><span class="badge good">Supabase · 持久化存储</span></div><p>Prompt 测试库 → 自动任务队列 → Coze 国际版 → AI 平台 → Coze 结构化代码 → 数据库 → 指标 → Dashboard</p><div class="form"><label>执行模式 <select id="runMode"><option value="coze">Coze 真实测试</option></select></label><label>重复轮次 <select id="repeatCount"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>${['ChatGPT','Perplexity','Gemini'].map(p=>`<label><input type="checkbox" data-run-platform="${p}" ${chosenPlatforms.has(p)?'checked':''}>${p}</label>`).join('')}</div><p>${config.coze_configured?'选择已保存的题目和平台，提交到 n8n 云端执行；每批请选择同一种题型。':'Coze 尚未配置。缺少：'+esc(config.missing.join('、'))+'。通过启动Coze工作流看板.cmd安全输入令牌；平台密钥在 Coze 中配置。'}</p><div class="row"><h2>选择启用 Prompt · ${enabled.length} 条</h2><div><button id="chooseThree">选前3条英文题</button> <button id="chooseAll">全选当前组自然发现题</button> <button id="chooseBrand">选择当前组品牌诊断题</button> <button id="chooseNone">清空</button></div></div><div class="library-auto-filter"><label>题库主题 <select id="autoLibrary"><option value="">全部主题</option><option value="core">原有业务（第一份表）</option><option value="song_generation">歌曲生成（第二份表）</option></select></label><span class="hint">当前组 ${shown.length} 条：自然发现 ${shown.filter(p=>p.test_type==='natural_discovery').length} 条，品牌诊断 ${shown.filter(p=>p.test_type==='brand_knowledge').length} 条。不同题型分批测试。</span></div><div id="promptSelectionList" style="max-height:290px;overflow:auto;margin:12px 0">${shown.map(p=>`<label style="display:flex;gap:10px;padding:10px;border-bottom:1px solid #eee"><input type="checkbox" data-run-prompt="${esc(p.id)}" ${chosenPrompts.has(p.id)?'checked':''}><span><b>${esc(p.id)}</b> · English · ${esc(p.topic)}<br>${esc(p.text)}</span></label>`).join('')}</div><div class="row"><p id="taskCount">已选 ${chosenPrompts.size} 条题目 × ${chosenPlatforms.size} 个平台 × ${repeats} 轮＝${total} 个任务；单批最多${MAX_BATCH_TASKS}次。真实模式可能产生平台与 Coze 费用。</p><button class="primary" id="startBatch" ${busy?'disabled':''}>${busy?'批次运行中':'开始自动测试'}</button></div><p class="hint">手动测试与定时测试可能同时运行，请先查看批次历史再提交。提交超时不会自动重试；完成数在批次结束后汇总更新。</p></div><div class="panel wide"><h2>批次历史与进度</h2>${table(['批次 / 时间','模式','状态','完成 / 总数','失败'],runs.map(r=>[`${esc(r.id.slice(0,10))}<br>${esc(new Date(r.created_at).toLocaleString('zh-CN'))}`,r.mode==='simulation'?'自动化模拟':r.mode==='direct'?'Perplexity 直连验证':'Coze 真实测试',statusText[r.status]||esc(r.status),`${r.completed} / ${r.total}`,r.failed]))}</div>`;
    $('#promptSelectionList').scrollTop=listScrollTop;
    $('#autoLibrary').value=autoLibrary;$('#autoLibrary').onchange=()=>{autoLibrary=$('#autoLibrary').value;chosenPrompts.clear();render()};
    $('#runMode').value=source;$('#repeatCount').value=String(repeats);
    const updateCount=()=>$('#taskCount').textContent=`已选 ${chosenPrompts.size} 条题目 × ${chosenPlatforms.size} 个平台 × ${repeats} 轮＝${chosenPrompts.size*chosenPlatforms.size*repeats} 个任务；单批最多${MAX_BATCH_TASKS}次。真实模式可能产生平台与 Coze 费用。`;
    $('#repeatCount').onchange=()=>{repeats=Number($('#repeatCount').value);updateCount()};
    $('#runMode').onchange=async()=>{source=$('#runMode').value;await refresh(true)};
    document.querySelectorAll('[data-run-prompt]').forEach(c=>c.onchange=()=>{c.checked?chosenPrompts.add(c.dataset.runPrompt):chosenPrompts.delete(c.dataset.runPrompt);updateCount()});
    document.querySelectorAll('[data-run-platform]').forEach(c=>c.onchange=()=>{c.checked?chosenPlatforms.add(c.dataset.runPlatform):chosenPlatforms.delete(c.dataset.runPlatform);updateCount()});
    $('#chooseThree').onclick=()=>{chosenPrompts=new Set(shown.filter(p=>p.test_type==='natural_discovery').slice(0,3).map(p=>p.id));render()};
    $('#chooseAll').onclick=()=>{chosenPrompts=new Set(shown.filter(p=>p.prompt_type==='unbranded').map(p=>p.id));render()};$('#chooseBrand').onclick=()=>{chosenPrompts=new Set(shown.filter(p=>p.test_type==='brand_knowledge').map(p=>p.id));render()};$('#chooseNone').onclick=()=>{chosenPrompts.clear();render()};
    $('#startBatch').onclick=async()=>{
      if(submittingRun||uncertainRun||!config.can_run)return;
      let sent=false;
      try{
        if(savingPrompts)throw Error('请等待题目保存完成');
        const selected=prompts.filter(p=>chosenPrompts.has(p.id)&&p.active);
        const types=new Set(selected.map(p=>p.test_type));
        const n=selected.length*chosenPlatforms.size*repeats;
        if(!n||selected.length!==chosenPrompts.size)throw Error('请选择有效的启用题目和平台');
        if(n>MAX_BATCH_TASKS)throw Error(`单批最多${MAX_BATCH_TASKS}次调用`);
        if(types.size!==1)throw Error('每批请选择同一种题型，自然发现、品牌认知、品牌对比请分开测试');
        const request_id=crypto.randomUUID();
        submittingRun=true;runNotice='正在提交测试，请稍候…';overrideNotice();
        sent=true;
        const result=await api('/api/runs',{request_id,mode:'coze',platforms:[...chosenPlatforms],prompt_ids:[...chosenPrompts],repeats});
        if(result.accepted!==true||result.id!==request_id)throw Error('未收到有效批次确认');
        runNotice='已提交 '+result.total+' 个任务，批次：'+result.id+'。请等待批次历史更新。';
        chosenPrompts.clear();await refresh(true);
      }catch(e){
        if(sent){uncertainRun=true;runNotice='提交未确认：'+e.message+'。请先核实批次历史或 n8n 执行记录，勿直接重复测试。'}
        else alert(e.message);
      }finally{submittingRun=false;render()}
    };
    overrideNotice();setNav();scheduleNotice();
  };
  autoNav.onclick=()=>{view='automation';render()};window.addEventListener('geo-diagnostic-select',e=>{chosenPrompts=new Set(e.detail);chosenPlatforms=new Set(['ChatGPT','Perplexity','Gemini']);view='automation';render()});
  // Server is the authoritative prompt store. Existing prompt editing uses this hook.
  persist=function(){
    if(!config.can_edit||savingPrompts)return;
    savingPrompts=true;saveState='正在保存题目到 Supabase…';promptSaveNotice=saveState;overrideNotice();
    const draft=JSON.parse(JSON.stringify(ACEPromptLibrary.current()));
    api('/api/prompts',draft).then(data=>{
      prompts=data.prompts;topics();saveState='题目已保存到 Supabase';promptSaveNotice='✓ 题目已保存到 Supabase · '+new Date().toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai'})+'（北京时间）';
    }).catch(e=>{
      saveState='保存未完成：'+e.message;promptSaveNotice=saveState;
      alert(saveState+'。当前页面保留未保存内容，请先复制需要保留的文字，再刷新核实。');
    }).finally(()=>{savingPrompts=false;render();overrideNotice()});
  };

  function scheduleNotice(){const el=$('#dailyScheduleStatus');if(!el)return;if(schedule?.managed_by==='n8n'){el.textContent=schedule.blocked;return;}el.textContent=schedule?`${schedule.enabled?'已启用':'未启用'} · 每 ${schedule.interval_days||7} 天 ${schedule.prompt_count} 题 / ${schedule.calls} 次调用 · ${schedule.blocked||('下一计划日期：'+schedule.next_date+' 09:00（当天到点未跑则待补跑）')} · 最近自动批次：${schedule.last?(schedule.last.day+' '+(statusText[schedule.last.status]||schedule.last.status)+' '+schedule.last.completed+'/'+schedule.last.total):'尚未执行'}`:'正在读取定期计划…'}
  async function refresh(force=false){
    if(loading)return;loading=true;
    try{let [history,daily]=await Promise.all([api('/api/runs'),api('/api/schedule')]);schedule=daily;const historyChanged=JSON.stringify(history.filter(r=>r.mode==='coze'))!==JSON.stringify(runs);if(!force&&!historyChanged){saveState='Supabase 已连接 · 正式批次 · 15秒检查更新';overrideNotice();scheduleNotice();return}let results=await api('/api/results?mode='+source+'&summary=1');const nextResults=ACEBatchPolicy.formalResults(results,history).filter(r=>r.simulation!==true&&r.model!=='DEMO'&&!String(r.id).startsWith('demo-')).map(currentBrandDictionary),nextRuns=history.filter(r=>r.mode==='coze');let changed=JSON.stringify(nextRuns)!==JSON.stringify(runs)||JSON.stringify(nextResults)!==JSON.stringify(real);real=nextResults;runs=nextRuns;loadReady();saveState='Supabase 已连接 · 正式批次 · 15秒检查更新';if(force||changed){topics();if(view!=='prompts'||force)render()}overrideNotice();scheduleNotice()}catch(e){saveState='连接失败：'+e.message;loadFailed(e.message);overrideNotice()}finally{loading=false}
  }
  try{prompts=await api('/api/prompts');chosenPrompts=new Set(prompts.filter(p=>p.active&&p.language==='en').slice(0,3).map(p=>p.id));await refresh(true);const requested=location.hash.slice(1);view=requested==='song-generation'?'song-generation':config.can_edit&&['prompts','automation'].includes(requested)?requested:'overview';render();setInterval(()=>refresh(),15000)}catch(e){loadFailed(e.message)}
})();

