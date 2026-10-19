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
