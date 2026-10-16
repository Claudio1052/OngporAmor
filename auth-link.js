'use strict';
(()=>{
  const params=new URLSearchParams(location.hash.slice(1));
  let token=params.get('token_hash');
  const type=params.get('type'),button=document.getElementById('access-continue'),message=document.getElementById('access-message');
  // Fragments never reach the static server. Remove the credential from history
  // before any navigation; keep it only in this page's memory until the click.
  history.replaceState(null,'',location.pathname);
  let authOrigin;
  try{const origin=new URL(document.documentElement.dataset.authOrigin);if(origin.protocol!=='https:'||!/^[a-z0-9]+\.supabase\.co$/.test(origin.hostname)||origin.port||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Invalid origin');authOrigin=origin.origin;}catch{}
  if(!authOrigin||!['email','recovery'].includes(type)||!token||!/^[A-Za-z0-9_-]{20,512}$/.test(token)){
    token=null;message.textContent='Este link está incompleto. Volte ao site e solicite um novo e-mail de acesso.';return;
  }
  const recovery=type==='recovery';
  document.getElementById('access-title').textContent=recovery?'Recuperar acesso':'Confirme seu acesso';
  message.textContent=recovery?'Toque em continuar para validar o link e criar sua nova senha.':'Toque em continuar para validar seu e-mail e entrar na sua conta.';
  button.textContent=recovery?'Continuar para criar nova senha':'Continuar com segurança';button.disabled=false;
  button.addEventListener('click',()=>{
    if(button.disabled||!token)return;
    const verify=new URL('/auth/v1/verify',authOrigin);
    verify.searchParams.set('token',token);verify.searchParams.set('type',type);
    verify.searchParams.set('redirect_to','https://www.ongporamor.top/'+(recovery?'?type=recovery':''));
    token=null;button.disabled=true;message.textContent='Validando seu acesso…';
    location.replace(verify.href);
  });
})();
