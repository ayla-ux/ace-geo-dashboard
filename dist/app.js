const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key='ace-geo-cloud-readonly';let saved=null;let real=[],demo=false,view='overview';let prompts=[];
let promptStatusFilter='all';
const visiblePrompts=()=>prompts.filter(p=>promptStatusFilter==='all'||(promptStatusFilter==='active'?!!p.active:!p.active));
const sample=[];
function persist(){localStorage.setItem(key,JSON.stringify({results:real,prompts}))}function all(){return real}function filtered(dateFrom=$('#from').value,dateTo=$('#to').value){if(['guide','compare','gaps','automation'].includes(view)){dateFrom='';dateTo=''}return all().filter(r=>(!dateFrom||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.tested_at))>=dateFrom)&&(!dateTo||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.tested_at))<=dateTo)&&(!$('#topic').value||r.topic===$('#topic').value)&&(!$('#platform').value||r.platform===$('#platform').value)&&r.language==='en'&&(!$('#surface').value||r.surface===$('#surface').value))}
const ace=b=>b.name.toLowerCase().replace(/\s/g,'')==='acestudio',official=c=>{try{let h=new URL(c.url).hostname;return h==='acestudio.ai'||h.endsWith('.acestudio.ai')}catch{return false}},pct=(n,d)=>d?`${(100*n/d).toFixed(1)}%`:'—';
function metrics(rs){let success=rs.filter(r=>r.status==='success'),base=success.filter(r=>r.prompt_type!=='branded'),brand=base.filter(r=>r.brands.length),hit=base.filter(r=>r.brands.some(ace)),cnt=base.flatMap(r=>r.brands).reduce((s,b)=>s+b.mentions,0),acnt=base.flatMap(r=>r.brands).filter(ace).reduce((s,b)=>s+b.mentions,0),pos=hit.flatMap(r=>r.brands.filter(ace)).map(b=>b.first_position).filter(Number.isFinite),cr=base.filter(r=>r.citations!==null),cs=cr.flatMap(r=>r.citations),acs=cs.filter(official);return{base,success,brand,hit,cr,cs,acs,visibility:pct(hit.length,brand.length),mention:pct(hit.length,base.length),share:pct(acnt,cnt),position:pos.length?(pos.reduce((a,b)=>a+b,0)/pos.length).toFixed(2):'—',citation:pct(acs.length,cs.length),coverage:pct(cr.filter(r=>r.citations.some(official)).length,cr.length)}}
function topics(){let selected=$('#topic').value;$('#topic').innerHTML='<option value="">全部主题</option>'+[...new Set([...prompts,...all()].map(r=>r.topic))].map(t=>`<option>${esc(t)}</option>`).join('');$('#topic').value=selected}
function cards(m){return `<div class="cards">${[['品牌可见性',m.visibility,`${m.hit.length} / ${m.brand.length} 条含品牌回答`],['声量份额',m.share,'ACE 提及次数 / 全部品牌提及次数'],['平均首次出现位置',m.position,'只统计提及 ACE 且位置已知的回答'],['引用覆盖率',m.coverage,`引用已采集：${m.cr.length} / ${m.base.length} 条`]].map(([l,v,h])=>`<div class="card"><label>${l}</label><div class="value">${v}</div><div class="hint">${h}</div></div>`).join('')}</div>`}
function chart(rs){let dates=[...new Set(rs.map(r=>r.tested_at.slice(0,10)))].sort();if(!dates.length)return '<div class="empty">暂无趋势数据</div>';let paths=['ChatGPT','Perplexity','Gemini'].map((p,i)=>{let points=dates.map((d,j)=>{let m=metrics(rs.filter(r=>r.platform===p&&r.tested_at.slice(0,10)===d));return m.brand.length?`${50+j*510/Math.max(dates.length-1,1)},${170-140*m.hit.length/m.brand.length}`:null}).filter(Boolean);return `<polyline fill="none" stroke="${['#7964e9','#48b4ad','#dfa95c'][i]}" stroke-width="2.5" points="${points.join(' ')}"/>${points.map(pt=>{let [x,y]=pt.split(',');return `<circle cx="${x}" cy="${y}" r="3.5" fill="${['#7964e9','#48b4ad','#dfa95c'][i]}"/>`}).join('')}`}).join('');return `<svg viewBox="0 0 600 210" aria-label="按日期和平台统计的品牌可见性趋势" role="img">${[0,50,100].map(v=>`<line x1="50" y1="${170-v*1.4}" x2="570" y2="${170-v*1.4}" stroke="#eceef3"/><text x="0" y="${174-v*1.4}" fill="#9ba3b2" font-size="10">${v}%</text>`).join('')}${paths}${dates.filter((_,i)=>i===0||i===dates.length-1||i%Math.ceil(dates.length/5)===0).map(d=>`<text x="${50+dates.indexOf(d)*510/Math.max(dates.length-1,1)}" y="200" fill="#9ba3b2" font-size="10" text-anchor="middle">${d.slice(5)}</text>`).join('')}</svg><div class="legend">${['ChatGPT','Perplexity','Gemini'].map((p,i)=>`<span><i style="background:${['#7964e9','#48b4ad','#dfa95c'][i]}"></i>${p}</span>`).join('')}</div>`}
function table(head,rows){return `<table><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${head.length}" class="empty">暂无符合筛选条件的数据</td></tr>`}</tbody></table>`}
function render(){let rs=filtered(),m=metrics(rs);$('#mode').textContent='真实数据';$('#notice').textContent='正在连接真实数据服务；连接失败时不会显示演示数据。';let names={overview:['可见性','ACE Studio · 可见性','观察品牌在 AI 回答中的出现比例、声量份额与平均位置。'],performance:['提示词效果','每个提示词的监测效果','按主题查看每个问题的可见性与引用指标；题目编辑与选题请前往 Prompt 测试库。'],prompts:['Prompt 测试库','从好的问题，开始测量。','无品牌问题用于衡量自然发现；品牌问题用于独立诊断。'],results:['测试结果','每一个结论，都有依据。','查看原始回答、模型与采集来源，回溯每次测试。'],sources:['引用','ACE Studio · 引用','观察官网引用占比、引用覆盖率、引用类别和全部来源。'],guide:['接入与指标口径','先统一口径，再开始优化。','轻量起步，保留可复核的数据与可扩展的接入方式。']};$('#breadcrumb').textContent=names[view][0];$('#title').textContent=names[view][1];$('#subtitle').textContent=names[view][2];let html='';
if(view==='overview'){let brands={};m.base.forEach(r=>r.brands.forEach(b=>{brands[b.name]=(brands[b.name]||0)+b.mentions}));let max=Math.max(1,...Object.values(brands));html=cards(m)+`<div class="grid"><div class="panel"><h2>品牌可见性趋势</h2><div class="sub">按平台 · 当前筛选 · 无品牌测试</div>${chart(rs)}</div><div class="panel"><h2>品牌声量排名</h2><div class="sub">固定品牌字典下的提及次数；演示竞品仅作展示</div>${Object.entries(brands).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([b,n],i)=>`<div style="margin:18px 0"><div class="row"><span>${i+1}　${esc(b)}</span><b>${n}</b></div><div class="bar"><div style="width:${100*n/max}%"></div></div></div>`).join('')||'<p>暂无数据</p>'}</div></div><div class="panel wide"><div class="row"><h2>各主题表现</h2><span class="badge">成功 ${m.success.length} / 全部 ${rs.length}</span></div>${table(['Topic','有效样本','可见性','提及率','声量份额','引用覆盖率','主题声量第一'],[...new Set(rs.map(r=>r.topic))].map(t=>{let rr=rs.filter(r=>r.topic===t),x=metrics(rr),bs={};x.base.forEach(r=>r.brands.forEach(b=>bs[b.name]=(bs[b.name]||0)+b.mentions));return[esc(t),x.base.length,x.visibility,x.mention,x.share,x.coverage,esc(Object.entries(bs).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—')]}))}</div><div class="panel wide row"><span>全部成功无品牌回答中的 ACE 提及率 <b>${m.mention}</b></span><span>官方引用占比 <b>${m.citation}</b></span><span class="muted">品牌诊断题不进入总览</span></div>`}
if(view==='prompts')html=`<div class="panel"><div class="row"><h2>Prompt 测试库 · 共 ${prompts.length} 条</h2><p class="hint">已启用 ${prompts.filter(p=>p.active).length} 条 · 未启用 ${prompts.filter(p=>!p.active).length} 条</p><button id="tasks">导出测试任务</button></div><form id="promptForm" class="form"><textarea id="pt" placeholder="Enter an English question without naming a brand" required></textarea><input id="tp" placeholder="主题" required><select id="pl"><option value="en">English</option></select><select id="pm" hidden><option value="global">Global English-speaking audience</option></select><button class="primary">新增 Prompt</button></form><div class="prompt-status-toolbar"><label for="promptStatusFilter">题目状态</label><select id="promptStatusFilter">${[['all','全部'],['active','已启用'],['inactive','未启用']].map(([value,label])=>`<option value="${value}" ${promptStatusFilter===value?'selected':''}>${label}</option>`).join('')}</select><span class="hint">当前显示 ${visiblePrompts().length} / ${prompts.length} 条</span></div>${table(['ID / 主题','Prompt','题目语言','状态','操作'],visiblePrompts().map(p=>[`${esc(p.id)}<br><span class="muted">${esc(p.topic)}</span>`,esc(p.text)+(p.review_note?`<br><small class="muted">${esc(p.review_note)}</small>`:''),'English',p.active?'<span class="badge good">启用</span>':(p.review_note?'待审核 · 未启用':'已停用'),`<button data-edit="${esc(p.id)}">编辑</button> <button data-toggle="${esc(p.id)}">${p.active?'停用':'启用'}</button>`]))}<p>导出的任务供扣子读取，不会在浏览器内自动调用 AI。面向全球英语人群；保留模型、搜索配置和重复轮次。</p></div>`;
if(view==='results'){resultPage=Math.min(resultPage,Math.max(0,Math.ceil(rs.length/50)-1));}if(view==='results')html=`<div class="panel"><div class="row"><h2>英语测试记录 · ${rs.length} 条</h2><div>每页50条 · 第 ${resultPage+1} / ${Math.max(1,Math.ceil(rs.length/50))} 页 <button id="resultsPrev" ${resultPage===0?'disabled':''}>上一页</button> <button id="resultsNext" ${(resultPage+1)*50>=rs.length?'disabled':''}>下一页</button></div><span class="muted">点击查看原始回答</span></div>${table(['时间 / ID','平台 / 模型','Topic / 语言','状态','ACE 提及','首次位置 / 推荐排名','详情'],rs.slice().reverse().slice(resultPage*50,(resultPage+1)*50).map(r=>[`${esc(r.tested_at.slice(0,10))}<br><small>${esc(r.id)}</small>`,`${esc(r.platform)}<br><small class="muted">${esc(r.model)} · ${esc(r.surface)}</small>`,`${esc(r.topic)} / ${esc(r.language)}`,esc(r.status),r.status==='success'?(r.brands.some(ace)?'是':'否'):'—',`${r.brands.find(ace)?.first_position??'—'} / ${r.ace_recommendation_rank??'—'}`,`<button data-detail="${esc(r.id)}">查看 ↗</button>`]))}</div>`;
if(view==='sources'){let domains={},pages={},cats={};m.cs.forEach(c=>{let u=new URL(c.url);domains[u.hostname]=(domains[u.hostname]||0)+1;pages[c.url]=(pages[c.url]||0)+1;cats[c.category||'Unclassified']=(cats[c.category||'Unclassified']||0)+1});const rank=obj=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,n])=>[esc(k),n,pct(n,m.cs.length)]);html=`<div class="cards"><div class="card"><label>官方引用占比</label><div class="value">${m.citation}</div><div class="hint">${m.acs.length} / ${m.cs.length} 个引用</div></div><div class="card"><label>引用覆盖率</label><div class="value">${m.coverage}</div><div class="hint">以引用已采集的回答为分母</div></div><div class="card"><label>引用采集完整率</label><div class="value">${pct(m.cr.length,m.base.length)}</div><div class="hint">未知引用不作为零引用</div></div><div class="card"><label>官方域名关注</label><div class="value" style="font-size:20px">acestudio.ai</div><div class="hint">包含子域名；请确认官方域名清单</div></div></div><div class="grid"><div class="panel"><h2>被引用域名</h2>${table(['域名','次数','占比'],rank(domains))}</div><div class="panel"><h2>引用类别</h2>${table(['类别','次数','占比'],rank(cats))}</div></div><div class="panel wide"><h2>被引用页面</h2>${table(['URL','次数','占比'],rank(pages))}</div>`}
if(view==='guide')html=guide();$('#content').innerHTML=html;if($('#resultsPrev'))$('#resultsPrev').onclick=()=>{resultPage--;render()};if($('#resultsNext'))$('#resultsNext').onclick=()=>{resultPage++;render()};if($('#promptStatusFilter'))$('#promptStatusFilter').onchange=e=>{const draft=['pt','tp','pl','pm'].map(id=>[id,$('#'+id).value]);promptStatusFilter=e.target.value;render();draft.forEach(([id,value])=>{if($('#'+id))$('#'+id).value=value})};document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>detail(b.dataset.detail));document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{let p=prompts.find(p=>p.id===b.dataset.toggle);p.active=!p.active;persist();render()});document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{let p=prompts.find(p=>p.id===b.dataset.edit),v=window.prompt('编辑 Prompt 内容',p.text);if(v?.trim()){p.text=v.trim();persist();render()}});if($('#promptForm'))$('#promptForm').onsubmit=e=>{e.preventDefault();prompts.push({id:'p-'+Date.now(),topic:$('#tp').value.trim(),text:$('#pt').value.trim(),language:$('#pl').value,target_market:$('#pm').value,prompt_type:'unbranded',active:true});persist();topics();render()};if($('#tasks'))$('#tasks').onclick=()=>download('ace-test-tasks.json',{platforms:['ChatGPT','Perplexity','Gemini'],repeats:3,prompts:prompts.filter(p=>p.active)});if($('#template'))$('#template').onclick=()=>download('ace-result-template.json',[template]);}
const template={id:'run-001',tested_at:'2026-10-09T10:00:00+08:00',platform:'ChatGPT',model:'fill-exact-model',surface:'api',prompt_id:'p1',prompt:'Fill exact prompt',topic:'AI singing',language:'en',prompt_type:'unbranded',status:'success',answer:'Fill full original answer',brands:[{name:'ACE Studio',mentions:1,first_position:1}],ace_recommendation_rank:null,citations:[{url:'https://acestudio.ai/',category:'Official'}],region:'US',search_enabled:true,repeat_index:1};
function guide(){return `<div class="panel guide"><h2>数据接入 / 第一阶段</h2><p>当前实现：浏览器本地看板、Prompt 管理、JSON 导入导出、指标计算与原始回答回溯。尚未实现：扣子平台调用、共享数据库、定时执行和团队数据同步。</p><button class="primary" id="template">下载结果 JSON 模板</button><h3>扣子工作流建议</h3><ol><li>读取启用 Prompt，按平台 × 语言 × 重复轮次生成任务。</li><li>调用平台接口；保留模型版本、搜索配置、地区、原始回答和接口引用字段。</li><li>按固定品牌字典提取提及次数、首次出现顺序与明确推荐排名；缺失排名使用 null。</li><li>结构化结果经人工抽样核验后输出 JSON 数组，导入本看板。错误调用记录 status: error。</li></ol><h3>统一指标定义</h3><ul><li>可见性 = 提及 ACE 的回答数 / 提及任意字典品牌的回答数。</li><li>提及率 = 提及 ACE 的回答数 / 全部成功无品牌回答数。</li><li>声量份额 = ACE 提及次数 / 全部字典品牌提及次数。品牌别名须先统一。</li><li>平均位置 = ACE 首次出现的品牌顺序均值；推荐榜单排名独立保存。</li><li>引用占比 = 官方网站引用条目数 / 全部引用条目数。</li><li>引用覆盖率 = 包含官方引用的回答数 / 已采集引用的成功无品牌回答数。</li><li>citations: null 表示未采集；[] 表示确认没有引用。同一回答相同 URL 只计一次。</li><li>prompt_type: branded 的品牌诊断题不参与总览；失败调用不进入指标分母。</li></ul><h3>首轮基线建议</h3><p>每种语言准备 15–20 条无品牌问题，覆盖歌声生成、音乐制作、替代方案和 Agent 工作流。每题每平台重复 3 次，固定配置并分渠道统计。先完成一次基线，再在相同题库和设置下比较优化后的结果。不要将演示趋势或小样本波动当作品牌效果。</p><h3>导入数据契约</h3><p>UTF-8 JSON 数组，id 唯一；所有必填字段见模板。surface 为 api 或 web。网页端和 API、不同地区与搜索配置应分批导入观察。禁止将 API Key 写入此文件或前端。</p><pre>${esc(JSON.stringify(template,null,2))}</pre></div>`}
async function detail(id){
 let r=all().find(r=>r.id===id);if(!r)return;
 $('#detailBody').innerHTML='<p>正在加载回答详情…</p>';$('#detail').showModal();
 try{const root=location.pathname.startsWith('/team/')?'/team':'';const res=await fetch(root+'/api/result?id='+encodeURIComponent(id));if(res.ok)r=await res.json()}catch{}
 $('#detailBody').innerHTML=`<h2>${esc(r.platform)} · ${esc(r.id)}</h2><p>${esc(r.prompt)}</p><div class="answer">${esc(r.answer)}</div><h3>结构化记录</h3><pre>${esc(JSON.stringify(r,null,2))}</pre>`;
}
function download(name,obj){let u=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function validate(arr){if(!Array.isArray(arr))throw Error('根节点必须为 JSON 数组');let ids=new Set;return arr.map((r,i)=>{const fail=s=>{throw Error(`第 ${i+1} 条：${s}`)};for(let f of ['id','tested_at','platform','model','surface','prompt','topic','language','prompt_type','status'])if(typeof r[f]!=='string'||!r[f].trim())fail(`缺少 ${f}`);if(r.id.startsWith('demo-')||r.model==='DEMO')fail('演示记录不能作为真实数据导入');if(ids.has(r.id))fail('ID 重复');ids.add(r.id);if(!/^\d{4}-\d{2}-\d{2}T/.test(r.tested_at)||!Number.isFinite(Date.parse(r.tested_at)))fail('测试时间须为 ISO 时间');if(!['success','error'].includes(r.status)||!['api','web'].includes(r.surface)||!['branded','unbranded'].includes(r.prompt_type))fail('status / surface / prompt_type 值无效');if(typeof r.answer!=='string'||!Array.isArray(r.brands)||!(r.citations===null||Array.isArray(r.citations)))fail('answer、brands 或 citations 格式错误');let names=new Set;r.brands.forEach(b=>{if(typeof b.name!=='string'||!b.name.trim()||!Number.isInteger(b.mentions)||b.mentions<1||!(b.first_position===null||Number.isInteger(b.first_position)&&b.first_position>0))fail('品牌字段无效');let n=b.name.toLowerCase().replace(/\s/g,'');if(names.has(n))fail('同一品牌须合并');names.add(n)});if(r.ace_recommendation_rank!==null&&(!Number.isInteger(r.ace_recommendation_rank)||r.ace_recommendation_rank<1))fail('推荐排名须为正整数或 null');if(r.citations){let seen=new Set;r.citations=r.citations.filter(c=>{let u;try{u=new URL(c.url)}catch{fail('引用 URL 无效')}if(!['https:','http:'].includes(u.protocol))fail('引用须为 http(s)');if(seen.has(u.href))return false;seen.add(u.href);c.url=u.href;return true})}return r})}
$('#import').onclick=()=>$('#file').click();$('#file').onchange=async()=>{try{let arr=validate(JSON.parse(await $('#file').files[0].text())),map=new Map(real.map(r=>[r.id,r]));arr.forEach(r=>map.set(r.id,r));let next=[...map.values()];localStorage.setItem(key,JSON.stringify({results:next,prompts}));real=next;demo=false;topics();render();alert(`已导入 ${arr.length} 条；相同 ID 更新，当前共 ${real.length} 条。`)}catch(e){alert('导入失败：'+e.message)}finally{$('#file').value=''}};$('#export').onclick=()=>download(demo?'ace-demo-results.json':'ace-results.json',filtered());$('#close').onclick=()=>$('#detail').close();document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));render()});['from','to','topic','platform','language','market','surface'].forEach(id=>$('#'+id).onchange=()=>{if($('#from').value&&$('#to').value&&$('#from').value>$('#to').value){alert('开始日期不能晚于结束日期');return}render()});$('#reset').onclick=()=>{['from','to','topic','platform','language','market','surface'].forEach(id=>$('#'+id).value='');render()};topics();render();



