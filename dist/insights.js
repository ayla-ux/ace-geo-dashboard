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
      $('#content').innerHTML=html;
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
    $('#content').innerHTML=html;bind();
    document.querySelectorAll('[data-topic-evidence]').forEach(b=>b.onclick=()=>{const rs=rows.filter(r=>(r.topic||'未分类')===b.dataset.topicEvidence);$('#detailBody').innerHTML=`<h2>${esc(b.dataset.topicEvidence)} · 原始记录</h2>${rs.map(r=>`<section class="panel"><h3>${esc(r.platform)} · ${esc(r.prompt_id)}</h3><p>${esc(r.prompt)}</p>${answerBlock(r)}</section>`).join('')}`;$('#detail').showModal();bind()});
  };
  function bind(){document.querySelectorAll('[data-evidence]').forEach(b=>b.onclick=()=>{if($('#detail').open)$('#detail').close();detail(b.dataset.evidence)})}
})();
