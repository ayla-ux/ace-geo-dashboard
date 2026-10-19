const pilotPrompts=[
['us01','US','en','Discovery','What AI music creation tools should an independent music producer consider, and what is each best suited for?'],
['us02','US','en','Discovery','What are the best AI singing voice tools for producing realistic lead vocals?'],
['us03','US','en','Discovery','Which AI music tools offer detailed creative control rather than only generating a finished song?'],
['us04','US','en','Discovery','Which AI vocal tools are suitable for a songwriter who cannot sing their own demos?'],
['us05','US','en','Vocal production','I have a MIDI melody and lyrics. Which tools can turn them into editable singing vocals?'],
['us06','US','en','Vocal production','Which tools let me precisely edit singing pitch, timing, pronunciation and expression?'],
['us07','US','en','Vocal production','What AI vocal tools fit into a DAW workflow for professional music production?'],
['us08','US','en','Vocal production','Which AI singing tools can create English harmonies and backing vocals for a pop track?'],
['us09','US','en','Voice workflow','What tools can create a custom AI singing voice from my own recordings? Compare their workflows and limitations.'],
['us10','US','en','Voice workflow','How can I replace the timbre of a recorded singing performance while preserving the melody? Which tools should I compare?'],
['us11','US','en','Buying decision','Which AI vocal production tools provide clear commercial-use licensing, and where can I verify the terms?'],
['us12','US','en','Buying decision','Which AI music and singing tools can I try before choosing a paid production workflow?'],
['us13','US','en','Buying decision','For making a polished song demo, when should I use an AI song generator versus an editable vocal synthesizer? Recommend tools for each.'],
['us14','US','en','Agent workflow','Which music or singing tools have publicly documented APIs suitable for an AI agent workflow? Cite documentation and distinguish verified capabilities from speculation.'],
['jp01','JP','ja','Discovery','音楽制作者向けのAI歌声合成ソフトにはどのような選択肢がありますか？それぞれの特徴と用途を比較してください。'],
['jp02','JP','ja','Vocal production','MIDIのメロディーと日本語の歌詞から、発音やピッチを細かく編集できる歌声を作りたいです。どのツールを比較すべきですか？'],
['jp03','JP','ja','Buying decision','商用の楽曲制作に使うAIボーカルツールを選ぶ際、どの製品と利用規約を確認すべきですか？'],
['cn01','CN','zh','Discovery','有哪些适合音乐制作人的 AI 歌声合成工具？请比较各自的主要用途和特点。'],
['cn02','CN','zh','Vocal production','我有 MIDI 旋律和中文歌词，想生成可以编辑咬字、音高和情感的人声，应该比较哪些工具？'],
['cn03','CN','zh','Buying decision','用于商业歌曲制作的 AI 人声工具有哪些？应该在哪里核实授权范围和使用限制？']
].map(([id,target_market,language,topic,text])=>({id:'pilot-'+id,target_market,language,topic,text,prompt_type:'unbranded',active:true,version:1}));
const pilotButton=document.createElement('button');pilotButton.textContent='添加首轮题库（20题）';pilotButton.onclick=()=>{let map=new Map(prompts.map(p=>[p.id,p]));pilotPrompts.forEach(p=>{if(!map.has(p.id))map.set(p.id,{...p})});let next=[...map.values()];try{localStorage.setItem(key,JSON.stringify({results:real,prompts:next}));prompts=next;view='prompts';topics();render();alert('已添加首轮 20 题（美国英文14、日本日文3、中国中文3）。原有题目保留；首轮仅导出 pilot- 开头的题目，或先停用不参与测试的旧题。')}catch(e){alert('未保存：'+e.message)}};$('#import').before(pilotButton);
