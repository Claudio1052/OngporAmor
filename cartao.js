'use strict';
(async()=>{
 const config={"url":"https://unidzfxifxjruonbjspe.supabase.co","key":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuaWR6ZnhpZnhqcnVvbmJqc3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NTc0MTEsImV4cCI6MjA4ODQzMzQxMX0.0R_FvMXHDvt34bpa5Fi9pkJcu_zGy8Av86wVaXp2F3o"};
 const status=document.getElementById('status'),form=document.getElementById('card-form'),pay=document.getElementById('pay'),check=document.getElementById('check');
 let intent=new URLSearchParams(location.hash.slice(1)).get('intent'),submitted=false,poll=null,loading=false;
 history.replaceState({},'',location.pathname);
 try{
  if(!/^[0-9a-f-]{36}$/i.test(intent||'')||!config)throw Error('Abra a contribuição pelo seu extrato.');
  const client=supabase.createClient(config.url,config.key);
  const {data,error}=await client.auth.getUser();if(error||!data.user?.email_confirmed_at)throw Error('Sua sessão expirou. Volte ao aplicativo e entre novamente.');
  async function api(path,body){const {data:{session}}=await client.auth.getSession();if(!session)throw Error('Entre novamente para continuar.');const response=await fetch('https://ong-mp-proxy.ongporamoradmin.workers.dev'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('Não foi possível confirmar. Confira seu extrato antes de tentar novamente.');return response.json();}
  const details=await api('/checkout/detalhes',{intent});if(!details.public_key)throw Error('Pagamento com cartão aguardando configuração pela ONG.');
  document.getElementById('amount').textContent=Number(details.amount).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+' · crédito à vista';document.getElementById('email').value=details.email;
  async function result(payment){
   if(payment.intent)intent=payment.intent;
   check.hidden=false;
   if(payment.status==='approved'){status.textContent='Pagamento confirmado. Obrigado pelo seu apoio! O comprovante será enviado por e-mail.';form.hidden=true;check.hidden=true;clearInterval(poll);document.getElementById('challenge').textContent='';return;}
   if(['rejected','cancelled'].includes(payment.status)){status.textContent='Pagamento não aprovado. Volte ao extrato para escolher outra forma de pagamento.';form.hidden=true;clearInterval(poll);return;}
   status.textContent=payment.status==='not_submitted'?'Nenhum pagamento foi localizado. Volte ao extrato para conferir.':'Pagamento aguardando confirmação. Acompanhe seu extrato.';
   if(payment.challenge&&!document.querySelector('iframe.bank')){
    const url=new URL(payment.challenge.url);if(url.protocol!=='https:'||url.username||url.password||!url.hostname.includes('.')||!/^[A-Za-z0-9_=-]{20,16000}$/.test(payment.challenge.creq))throw Error('Não foi possível abrir a autenticação do banco.');
    form.hidden=true;const box=document.getElementById('challenge'),frame=document.createElement('iframe');frame.className='bank';frame.name='bank-auth';frame.title='Autenticação segura do banco';frame.referrerPolicy='no-referrer';box.append(frame);
    const post=document.createElement('form');post.method='POST';post.action=url.href;post.target=frame.name;const field=document.createElement('input');field.type='hidden';field.name='creq';field.value=payment.challenge.creq;post.append(field);box.append(post);post.submit();post.remove();status.textContent='Seu banco precisa autenticar o pagamento. Conclua a etapa abaixo.';
   }
  }
  check.onclick=async()=>{if(loading)return;loading=true;check.disabled=true;try{await result(await api('/checkout/consultar',{intent}));}catch(e){status.textContent=e.message;}finally{loading=false;check.disabled=false;}};
  const mp=new MercadoPago(details.public_key,{locale:'pt-BR'});
  const cardForm=mp.cardForm({amount:Number(details.amount).toFixed(2),iframe:true,form:{id:'card-form',cardNumber:{id:'number',placeholder:'Número do cartão'},expirationDate:{id:'expiry',placeholder:'MM/AA'},securityCode:{id:'cvv',placeholder:'Código de segurança'},cardholderName:{id:'holder'},issuer:{id:'issuer'},installments:{id:'installments'},identificationType:{id:'document-type'},identificationNumber:{id:'document'},cardholderEmail:{id:'email'}},callbacks:{onFormMounted:error=>{if(error){status.textContent='Não foi possível carregar os campos seguros. Recarregue a página.';return;}pay.disabled=false;status.textContent='Preencha os dados do titular e do cartão.';},onSubmit:async event=>{
   event.preventDefault();if(submitted)return;submitted=true;pay.disabled=true;status.textContent='Processando. Aguarde a confirmação…';
   try{const fields=cardForm.getCardFormData();if(fields.identificationType!=='CPF'||Number(fields.installments)!==1)throw Error('Use CPF e pagamento à vista.');await result(await api('/checkout/pagar',{intent,method:'card',token:fields.token,payment_method_id:fields.paymentMethodId,issuer_id:fields.issuerId,identification:fields.identificationNumber}));}
   catch(e){status.textContent=e.message;check.hidden=false;}
   poll=setInterval(()=>{if(!document.hidden&&navigator.onLine&&!loading)check.click();},10000);
  }}});
  form.hidden=false;
 }catch(e){status.textContent=e.message||'Não foi possível abrir o pagamento.';}
 addEventListener('pagehide',()=>{if(poll)clearInterval(poll);});
})();