/* Monitoring pages share the same metric definitions as the result explorer. */
(() => {
  const previousRender = render;
  let citationTab = 'domains';
  let watch = ['acestudio.ai'];
  try { watch = JSON.parse(localStorage.getItem('geo-watchlist') || '["acestudio.ai"]'); } catch {}
  const host = c => { try { return new URL(c.url).hostname; } catch { return '未知域名'; } };

  // Curated site-level classification; unrecognized hosts remain unclassified.
  // Evidence and scope are recorded in citation-sites.md.
  const sites = {
    'acestudio.ai':['ACE Studio','品牌官网'], 'suno.com':['Suno','品牌官网'],
    'udio.com':['Udio','品牌官网'], 'dreamtonics.com':['Dreamtonics','品牌官网'],
    'mureka.ai':['Mureka','品牌官网'], 'mureka.cn':['Mureka','品牌官网'], 'kits.ai':['Kits AI','品牌官网'], 'vocaloid.com':['VOCALOID','品牌官网'],
    'wondera.ai':['Wondera','品牌官网'], 'freetts.org':['FreeTTS','工具网站'],
    'tembrica.com':['Tembrica','工具网站'], 'rinzara.com':['Rinzara','工具网站'],
    'itechguides.com':['iTechGuides','媒体／评测'], 'techyorker.com':['TechYorker','媒体／评测'],
    'creatoraikits.com':['CreatorAIKits','媒体／评测'], 'diyai.io':['DIY AI','媒体／评测'],
    'promptandpower.com':['prompt/power','媒体／评测'],
    'github.com':['GitHub','开发者／开源项目'], 'u-singer.github.io':['U-Singer','开发者／开源项目'],
    'espnet-svs.hf.space':['ESPnet-SVS · Hugging Face','开发者／开源项目'],
    'wikipedia.org':['Wikipedia','百科／知识库'], 'arxiv.org':['arXiv','学术论文'],
    'aaai.org':['AAAI','学术论文'], 'reddit.com':['Reddit','社区／论坛'],
    'zhihu.com':['知乎','社区／论坛'], 'bilibili.com':['哔哩哔哩','视频平台'],
    'youtube.com':['YouTube','视频平台'], 'csdn.net':['CSDN','开发者社区']
  };
  const siteInfo = c => {
    const h=host(c).toLowerCase();
    const key=Object.keys(sites).sort((a,b)=>b.length-a.length).find(d=>h===d||h.endsWith('.'+d));
    return key ? {name:sites[key][0],category:sites[key][1]} : {name:h,category:'未分类'};
  };
  const sourceLabel = (url,page=false) => {
    const c={url}, info=siteInfo(c), matches=memoCitations.filter(x=>x.url===url);
    const title=page ? matches.find(x=>typeof x.title==='string'&&x.title.trim())?.title : null;
    return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(info.name)}</a>${title?`<br><span>${esc(title)}</span>`:''}<br><small class="muted source-url">${esc(page?url:host(c))}</small>`;
  };
  let memoCitations=[];
  const counts = (cs, key) => {
    const out = {};
    cs.forEach(c => { const k = key(c); out[k] = (out[k] || 0) + 1; });
    return Object.entries(out).sort((a,b) => b[1] - a[1]);
  };
  const watched = (c,w) => w.includes('://') ? c.url === w : host(c) === w || host(c).endsWith('.' + w);
  const breakdown = (cs,key) => counts(cs,key).map(([k,n]) => `${esc(k)}：${n}（${pct(n,cs.length)}）`).join('<br>') || '—';
  const watchCounts = cs => watch.map(w => [esc(w), cs.filter(c => watched(c,w)).length, pct(cs.filter(c => watched(c,w)).length,cs.length)]);
  const cardsFor = items => `<div class="cards monitor-cards">${items.map(([label,value,hint]) => `<div class="card"><label>${label}</label><div class="value">${value}</div><div class="hint">${hint}</div></div>`).join('')}</div>`;
  const note = '<p class="hint">成功的无品牌问题参与指标计算；品牌诊断题单独查看。引用未采集时记为未知，不按零引用计算。品牌指标以当前品牌字典为范围。平均位置仅统计提及品牌且首次位置已知的回答；未提及不记为0、不参与平均；无有效样本显示“—”。新增 Mureka 后历史回答按新版字典重算，统计口径已更新。</p>';
  const day = value => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const shift = (date,n) => new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
  const dateControls=document.createElement('div');dateControls.className='date-comparison';
  dateControls.innerHTML='<label>时段对比 <select id="periodPreset"><option value="7">近七天 vs 前七天</option><option value="28">近四周 vs 前四周</option><option value="custom">自定义两个时段</option></select></label><div class="date-range current-range"><b>当前</b></div><strong class="versus">VS</strong><div class="date-range"><b>对比</b><input type="date" id="compareFrom" aria-label="对比开始日期"><span>至</span><input type="date" id="compareTo" aria-label="对比结束日期"></div><span class="hint">日期按北京时间；包含起止日</span>';
  const filters=$('.filters');filters.prepend(dateControls);
  ['from','to'].forEach((id,i)=>{const label=$('#'+id).closest('label');label.firstChild.textContent=i?'至 ':' ';dateControls.querySelector('.current-range').appendChild(label)});
  function preset(){const n=Number($('#periodPreset').value);if(!n)return;const end=day(Date.now());$('#to').value=end;$('#from').value=shift(end,1-n);$('#compareTo').value=shift(end,-n);$('#compareFrom').value=shift(end,1-2*n)}
  $('#from').setAttribute('aria-label','当前开始日期');$('#to').setAttribute('aria-label','当前结束日期');
  preset();
  $('#periodPreset').onchange=()=>{preset();render()};
  ['from','to','compareFrom','compareTo'].forEach(id=>$('#'+id).onchange=()=>{
    if(($('#from').value&&$('#to').value&&$('#from').value>$('#to').value)||($('#compareFrom').value&&$('#compareTo').value&&$('#compareFrom').value>$('#compareTo').value)){alert('每个时段的开始日期不能晚于结束日期');return}
    $('#periodPreset').value='custom';render();
  });
  $('#reset').onclick=()=>{['topic','platform','language','market','surface'].forEach(id=>$('#'+id).value='');$('#periodPreset').value='7';preset();render()};
  function delta(current,key){
    const from=$('#compareFrom').value,to=$('#compareTo').value;
    if(!$('#from').value||!$('#to').value||!from||!to)return '<small class="metric-delta">请选择两个完整时段</small>';
    if(from>to||$('#from').value>$('#to').value)return '<small class="metric-delta">请检查时段起止日期</small>';
    const prior=metrics(filtered(from,to));
    const values=m=>key==='visibility'?(m.brand.length?100*m.hit.length/m.brand.length:null):key==='share'?(()=>{const bs=m.base.flatMap(r=>r.brands),total=bs.reduce((n,b)=>n+b.mentions,0);return total?100*bs.filter(ace).reduce((n,b)=>n+b.mentions,0)/total:null})():key==='position'?(()=>{const ps=m.hit.flatMap(r=>r.brands.filter(ace)).map(b=>b.first_position).filter(Number.isFinite);return ps.length?ps.reduce((a,b)=>a+b,0)/ps.length:null})():key==='citation'?(m.cs.length?100*m.acs.length/m.cs.length:null):key==='coverage'?(m.cr.length?100*m.cr.filter(r=>r.citations.some(official)).length/m.cr.length:null):(m.base.length?100*m.cr.length/m.base.length:null);
    const a=values(current),b=values(prior);
    if(a===null||b===null)return '<small class="metric-delta">暂无对比数据</small>';
    const diff=a-b,relative=b!==0?(diff/Math.abs(b)*100):null,sign=diff>0?'+':'';
    return `<small class="metric-delta ${diff>0?'increase':diff<0?'decrease':'unchanged'}">${diff>0?'↑':diff<0?'↓':'→'} ${relative===null?(diff===0?'0%':'基期为 0'):sign+relative.toFixed(1)+'%'}<span>较对比期 ${sign}${diff.toFixed(key==='position'?2:1)}${key==='position'?' 位':' 个百分点'}</span></small>`;
  }
  let trendObserver;
  function fitTrend(rs) {
    const box=$('.trend-plot'), svg=box.querySelector('svg');
    const draw=()=>{
      const w=box.clientWidth,h=box.clientHeight;
      if(w<1||h<1)return;
      svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
      const left=44,right=w-22,top=22,bottom=h-34;
      const dates=[...new Set(rs.map(r=>day(r.tested_at)))].sort();
      let html=[0,50,100].map(v=>{const y=bottom-(bottom-top)*v/100;return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#e3e8ef"/><text x="2" y="${y+4}" font-size="12" fill="#738095">${v}%</text>`}).join('');
      const x=i=>dates.length===1?(left+right)/2:left+i*(right-left)/(dates.length-1);
      ['ChatGPT','Perplexity','Gemini','总体'].forEach((platform,i)=>{
        const color=['#7964e9','#48b4ad','#dfa95c','#263b58'][i];let prev=null;
        dates.forEach((d,j)=>{const m=metrics(rs.filter(r=>(platform==='总体'||r.platform===platform)&&day(r.tested_at)===d));if(!m.brand.length){prev=null;return}const px=x(j),py=bottom-(bottom-top)*m.hit.length/m.brand.length;
          if(prev)html+=`<line x1="${prev[0]}" y1="${prev[1]}" x2="${px}" y2="${py}" stroke="${color}" stroke-width="${platform==='总体'?3.5:2.5}" ${platform==='总体'?'stroke-dasharray="7 4"':''}/>`;
          html+=`<circle tabindex="0" data-trend-label="${esc(platform)} · ${esc(d)} · 可见性 ${m.visibility}（${m.hit.length}/${m.brand.length}）" cx="${px}" cy="${py}" r="5" stroke="transparent" stroke-width="14" pointer-events="all" fill="${color}"><title>${platform} · ${esc(d)} · ${m.visibility}</title></circle>`;prev=[px,py];
        });
      });
      dates.forEach((d,i)=>{if(i===0||i===dates.length-1||i%Math.max(1,Math.ceil(dates.length/Math.max(2,w/100)))===0)html+=`<text x="${x(i)}" y="${h-8}" text-anchor="middle" font-size="12" fill="#738095">${esc(d.slice(5))}</text>`});
      if(!dates.length)html+=`<text x="${w/2}" y="${h/2}" text-anchor="middle" font-size="14" fill="#738095">暂无趋势数据</text>`;
      svg.innerHTML=html;
      let tip=box.querySelector('.trend-tooltip');if(!tip){tip=document.createElement('div');tip.className='trend-tooltip';tip.setAttribute('role','tooltip');box.appendChild(tip)}tip.hidden=true;
      svg.querySelectorAll('[data-trend-label]').forEach(dot=>{
        const show=()=>{tip.textContent=dot.dataset.trendLabel;tip.hidden=false;const rect=dot.getBoundingClientRect(),bounds=box.getBoundingClientRect();tip.style.left=Math.max(0,Math.min(rect.x-bounds.x,box.clientWidth-tip.offsetWidth))+'px';tip.style.top=Math.max(0,rect.y-bounds.y-tip.offsetHeight-10)+'px'};
        dot.onmouseenter=dot.onfocus=dot.onclick=show;dot.onmouseleave=dot.onblur=()=>tip.hidden=true;
      });
    };
    draw();trendObserver=new ResizeObserver(draw);trendObserver.observe(box);
  }
  render = function() {
    trendObserver?.disconnect();
    previousRender();
    const rs = filtered(), m = metrics(rs);
    memoCitations=m.cs;
    if(view === 'overview') {
      const brandNames = ['ACE Studio','Suno','Udio','Synthesizer V','Kits AI','Mureka'];
      const brands = brandNames.map(name=>[name,m.brand.filter(r=>r.brands.some(b=>b.name===name)).length]).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
      const ranking = brands.map(([name,n],i)=>[m.brand.length ? (i && n===brands[i-1][1] ? brands.findIndex(b=>b[1]===n)+1 : i+1) : '—',esc(name),pct(n,m.brand.length),`${n} / ${m.brand.length}`]);
      $('#content').innerHTML = cardsFor([
        ['可见性得分',m.visibility+delta(m,'visibility'),`${m.hit.length} / ${m.brand.length} 条提及任意品牌的回答`],
        ['声量份额',m.share+delta(m,'share'),'ACE 提及次数 ÷ 全部品牌提及次数'],
        ['平均位置',m.position+delta(m,'position'),'ACE 首次出现的品牌顺序均值']
      ]) + `<div class="grid visibility-grid"><div class="panel trend-panel"><h2>可见性趋势</h2><p class="hint">总体按当前筛选内各平台回答合并计算，不取平台百分比的简单平均。</p><div class="trend-plot"><svg role="img" aria-label="按日期与平台统计的可见性趋势"></svg></div><div class="legend">${['ChatGPT','Perplexity','Gemini','总体'].map((p,i)=>`<span><i style="background:${['#7964e9','#48b4ad','#dfa95c','#263b58'][i]}"></i>${p}</span>`).join('')}</div></div><div class="panel"><h2>竞品可见度排名</h2><p class="hint">提及该品牌的回答数 ÷ 提及任意品牌的去重回答数。一条回答可同时提及多个品牌，因此各品牌回答数相加可超过分母，各品牌可见性不要求合计100%。同分并列。固定观察 ACE、Suno、Udio、Synthesizer V、Kits AI、Mureka；榜内排名，其他品牌仍计入分母。</p>${table(['排名','品牌','可见性得分','回答数 / 分母'],ranking)}</div></div><div class="panel wide"><h2>按主题查看可见性</h2>${table(['主题','可见性得分','声量份额','平均位置'],[...new Set(rs.map(r=>r.topic))].map(t=>{const attempts=rs.filter(r=>r.topic===t&&r.prompt_type!=='branded'),x=metrics(attempts);return [esc(t),x.visibility,x.share,x.position]}))}${note}</div>`;
    }
    if(view === 'overview') fitTrend(rs);
    if(view === 'sources') {
      const keys = {domains:host,pages:c=>c.url};
      const rows = citationTab === 'watch' ? watchCounts(m.cs) : counts(m.cs,keys[citationTab]).map(([k,n])=>[sourceLabel(citationTab==='domains'?'https://'+k:k,citationTab==='pages'),n,pct(n,m.cs.length)]);
      $('#content').innerHTML = cardsFor([
        ['引用占比',m.citation+delta(m,'citation'),`${m.acs.length} / ${m.cs.length} 条引用来自 ACE 官网`],
        ['引用覆盖率',m.coverage+delta(m,'coverage'),'包含官网引用的回答 ÷ 引用已采集的成功无品牌回答'],
        ['引用采集率',pct(m.cr.length,m.base.length)+delta(m,'collection'),`另有 ${m.base.length-m.cr.length} 条回答引用未知`]
      ]) + `<div class="panel wide"><h2>引用类别</h2><p class="hint">按来源网站的主要类型分类；同站页面暂用同一类别，未核实的网站保留“未分类”。</p>${table(['类别','引用次数','占比'],counts(m.cs,c=>siteInfo(c).category).map(([k,n])=>[esc(k),n,pct(n,m.cs.length)]))}</div><div class="panel wide"><h2>全部引用</h2><div class="citation-tabs">${[['domains','域名'],['pages','页面'],['watch','关注列表']].map(([k,n])=>`<button data-citation-tab="${k}" class="${citationTab===k?'primary':''}">${n}</button>`).join('')}</div>${citationTab==='watch'?'<form id="watchForm" class="form"><input id="watchEntry" placeholder="输入域名或完整页面 URL" required><button>加入关注</button></form><p class="hint">关注列表保存在当前浏览器；域名包含子域名，页面按完整 URL 匹配。</p>':''}<div class="metric-scroll citation-table">${table([citationTab==='domains'?'网站 / 域名':citationTab==='pages'?'网站 / 页面':'关注对象','引用次数','全部引用中的占比'],rows)}</div>${note}</div>`;
      document.querySelectorAll('[data-citation-tab]').forEach(b=>b.onclick=()=>{citationTab=b.dataset.citationTab;render()});
      if($('#watchForm')) $('#watchForm').onsubmit=e=>{e.preventDefault();try{let v=$('#watchEntry').value.trim();const u=new URL(v.includes('://')?v:'https://'+v);if(!['http:','https:'].includes(u.protocol))throw Error();v=v.includes('://')?u.href:u.hostname;if(!watch.includes(v))watch.push(v);localStorage.setItem('geo-watchlist',JSON.stringify(watch));render()}catch{alert('请输入有效域名或 http(s) 页面地址')}};
    }
    if(view === 'performance') {
      const entries = new Map(prompts.map(p=>[p.id,p]));
      rs.forEach(r=>{if(!entries.has(r.prompt_id))entries.set(r.prompt_id,{id:r.prompt_id,text:r.prompt,topic:r.topic,language:r.language})});
      const rows = [...entries.values()].filter(p=>(!$('#topic').value||p.topic===$('#topic').value)&&(!$('#language').value||p.language===$('#language').value)).sort((a,b)=>a.topic.localeCompare(b.topic));
      $('#content').innerHTML = `<div class="panel"><h2>提示词效果 · ${rows.length} 道题</h2><p>按主题查看每道题的真实测试表现。AI 引用来自返回的结构化来源；编辑题目请进入 Prompt 测试库。</p><div class="metric-scroll"><table class="performance-table compact-performance"><thead><tr>${['提示词 / 主题','测试平台','有效回答数','品牌提及率','引用我们网站的回答数','官网引用次数','最近测试时间'].map(label=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${rows.map(p=>{
        const rr=rs.filter(r=>r.prompt_id===p.id), x=metrics(rr), platforms=[...new Set(rr.map(r=>r.platform))];
        const cited=x.cr.filter(r=>r.citations.some(official)).length;
        const last=rr.map(r=>r.tested_at).filter(Boolean).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
        const cells=[`<b>${esc(p.text)}</b><br><span class="badge">${esc(p.topic)}</span> <small>${esc(p.id)}</small>`,platforms.map(esc).join('<br>')||'—',x.base.length,x.mention,x.cr.length?cited:'—',x.cr.length?x.acs.length:'—',last?esc(new Date(last).toLocaleString('zh-CN')):'—'];
        return `<tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`;
      }).join('')}</tbody></table></div><p class="hint">品牌提及率＝提及 ACE 的回答数 ÷ 成功无品牌回答数。引用列只统计已采集的来源；未知引用显示“—”。有效回答数为当前筛选内成功的无品牌回答数量；不同日期、平台和重复轮次分别计数，失败及品牌诊断题不计入。它表示统计样本量，也是品牌提及率的分母。最近测试时间含失败尝试。可使用平台筛选分开查看。</p>${note}<p class="hint">相同题目修改前后的历史结果目前按题目 ID 汇总。AI 索引状态尚无可验证的数据来源，暂不展示。</p></div>`;
    }
  };
})();

