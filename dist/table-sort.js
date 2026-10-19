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
