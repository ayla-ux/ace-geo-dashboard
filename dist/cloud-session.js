document.addEventListener('DOMContentLoaded',()=>{
  const button=document.createElement('button');
  button.textContent='退出登录';
  button.style.cssText='position:fixed;right:20px;bottom:16px;z-index:1000;padding:8px 14px;background:white;border:1px solid #ccd4e1;border-radius:6px;cursor:pointer';
  button.onclick=async()=>{
    button.disabled=true;
    try{
      const response=await fetch('/api/config');
      if(response.status===401){location.assign('/login');return}
      if(!response.ok)throw Error('无法读取登录状态');
      const config=await response.json();
      const result=await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-GEO-Token':config.csrf_token},body:'{}'});
      if(!result.ok)throw Error('退出失败，请重试');
      location.assign('/login');
    }catch(e){alert(e.message);button.disabled=false}
  };
  document.body.appendChild(button);
});