/* Evidence-backed baseline views. No generated findings or external report data. */
(() => {
  const prior = render;
  const labels={scenarios:'场景分析',compare:'三平台回答对比',gaps:'ACE 缺席问题',quality:'测试覆盖与数据质量'};
  const platforms=['ChatGPT','Perplexity','Gemini'];
  const good=r=>r.status==='success';
  const brands=r=>Array.isArray(r.brands)?r.brands:[];
  const hasAce=r=>brands(r).some(ace);
  const groupKey=r=>JSON.stringify([r.prompt_id,r.prompt_version??null,r.prompt,r.language,r.target_market,r.surface,r.prompt_type,r.search_enabled??null]);
  const groups=rows=>{const map=new Map();rows.forEach(r=>{const k=groupKey(r);if(!map.has(k))map.set(k,[]);map.get(k).push(r)});return [...map.values()]};
  const evidence=r=>`<button class="evidence-link" data-evidence="${esc(r.id)}">查看原始回答</button>`;
  const sourceLinks=r=>{
    if(!Array.isArray(r.citations))return '<span class="hint">引用未采集</span>';
    const seen=new Set(),links=[];
    r.citations.forEach(c=>{try{const u=new URL(c.url);if(!['http:','https:'].includes(u.protocol)||seen.has(u.href))return;seen.add(u.href);links.push(`<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(c.title||u.hostname)}<small>${esc(u.href)}</small></a>`)}catch{}});
    if(!links.length)return '<span class="hint">该回答未返回可用来源链接</span>';
    return `<div class="gap-source-links">${links.slice(0,2).join('')}${links.length>2?`<details><summary>展开其余 ${links.length-2} 个来源</summary>${links.slice(2).join('')}</details>`:''}</div>`;
  };
  const when=r=>r.tested_at?new Date(r.tested_at).toLocaleString('zh-CN'):'时间未知';
  const cards=items=>`<div class="cards monitor-cards insight-cards">${items.map(([name,value,note])=>`<div class="card"><label>${name}</label><div class="value">${value}</div><div class="hint">${note}</div></div>`).join('')}</div>`;
  const scope='<p class="hint evidence-note">数据范围：当前筛选下的真实 Coze 测试记录。品牌识别依据现有字典；引用未知不作零引用处理。样本表现不代表全体 AI 用户或全行业表现。</p>';
  const answerBlock=r=>`<div class="evidence-meta">${esc(r.model||'模型未知')} · ${esc(when(r))}<br>记录 ${esc(r.id)} · ${good(r)?'成功':'失败'} · 搜索：${r.search_enabled===true?'开启':r.search_enabled===false?'关闭':'未知'}</div><p>${good(r)?(hasAce(r)?'提及 ACE':'未识别到 ACE'):'调用失败，不纳入可见性计算'}</p><div class="insight-answer">${esc(r.answer||'无回答文本')}</div><p class="hint">引用：${Array.isArray(r.citations)?r.citations.length+' 条':'未知／未采集'}</p>${evidence(r)}`;
  render=function(){
    const channelFilter=$('#surface');
    channelFilter.closest('label').hidden=view==='scenarios';
    if(view==='scenarios')channelFilter.value='';
    if(!labels[view])return prior();
    const rows=filtered().filter(r=>r.simulation!==true&&r.model!=='DEMO'&&!String(r.id).startsWith('demo-'));
    const successes=rows.filter(good),base=successes.filter(r=>r.prompt_type==='unbranded');
    $('#breadcrumb').textContent=labels[view];$('#title').textContent=labels[view];
    $('#subtitle').textContent='从已采集的回答建立 GEO 基线，每个发现都可以回到原始记录。';
    let html='';
    if(view==='scenarios'){
      const topics=[...new Set(rows.map(r=>r.topic||'未分类'))];
      html=cards([['已测试主题',topics.length,'按记录中的主题标签汇总'],['成功无品牌回答',base.length,'品牌诊断与失败回答排除'],['覆盖平台',new Set(successes.map(r=>r.platform)).size+' / 3','至少有一条成功回答的平台']]);
      html+=`<div class="panel wide"><h2>各场景的现有表现</h2><p class="hint">沿用测试记录中的主题，不自动猜测场景。重复测试按回答分别计数，可见性分母仅为提及字典内任意品牌的成功无品牌回答。</p><div class="metric-scroll scenario-table">${table(['主题','成功无品牌回答','提及 ACE / 含品牌回答','可见性','声量份额','平均位置','引用已采集','证据'],topics.map(t=>{const all=rows.filter(r=>(r.topic||'未分类')===t),rs=all.filter(good).filter(r=>r.prompt_type==='unbranded'),m=metrics(rs);return [esc(t),rs.length,`${m.hit.length} / ${m.brand.length}`,m.visibility,m.share,m.position,`${rs.filter(r=>Array.isArray(r.citations)).length} / ${rs.length}`,`<button data-topic-evidence="${esc(t)}">查看 ${all.length} 条记录</button>`]}))}</div>${scope}</div>`;
    }
    if(view==='compare'){
      const sets=groups(rows);
      html=`<div class="panel"><h2>同一问题，逐平台核对</h2><p class="hint">仅将问题 ID、原文、版本、语言、市场、渠道、问题类型和搜索设置一致的记录分组。每个平台展示当前筛选中最新一次尝试（包含失败），不代表同一批次或同时采集；时间与模型逐条标注。缺失平台不补写回答。</p><label>选择问题 <select id="comparisonPrompt" class="comparison-select">${sets.map((rs,i)=>`<option value="${i}">${esc(rs[0].prompt_id)} · ${esc(rs[0].prompt.slice(0,100))} · 版本 ${esc(rs[0].prompt_version??'未知')}</option>`).join('')}</select></label><div id="comparisonAnswers"></div>${scope}</div>`;
      $('#content').innerHTML=html;if($('#resultsPrev'))$('#resultsPrev').onclick=()=>{resultPage--;render()};if($('#resultsNext'))$('#resultsNext').onclick=()=>{resultPage++;render()};
      const draw=()=>{const rs=sets[Number($('#comparisonPrompt').value)];if(!rs){$('#comparisonAnswers').innerHTML='<div class="empty">当前筛选下没有测试记录</div>';return}$('#comparisonAnswers').innerHTML=`<p class="comparison-question">${esc(rs[0].prompt)}</p><div class="platform-comparison">${platforms.map(p=>{const history=rs.filter(r=>r.platform===p).sort((a,b)=>String(b.tested_at).localeCompare(String(a.tested_at))),r=history[0];return `<section class="panel"><h2>${p}</h2>${r?`<p class="hint">本组 ${history.length} 条记录，展示最新一次</p>${answerBlock(r)}`:'<div class="empty">此分组暂无该平台记录</div>'}</section>`}).join('')}</div>`;bind()};
      $('#comparisonPrompt').onchange=draw;draw();return;
    }
    if(view==='gaps'){
      const gaps=base.filter(r=>!hasAce(r)&&brands(r).length);
      html=cards([['ACE 缺席回答',gaps.length,'成功无品牌回答中，有其他字典品牌但没有 ACE'],['涉及问题组',groups(gaps).length,'按问题原文、版本及测试条件分组'],['未识别到任何品牌',base.filter(r=>!brands(r).length).length,'另计，不列为竞品胜出的证据']]);
      html+=`<div class="panel wide"><h2>其他品牌被提及，ACE 未被识别到</h2><p class="hint">品牌出现不等于被推荐；此处不推断竞品优劣、缺席原因或优化效果。历史缺席仍保留，不能解释为该问题最新一轮始终缺席。来源链接为该回答实际返回的引用，尚未逐页核实是否包含对应品牌，不推断品牌与来源的一一对应关系。</p><div class="metric-scroll gap-table">${table(['问题 / 场景','平台 / 模型','出现的其他品牌','该回答的来源链接','测试时间','依据'],gaps.map(r=>[`${esc(r.prompt)}<br><small>${esc(r.topic)} · ${esc(r.prompt_id)}</small>`,`${esc(r.platform)}<br>${esc(r.model)}`,brands(r).filter(b=>!ace(b)).map(b=>esc(b.name)).join('、'),sourceLinks(r),esc(when(r)),evidence(r)]))}</div>${scope}</div>`;
    }
    if(view==='quality'){
      const citationKnown=base.filter(r=>Array.isArray(r.citations));
      html=cards([['已保存测试结果',rows.length,`${successes.length} 成功 · ${rows.length-successes.length} 失败／非成功`],['调用成功率',pct(successes.length,rows.length),'成功结果数 ÷ 已保存结果数'],['引用采集率',pct(citationKnown.length,base.length),`${citationKnown.length} / ${base.length} 条成功无品牌回答；空引用列表计为已采集`]]);
      html+=`<div class="panel wide"><h2>平台覆盖与质量</h2><div class="metric-scroll">${table(['平台','记录数','成功 / 失败','成功率','成功问题组','引用已采集 / 无品牌成功','最近测试'],platforms.map(p=>{const rs=rows.filter(r=>r.platform===p),ok=rs.filter(good),ub=ok.filter(r=>r.prompt_type==='unbranded'),last=[...rs].sort((a,b)=>String(b.tested_at).localeCompare(String(a.tested_at)))[0];return [p,rs.length,`${ok.length} / ${rs.length-ok.length}`,pct(ok.length,rs.length),groups(ok).length,`${ub.filter(r=>Array.isArray(r.citations)).length} / ${ub.length}`,last?esc(when(last)):'暂无记录']}))}</div><p class="hint">仅统计已入库的结果；未启动、仍在排队或尚未生成结果的任务不计入成功率。问题组覆盖不等于完整题库覆盖。引用采集率不等于官网引用率。</p></div><div class="panel wide"><h2>需要核查的记录</h2><div class="metric-scroll">${table(['问题','平台','检查项','证据'],rows.filter(r=>!good(r)||!Array.isArray(r.citations)).map(r=>[esc(r.prompt_id),esc(r.platform),!good(r)?'调用失败／非成功；排除效果指标':'引用未知；不作为零引用',evidence(r)]))}</div>${scope}</div>`;
    }
    $('#content').innerHTML=html;if($('#resultsPrev'))$('#resultsPrev').onclick=()=>{resultPage--;render()};if($('#resultsNext'))$('#resultsNext').onclick=()=>{resultPage++;render()};bind();
    document.querySelectorAll('[data-topic-evidence]').forEach(b=>b.onclick=()=>{const rs=rows.filter(r=>(r.topic||'未分类')===b.dataset.topicEvidence);$('#detailBody').innerHTML=`<h2>${esc(b.dataset.topicEvidence)} · 原始记录</h2>${rs.map(r=>`<section class="panel"><h3>${esc(r.platform)} · ${esc(r.prompt_id)}</h3><p>${esc(r.prompt)}</p>${answerBlock(r)}</section>`).join('')}`;$('#detail').showModal();bind()});
  };
  function bind(){document.querySelectorAll('[data-evidence]').forEach(b=>b.onclick=()=>{if($('#detail').open)$('#detail').close();detail(b.dataset.evidence)})}
})();

