/* Source membership is explicit metadata, never inferred from words in a prompt. */
window.ACEPromptLibrary = (() => {
  const groups = {core: '原有业务', song_generation: '歌曲生成'};
  const styles = {N: 'N · 直接需求', R: 'R · 推荐与比较', C: 'C · 带条件需求', B: 'B · 品牌诊断'};
  const enhancedViews = new Set(['overview', 'sources', 'performance', 'prompts', 'song-generation']);
  const metadata = item => item.metadata || prompts.find(p => p.id === item.prompt_id)?.metadata || {};
  const archived = item => metadata(item).archived === true;
  const current = () => prompts.filter(p => !archived(p));
  const selection = () => document.querySelector('#topic')?.value || '';
  const group = item => metadata(item).library_group ||
    (metadata(item).created_via === 'dashboard' && !archived(item) ? 'core' : '');
  const unique = values => [...new Set(values.filter(Boolean))].sort((a,b) => a.localeCompare(b));
  function matches(item, options = {}) {
    const chosen = options.topic ?? selection();
    const meta = metadata(item);
    if (chosen === 'library:history') {
      if (!archived(item)) return false;
    } else {
      if (enhancedViews.has(view) && archived(item)) return false;
      if (chosen.startsWith('library:') && group(item) !== chosen.slice(8)) return false;
      if (chosen.startsWith('core-topic:')) {
        if (group(item) !== 'core' || item.topic !== chosen.slice(11)) return false;
      } else if (chosen && !chosen.startsWith('library:') && item.topic !== chosen) return false;
    }
    if (!enhancedViews.has(view) || options.details === false) return true;
    for (const [id, field] of [
      ['libraryDimension','selection_dimension'], ['libraryScenario','scenario_label'],
      ['libraryStyle','question_style']
    ]) {
      const value = document.getElementById(id)?.value;
      if (value && meta[field] !== value) return false;
    }
    const search = document.getElementById('librarySearch')?.value.trim().toLowerCase();
    return !search || [item.text, item.prompt, item.id, item.prompt_id, meta.scene, meta.text_zh]
      .some(value => String(value || '').toLowerCase().includes(search));
  }
  function topics() {
    const chosen = selection();
    const hasGroups = current().some(p => group(p));
    const options = hasGroups
      ? '<option value="">全部主题（当前题库）</option>' +
        Object.entries(groups).map(([key,label]) => `<option value="library:${key}">${label}</option>`).join('') +
        '<optgroup label="原有业务 · 具体主题">' +
        unique(current().filter(p => group(p)==='core').map(p => p.topic)).map(topic => `<option value="core-topic:${esc(topic)}">${esc(topic)}</option>`).join('') +
        '</optgroup>' +
        (prompts.some(archived) ? '<option value="library:history">历史题库（已停用）</option>' : '')
      : '<option value="">全部主题</option>' +
        unique([...prompts,...real].map(p => p.topic)).map(topic => `<option value="${esc(topic)}">${esc(topic)}</option>`).join('');
    document.getElementById('topic').innerHTML = options;
    document.getElementById('topic').value = chosen;
  }
  function badge(item) {
    const meta = metadata(item);
    return `${group(item) ? `<span class="badge">${esc(groups[group(item)])}</span> ` : ''}` +
      `${meta.selection_dimension && meta.selection_dimension !== groups[group(item)] ? `<span class="badge">${esc(meta.selection_dimension)}</span> ` : ''}` +
      `${meta.question_style ? `<span class="badge">${esc(styles[meta.question_style] || meta.question_style)}</span>` : ''}`;
  }
  function description(item) {
    const meta = metadata(item);
    return badge(item) + (meta.scene ? `<div class="hint">${esc(meta.scene)}</div>` : '') +
      (meta.text_zh ? `<details class="prompt-translation"><summary>中文释义</summary><p>${esc(meta.text_zh)}</p></details>` : '');
  }
  function resetDetails() {
    for (const id of ['libraryDimension','libraryScenario','libraryStyle','librarySearch']) {
      const element = document.getElementById(id);
      if (element) element.value = '';
    }
  }
  function updateFilters() {
    const toolbar = document.getElementById('libraryFilters');
    if (!toolbar) return;
    toolbar.hidden = !enhancedViews.has(view);
    const scoped = prompts.filter(p => matches(p, {details: false}));
    for (const [id, field, label] of [
      ['libraryDimension','selection_dimension','全部选题维度'],
      ['libraryScenario','scenario_label','全部歌曲场景'],
      ['libraryStyle','question_style','全部问法']
    ]) {
      const element = document.getElementById(id), previous = element.value;
      element.innerHTML = `<option value="">${label}</option>` +
        unique(scoped.map(p => metadata(p)[field])).map(value =>
          `<option value="${esc(value)}">${esc(id === 'libraryStyle' ? styles[value] || value : value)}</option>`).join('');
      element.value = previous;
      if (element.selectedIndex < 0) element.value = '';
      if (id === 'libraryScenario') element.closest('label').hidden = !scoped.some(p => metadata(p).scenario_label);
    }
  }
  function renderSong() {
    $('#breadcrumb').textContent = '歌曲生成';
    $('#title').textContent = '歌曲生成 · 提示词效果';
    $('#subtitle').textContent = '单独观察歌曲生成题库的 12 类场景及不同问法，查看品牌推荐与官网引用表现。';
    const songs = current().filter(p => group(p) === 'song_generation');
    const selected = songs.filter(p => matches(p));
    const songIds = new Set(songs.map(p => p.id));
    const results = filtered().filter(r => songIds.has(r.prompt_id));
    const answered = new Set(results.filter(r => r.status === 'success').map(r => r.prompt_id));
    $('#content').innerHTML = `<section class="panel wide">
      <div class="row"><h2>歌曲生成 Prompt 效果表</h2><span class="badge">显示 ${selected.length} / ${songs.length} 条</span></div>
      <p>仅包含歌曲生成专题表中的题目。当前筛选有 ${answered.size} 道题获得有效回答。</p>
      <div class="library-links"><button data-library-go="overview">查看可见性与时间对比</button>
        <button data-library-go="sources">查看引用</button><button data-library-go="performance">查看提示词效果</button></div>
      <div class="metric-scroll song-performance">${table(
        ['Prompt / 场景','测试平台','有效回答数','ACE 提及率','平均位置','官网引用覆盖率','最近测试','原始记录'],
        selected.map(p => {
          const rows = results.filter(r => r.prompt_id === p.id), result = metrics(rows);
          const last = rows.slice().sort((a,b) => String(b.tested_at).localeCompare(String(a.tested_at)))[0];
          return [
            `<b>${esc(p.text)}</b>${description(p)}<small>${esc(p.id)}</small>`,
            [...new Set(result.base.map(r => r.platform))].map(esc).join('<br>') || '未测试',
            result.base.length, result.mention, result.position, result.coverage,
            last ? esc(new Date(last.tested_at).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'})) : '—',
            last ? `<button data-library-result="${esc(last.id)}">查看最新回答</button>` : '—'
          ];
        }))}</div>
      <p class="hint">没有测试结果时，比例与平均位置显示“—”。平均位置仅统计提及 ACE 且位置已知的回答。</p>
    </section>`;
    document.querySelectorAll('[data-library-result]').forEach(button => button.onclick = () => detail(button.dataset.libraryResult));
    document.querySelectorAll('[data-library-go]').forEach(button => button.onclick = () => {
      view = button.dataset.libraryGo; render();
    });
  }
  function install() {
    const toolbar = document.createElement('div');
    toolbar.id = 'libraryFilters';
    toolbar.className = 'library-filters';
    toolbar.innerHTML = `<label>选题维度 <select id="libraryDimension"></select></label>
      <label>歌曲场景 <select id="libraryScenario"></select></label>
      <label>问法 <select id="libraryStyle"></select></label>
      <label>搜索 <input id="librarySearch" type="search" placeholder="英文题目、中文释义或编号"></label>`;
    $('.filters').appendChild(toolbar);
    toolbar.querySelectorAll('select').forEach(element => element.onchange = () => render());
    $('#librarySearch').oninput = () => render();
    const previousTopicChange = $('#topic').onchange;
    $('#topic').onchange = event => { resetDetails(); previousTopicChange(event); };
    const previousReset = $('#reset').onclick;
    $('#reset').onclick = event => { resetDetails(); previousReset(event); };
    const previousRender = render;
    render = function() {
      if (view === 'song-generation') {
        $('#topic').value = 'library:song_generation';
        $('#topic').disabled = true;
      } else {
        $('#topic').disabled = false;
      }
      updateFilters();
      if (view === 'song-generation') renderSong();
      else previousRender();
      if (enhancedViews.has(view) && current().some(p => group(p))) {
        const scope = document.createElement('p');
        scope.className = 'notice library-scope';
        scope.id = 'libraryScope';
        const selected = prompts.filter(p => matches(p));
        scope.textContent = selection() === 'library:history'
          ? '正在查看已停用的历史题库及其测试记录。'
          : `当前题库 ${current().length} 条：原有业务 ${current().filter(p => group(p)==='core').length} 条、歌曲生成 ${current().filter(p => group(p)==='song_generation').length} 条；当前筛选 ${selected.length} 条。新题目须完成测试后才会出现指标。`;
        $('#content').prepend(scope);
      }
      document.querySelectorAll('nav button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    };
    $('nav [data-view="song-generation"]').onclick = () => {
      resetDetails(); view = 'song-generation'; render();
    };
  }
  return {metadata, archived, current, matches, topics, group, groups, description, resetDetails, install};
})();