/* Presentation-only table sorting; move existing rows so their actions survive. */
(() => {
  const collator = new Intl.Collator('zh-CN', {numeric:true,sensitivity:'base'});
  function value(cell, label) {
    const text=(cell?.innerText||'').trim();
    if(!text||/^(—|-|暂无|未知|未采集)/.test(text))return null;
    if(/时间|最近测试|批次/.test(label)) {
      const date=text.match(/\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/);
      if(date){const n=Date.parse(date[0].replace(/\//g,'-'));if(Number.isFinite(n))return n;}
    }
    // Ratios use the count before '/', percentages use their displayed value.
    if(/^[+-]?\d[\d,]*(?:\.\d+)?\s*(?:%|\/.*)?$/.test(text))return Number(text.match(/^[+-]?[\d,.]+/)[0].replace(/,/g,''));
    return text;
  }
  function enhance() {
    document.querySelectorAll('#content table:not([data-sort-ready])').forEach(table=>{
      table.dataset.sortReady='true';
      const headers=[...table.querySelectorAll('thead th')],body=table.tBodies[0];
      if(!body)return;
      const labels=headers.map(h=>h.textContent.trim());
      const rows=[...body.rows].filter(r=>r.cells.length===headers.length);
      rows.forEach((row,i)=>row.dataset.originalOrder=i);
      let column=labels.findIndex(l=>l==='可见性得分'||l==='可见性');
      if(column<0)column=labels.findIndex(l=>l==='回答数');
      if(column<0)column=labels.findIndex(l=>l==='引用次数');
      if(column<0)column=labels.findIndex(l=>/最近测试|时间|批次/.test(l));
      if(column<0)column=labels.findIndex(l=>/有效回答|次数|占比|成功|失败|记录数|完成|采集|提及率/.test(l));
      if(column<0)return;
      headers[column].setAttribute('aria-sort','descending');
      rows.sort((a,b)=>{
        const av=value(a.cells[column],labels[column]),bv=value(b.cells[column],labels[column]);
        if(av===null&&bv!==null)return 1;if(bv===null&&av!==null)return -1;
        const cmp=av===null?0:typeof av==='number'&&typeof bv==='number'?av-bv:collator.compare(String(av),String(bv));
        return -cmp||Number(a.dataset.originalOrder)-Number(b.dataset.originalOrder);
      });
      rows.forEach(row=>body.appendChild(row));
    });
  }
  new MutationObserver(enhance).observe(document.querySelector('#content'),{childList:true,subtree:true});
  enhance();
})();

const BRAND_DICTIONARY={"ACE Studio": ["ACE Studio", "ACEStudio", "ACE スタジオ"], "Suno": ["Suno"], "Udio": ["Udio"], "Mureka": ["Mureka"], "Synthesizer V": ["Synthesizer V Studio", "Synthesizer V", "Synth V", "SynthV"], "Kits AI": ["Kits.ai", "Kits AI"], "VOCALOID": ["VOCALOID"], "Emvoice": ["Emvoice"], "Audimee": ["Audimee"], "Musicfy": ["Musicfy"], "UTAU": ["UTAU"], "CeVIO": ["CeVIO"], "VoiSona": ["VoiSona"], "ElevenLabs": ["ElevenLabs"], "Soundraw": ["Soundraw"], "AIVA": ["AIVA"], "Boomy": ["Boomy"], "Mubert": ["Mubert"]};
function currentBrandDictionary(r){
 if(r.status!=='success'||r.simulation)return r;
 const text=String(r.answer||'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/https?:\/\/\S+/g,'');
 const hits=[];
 for(const [name,aliases] of Object.entries(BRAND_DICTIONARY)){
  const escaped=aliases.slice().sort((a,b)=>b.length-a.length).map(a=>a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const matches=[...text.matchAll(new RegExp('(?<![A-Za-z0-9])(?:'+escaped.join('|')+')(?![A-Za-z0-9])','gi'))];
  if(matches.length)hits.push({name,mentions:matches.length,index:matches[0].index});
 }
 hits.sort((a,b)=>a.index-b.index||a.name.localeCompare(b.name));
 return {...r,brands:hits.map((b,i)=>({name:b.name,mentions:b.mentions,first_position:i+1})),brand_dictionary_version:'2026-10-14-mureka'};
}

let resultPage=0;

(() => {
 const prior=render;
 render=function(){
  if(view!=='diagnostics')return prior();
  $('#breadcrumb').textContent='品牌诊断';$('#title').textContent='Brand Knowledge & Comparisons';
  $('#subtitle').textContent='点名品牌的独立测试，不计入自然发现可见性。';
  const sections=[['brand_knowledge','Brand Knowledge','核查品牌定位、核心功能与授权信息是否准确。'],['brand_comparison','Brand Comparisons','观察点名比较时的差异描述与适配建议，不用品牌出现率判断优劣。']];
  $('#content').innerHTML=sections.map(([kind,title,note])=>{
   const ps=prompts.filter(p=>p.test_type===kind);
   return `<section class="panel wide"><h2>${title} · ${ps.length} questions</h2><p>${note}</p><button data-diagnostic-group="${kind}">选择本组测试</button>${table(['Prompt','有效回答数','最近结果','原始证据'],ps.map(p=>{
    const rs=filtered().filter(r=>r.prompt_id===p.id),ok=rs.filter(r=>r.status==='success'),last=rs.slice().sort((a,b)=>String(b.tested_at).localeCompare(String(a.tested_at)))[0];
    return [esc(p.text),ok.length,last?esc(last.platform+' · '+last.status):'尚未测试',last?`<button data-diagnostic-detail="${esc(last.id)}">查看回答</button>`:'—'];
   }))}</section>`;
  }).join('')+'<p class="hint">这六条题目在独立诊断批次中执行，不参与每周自然发现自动批次。历史题库与结果已归档，新基线不会混入旧数据。</p>';
  document.querySelectorAll('[data-diagnostic-group]').forEach(b=>b.onclick=()=>window.dispatchEvent(new CustomEvent('geo-diagnostic-select',{detail:prompts.filter(p=>p.test_type===b.dataset.diagnosticGroup).map(p=>p.id)})));
  document.querySelectorAll('[data-diagnostic-detail]').forEach(b=>b.onclick=()=>detail(b.dataset.diagnosticDetail));
 };
 document.querySelector('[data-view="diagnostics"]').onclick=()=>{view='diagnostics';render()};
})();
