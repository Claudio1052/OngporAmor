'use strict';
window.AmorSponsors=(()=>{
 const API='https://ong-mp-proxy.ongporamoradmin.workers.dev',E=AmorDomain.escapeHTML,money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 let hooks,board,mine,user,selected,ws,reconnect,timer,paymentBusy=false,adminMode=false,stopped=true,associateAvailable=false;
 const g=id=>document.getElementById(id),node=(tag,text,className)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;};
 const benefits={diamante:['Destaque central no painel','Certificado Empresa Amiga da Por Amor','Marcação nas publicações','Agradecimento exclusivo mensal','Relatório mensal de alcance e fotos','Logo na camiseta do projeto','Nome em faixas e troféus','Exclusividade no segmento e ação em evento'],ouro:['Logo grande no painel','Certificado Empresa Amiga da Por Amor','Marcação nas publicações','Agradecimento exclusivo bimestral','Relatório mensal de alcance e fotos','Logo na camiseta do projeto','Nome em faixas e troféus'],prata:['Logo média no painel','Certificado Empresa Amiga da Por Amor','Marcação nas publicações','Agradecimento exclusivo trimestral','Relatório mensal de alcance e fotos'],bronze:['Logo pequena no painel','Certificado Empresa Amiga da Por Amor','Marcação nas publicações','Agradecimento exclusivo semestral'],ferro:['Logo na faixa inferior do painel','Certificado Empresa Amiga da Por Amor']};
 const call=(path,body)=>hooks.gateway('/patrocinadores/'+path,body);
 function status(text,error=false){const el=g('sponsor-status');if(el){el.textContent=text;el.classList.toggle('sponsor-error',error);}}
 async function task(fn){try{return await fn();}catch(e){status(e.message||'Não foi possível concluir. Atualize antes de tentar novamente.',true);}}
 function install(h){
  hooks=h;if(g('view-patrocinador'))return;
  const view=node('section',null,'view');view.id='view-patrocinador';
  view.innerHTML='<header class="sponsor-topbar"><div><img src="assets/por-amor-logo.png" alt="Associação Por Amor"><span>Parceiros Por Amor</span></div><button type="button" data-exit>Sair</button></header><main class="sponsor-main"><div class="sponsor-heading"><div><p class="sponsor-eyebrow">ESPORTE QUE TRANSFORMA</p><h1>Seu lugar nessa história</h1><p>Escolha onde sua marca vai apoiar as aulas e aparecer no painel da ONG.</p></div><button type="button" data-refresh>Atualizar</button></div><p id="sponsor-status" role="status" aria-live="polite"></p><div class="sponsor-tabs" role="group" aria-label="Área de patrocínio"><button type="button" data-panel>Ver painel</button><button type="button" data-own>Meu patrocínio</button><button type="button" data-admin hidden>Gestão dos planos</button></div><div id="sponsor-board-region"></div><div id="sponsor-details"></div></main>';
  document.getElementById('app').append(view);view.querySelector('[data-exit]').onclick=()=>{if(user||hooks.isAdmin())return hooks.logout();stop();hooks.showView('view-admin-login');};view.querySelector('[data-refresh]').onclick=()=>task(refresh);
  view.querySelector('.sponsor-main').prepend(areaSwitcher('patrocinio'));
  g('view-associado').querySelector('.assoc-topbar').after(areaSwitcher('associado'));
  view.querySelector('[data-panel]').onclick=()=>{g('sponsor-board-region').hidden=false;g('sponsor-details').hidden=true;pressTab('panel');scrollToCard(g('sponsor-board-region'));};
  view.querySelector('[data-own]').onclick=()=>task(async()=>{if(!user)return begin();await loadMine();showOwn();pressTab('own');scrollToCard(g('sponsor-details'));});
  view.querySelector('[data-admin]').onclick=()=>task(openAdmin);
  const choice=node('button',null,'tipo-opt');choice.id='tipo-opt-patrocinador';choice.type='button';choice.innerHTML='<span class="tipo-opt-icon" aria-hidden="true">🏅</span><span class="tipo-opt-title">Patrocinador</span><span class="tipo-opt-desc">Cadastre sua empresa, escolha uma cota e coloque sua marca no painel Parceiros Por Amor.</span>';choice.onclick=()=>selecionarTipo('patrocinador');g('tipo-select-overlay').querySelector('.tipo-options').append(choice);
  const publicButton=node('button','Conheça o painel de patrocinadores','recovery-button');publicButton.type='button';publicButton.onclick=()=>task(()=>openPublic());g('view-admin-login').querySelector('.login-card').append(publicButton);
  const adminButton=node('button','🏅 Patrocinadores','atab');adminButton.type='button';adminButton.onclick=()=>task(openAdmin);document.querySelector('.admin-tabs')?.append(adminButton);
  const mobileAdmin=node('button',null,'bnav-item');mobileAdmin.id='abnav-patrocinadores';mobileAdmin.type='button';mobileAdmin.setAttribute('aria-label','Patrocinadores');mobileAdmin.innerHTML='<i class="fas fa-award" aria-hidden="true"></i><span>Patrocinadores</span>';mobileAdmin.onclick=()=>task(openAdmin);const adminNav=g('admin-bottom-nav');adminNav?.insertBefore(mobileAdmin,adminNav.lastElementChild);
  const management=node('button','Patrocinadores e valores dos planos','recovery-button');management.type='button';management.onclick=()=>task(openAdmin);document.querySelector('.admin-minimum-summary')?.after(management);
  const back=node('button','Voltar à gestão','sponsor-back');back.type='button';back.onclick=()=>{stop();hooks.showView('view-admin');};view.querySelector('.sponsor-tabs').append(back);back.hidden=true;
  for(const id of ['view-associado','view-doador']){const b=node('button','Patrocinar com minha empresa','recovery-button');b.type='button';b.onclick=()=>task(()=>begin());g(id)?.querySelector('.privacy-links')?.before(b);}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)closeSocket();else if(!stopped)connect();});
 }
 function pressTab(name){for(const [attr,id] of [['data-panel','panel'],['data-own','own']])g('view-patrocinador')?.querySelector('['+attr+']')?.setAttribute('aria-pressed',String(id===name));}
 function areaSwitcher(active){
  const nav=node('nav',null,'member-area-switcher');nav.setAttribute('aria-label','Alternar áreas da conta');
  for(const [id,label] of [['associado','Área do associado'],['patrocinio','Patrocínio da empresa']]){const b=node('button',label);b.type='button';b.dataset.memberArea=id;if(id===active){b.setAttribute('aria-current','page');b.disabled=true;}else b.onclick=()=>task(async()=>{b.disabled=true;try{if(id==='associado')await hooks.openAssociate();else await begin();}finally{b.disabled=false;}});nav.append(b);}
  if(active==='patrocinio')nav.hidden=true;
  return nav;
 }
 async function loadAssociateAccess(){try{associateAvailable=Boolean(await hooks.hasAssociate?.());}catch{associateAvailable=false;}}
 function show(){hooks.showView('view-patrocinador');g('sponsor-details').hidden=false;g('sponsor-board-region').hidden=false;g('view-patrocinador').querySelector('.member-area-switcher').hidden=!associateAvailable||adminMode;g('view-patrocinador').querySelector('[data-admin]').hidden=!hooks.isAdmin();g('view-patrocinador').querySelector('.sponsor-back').hidden=!hooks.isAdmin();g('view-patrocinador').querySelector('[data-exit]').textContent=user||hooks.isAdmin()?'Sair':'Entrar';stopped=false;connect();}
 async function publicBoard(){if(window.AmorReview?.active){board=await window.AmorReview.gateway('/patrocinadores/painel');renderBoard();return board;}const r=await fetch(API+'/patrocinadores/painel',{signal:AbortSignal.timeout(15000)});const result=await r.json();if(!r.ok)throw Error(result.error);board=result;renderBoard();return board;}
 async function openPublic(){adminMode=false;show();g('sponsor-details').replaceChildren();await publicBoard();status('Painel público · logos publicadas após a confirmação da contribuição inicial.');}
 async function route(u){user=u;try{mine=await call('minha-area');}catch{return false;}if(!mine.profile)return false;await loadAssociateAccess();adminMode=false;show();await publicBoard();showOwn();return true;}
 async function begin(){
  adminMode=false;const session=(await hooks.session())?.session;if(!session){hooks.showView('view-admin-login');hooks.toast('Entre ou crie sua conta para cadastrar o patrocínio.');return;}
  user=session.user||user;mine=await call('minha-area');await loadAssociateAccess();show();await publicBoard();if(mine.profile)showOwn();else showForm();
 }
 async function loadMine(){mine=await call('minha-area');}
 async function refresh(){await publicBoard();if(user&&!adminMode){await loadMine();showOwn();}else if(adminMode)await openAdmin();status('Painel atualizado.');}
 function renderBoard(){
  if(!board)return;const region=g('sponsor-board-region');region.replaceChildren();const picker=node('label','Escolha uma posição pelo plano e valor','sponsor-mobile-picker'),select=node('select',null,'fi');select.setAttribute('aria-label','Posição no painel');const empty=node('option','Selecione uma posição');empty.value='';select.append(empty);for(const slot of board.slots){const tier=board.plans.find(t=>t.id===slot.tier),option=node('option',tier.name+' '+slot.id.split('-')[1]+' · '+money(tier.monthly)+'/mês'+(slot.status!=='available'?' · '+(slot.status==='occupied'?'ocupado':'reservado'):''));option.value=slot.id;option.disabled=slot.status!=='available'&&mine?.profile?.slot!==slot.id;option.selected=selected===slot.id;select.append(option);}select.onchange=()=>{const slot=board.slots.find(s=>s.id===select.value);if(!slot)return;selected=slot.id;renderBoard();showPlan(board.plans.find(t=>t.id===slot.tier),slot);};picker.append(select);region.append(picker);const box=node('div',null,'sponsor-panel');
  box.innerHTML='<div class="sponsor-panel-header"><img src="assets/por-amor-logo.png" alt="Associação Por Amor"><strong>PARCEIROS POR AMOR</strong></div>';
  for(const tier of board.plans){const row=node('div',null,'sponsor-row tier-'+tier.id);row.setAttribute('aria-label','Cota '+tier.name);
   for(const slot of board.slots.filter(s=>s.tier===tier.id)){
    const button=node('button',null,'sponsor-slot '+slot.status);button.type='button';button.dataset.slot=slot.id;button.dataset.position=slot.id.split('-')[1];button.setAttribute('aria-pressed',String(selected===slot.id));
    button.setAttribute('aria-label',slot.status==='occupied'?slot.name+' · '+tier.name:slot.id+' · '+money(tier.monthly)+' por mês · '+(slot.status==='reserved'?'reservado':'disponível'));
    if(slot.status==='occupied'){const img=node('img');img.src=window.AmorReview?.active?'assets/por-amor-logo.png':'https://cdn.ongporamor.top'+slot.logo;img.alt=slot.name;img.loading='lazy';button.append(img);button.onclick=()=>{status(slot.name+' · '+tier.name);};}
    else{button.append(node('strong',tier.name),node('span',slot.id.split('-')[1]+' · '+money(tier.monthly)),node('small',slot.status==='reserved'?'Reservado':'Escolher'));button.disabled=slot.status==='reserved'&&mine?.profile?.slot!==slot.id;button.onclick=()=>{selected=slot.id;renderBoard();showPlan(tier,slot);};}
    row.append(button);
   }box.append(row);
  }region.append(box,node('p','Painel de parceiros no espaço de treino · 3,0 m × 2,0 m. Os espaços e proporções acompanham a cota escolhida.','sponsor-caption'));
 }
 function showPlan(tier,slot){
  const details=g('sponsor-details');details.hidden=false;details.replaceChildren();const card=node('section',null,'sponsor-card');card.append(node('p','POSIÇÃO '+slot.id.toUpperCase(),'sponsor-eyebrow'),node('h2',tier.name+' · '+money(tier.monthly)+'/mês'));
  const ul=node('ul');for(const item of benefits[tier.id])ul.append(node('li',item));card.append(ul,node('p','Plano anual: '+money(tier.annual)+' antecipados, com 10% de desconto. Compromisso mínimo de 6 meses. Não há débito automático.'));
  const b=node('button','Escolher esta posição','sponsor-primary');b.type='button';b.onclick=()=>task(async()=>{if(!user){await begin();return;}showForm(slot.id);});card.append(b);details.append(card);card.scrollIntoView?.({behavior:'smooth',block:'start'});
 }
 function input(field,label,{type='text',required=true,value='',max=160,auto='',mode='',hint='',pair=false,placeholder=''}={}){return '<label'+(pair?' class="sponsor-pair"':'')+'><span>'+E(label)+(required?'':' <span class="sponsor-optional">(opcional)</span>')+'</span><input class="fi" name="'+field+'" type="'+type+'" '+(required?'required':'')+' maxlength="'+max+'" value="'+E(value)+'"'+(auto?' autocomplete="'+auto+'"':'')+(mode?' inputmode="'+mode+'"':'')+(placeholder?' placeholder="'+E(placeholder)+'"':'')+'>'+(hint?'<small class="sponsor-hint">'+E(hint)+'</small>':'')+'</label>';}
 function group(title,content){return '<fieldset class="sponsor-fieldset sponsor-form-wide"><legend>'+E(title)+'</legend><div class="sponsor-fieldset-grid">'+content+'</div></fieldset>';}
 function scrollToCard(card){(window.requestAnimationFrame||setTimeout)(()=>card.scrollIntoView?.({behavior:'smooth',block:'start'}));}
 function bindAddress(form){
  const field=name=>form.querySelector('[name='+name+']'),cep=field('cep'),hint=form.querySelector('[data-cep-status]');let looked='',sequence=0;
  for(const [name,format] of [['cep',AmorDomain.formatCEP],['phone',AmorDomain.formatPhone],['document',AmorDomain.formatDocument]]){const el=field(name);if(el.value)el.value=format(el.value);el.addEventListener('input',()=>{el.value=format(el.value);});}
  field('state').addEventListener('input',()=>{field('state').value=field('state').value.replace(/[^A-Za-z]/g,'').slice(0,2).toUpperCase();});
  async function search(force=false){
   const digits=cep.value.replace(/\D/g,'');if(digits.length!==8){if(force&&digits)hint.textContent='Digite os 8 números do CEP.';return;}
   if(digits===looked&&!force)return;looked=digits;const current=++sequence;hint.textContent='Buscando endereço…';cep.setAttribute('aria-busy','true');
   try{
    const address=await AmorDomain.lookupCEP(digits);if(current!==sequence)return;
    for(const [name,value] of [['street',address.street],['district',address.district],['city',address.city],['state',address.state]])if(value)field(name).value=value;
    hint.textContent='Endereço preenchido pelo CEP. Confira e informe o número.';(address.street?field('number'):field('street')).focus?.();
   }catch(error){if(current!==sequence)return;looked='';hint.textContent=error.code==='CEP_NOT_FOUND'?'CEP não encontrado. Confira o número ou preencha o endereço manualmente.':'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.';}
   finally{if(current===sequence)cep.removeAttribute('aria-busy');}
  }
  cep.addEventListener('input',()=>search());cep.addEventListener('change',()=>search(true));
  return search;
 }
 function showForm(slotId=selected||mine?.profile?.slot){
  const p=mine?.profile||{};selected=slotId;renderBoard();const details=g('sponsor-details');details.hidden=false;details.replaceChildren();const card=node('section',null,'sponsor-card');card.innerHTML='<p class="sponsor-eyebrow">'+(mine?.profile?'EDITAR CADASTRO':'NOVO PATROCÍNIO')+'</p><h2>Cadastro de patrocinador</h2><p>Escolha uma posição disponível no painel e preencha os dados da empresa. Campos sem a indicação “opcional” são obrigatórios.</p>';
  const form=node('form');form.className='sponsor-form';
  form.innerHTML=group('Empresa',input('company','Razão social / Nome completo',{value:p.company,auto:'organization'})+input('trade_name','Nome da marca no painel',{value:p.trade_name,hint:'É o nome exibido junto à logo.'})+input('document','CNPJ / CPF',{value:p.document,max:25,placeholder:'00.000.000/0000-00'})+input('segment','Segmento de atuação',{value:p.segment,placeholder:'Ex.: comércio, saúde, serviços'}))
   +group('Contato',input('contact','Responsável pelo patrocínio',{value:p.contact,auto:'name'})+input('phone','Telefone / WhatsApp',{type:'tel',value:p.phone,auto:'tel',mode:'tel',max:16,placeholder:'(83) 90000-0000'})+'<label>E-mail de acesso<input class="fi" type="email" readonly value="'+E(p.email||user?.email||'')+'"><small class="sponsor-hint">Vinculado à conta conectada.</small></label>'+input('website','Site',{type:'url',required:false,value:p.website,auto:'url',placeholder:'https://'})+input('instagram','Instagram da empresa',{required:false,value:p.instagram,placeholder:'@suaempresa'}))
   +group('Endereço',input('cep','CEP',{required:false,value:p.cep,auto:'postal-code',mode:'numeric',max:9,placeholder:'00000-000',hint:'Digite o CEP para preencher o endereço automaticamente.'})+input('street','Logradouro',{required:false,value:p.street,auto:'address-line1',max:220})+input('number','Número',{required:false,value:p.number,max:20,pair:true})+input('complement','Complemento',{required:false,value:p.complement,auto:'address-line2',pair:true})+input('district','Bairro',{required:false,value:p.district,auto:'address-level3'})+input('city','Cidade',{value:p.city,auto:'address-level2',pair:true})+input('state','UF',{value:p.state,max:2,auto:'address-level1',placeholder:'PB',pair:true}))
   +'<div class="sponsor-form-wide sponsor-consents"><label><input type="checkbox" name="consent_logo" required><span>Autorizo a publicação do nome e da logo da marca no painel da ONG e nas divulgações institucionais descritas no projeto.</span></label><label><input type="checkbox" name="consent_data" required><span>Concordo com o uso dos dados para cadastro, gestão do patrocínio e pagamentos, conforme a <a href="https://www.ongporamor.top/privacidade.html" target="_blank" rel="noopener">Política de privacidade</a>.</span></label><label><input type="checkbox" name="consent_terms" required><span>Li as contrapartidas da cota selecionada. O compromisso mínimo é de 6 meses. O plano mensal é pago por contribuição; o anual é antecipado, com 10% de desconto. Não há cobrança automática.</span></label></div><p class="sponsor-form-wide sponsor-position" data-position></p><div class="sponsor-form-wide sponsor-form-actions"><button class="sponsor-primary" type="submit">Salvar cadastro e reservar posição</button></div>';
  const cepHint=form.querySelector('[name=cep]').parentElement.querySelector('.sponsor-hint');cepHint.dataset.cepStatus='';cepHint.setAttribute('role','status');cepHint.setAttribute('aria-live','polite');bindAddress(form);
  form.querySelector('[data-position]').textContent=selected?'Posição selecionada: '+selected:'Selecione sua posição no painel acima.';
  if(mine?.profile){const cancel=node('button','Cancelar edição');cancel.type='button';cancel.onclick=()=>{showOwn();scrollToCard(g('sponsor-details'));};form.querySelector('.sponsor-form-actions').append(cancel);}
  form.onsubmit=event=>{event.preventDefault();return task(async()=>{if(!selected)throw Error('Escolha uma posição no painel.');const button=form.querySelector('[type=submit]');button.disabled=true;button.textContent='Salvando…';try{const profile={};for(const el of form.querySelectorAll('[name]'))profile[el.name]=el.type==='checkbox'?el.checked:el.value.trim();await call('cadastro',{slot:selected,profile});await loadMine();await publicBoard();showOwn();status('Cadastro salvo. Envie sua logo para continuar.');scrollToCard(g('sponsor-details'));}finally{button.disabled=false;button.textContent='Salvar cadastro e reservar posição';}});};card.append(form);details.append(card);scrollToCard(card);
 }
 function showOwn(){
  const details=g('sponsor-details');details.hidden=false;details.replaceChildren();if(!mine?.profile)return showForm();
  const p=mine.profile,active=p.paid_until>Date.now()&&!p.hidden,card=node('section',null,'sponsor-card');card.append(node('p','MEU PATROCÍNIO','sponsor-eyebrow'),node('h2',p.trade_name),node('p','Posição '+p.slot+' · '+(active?'Ativo até '+new Date(p.paid_until).toLocaleDateString('pt-BR'):'Aguardando logo e confirmação do pagamento')));
  if(p.hidden)card.append(node('p','A exibição da marca foi pausada pela gestão. Entre em contato com a ONG.'));
  const tier=board.plans.find(t=>t.id===p.tier);if(tier){const list=node('ul');for(const item of benefits[tier.id])list.append(node('li',item));card.append(list);}
  const upload=node('label','Logo da empresa (PNG, JPG ou WebP, até 8 MB)');const file=node('input');file.type='file';file.accept='image/png,image/jpeg,image/webp';upload.append(file);card.append(upload,node('p',p.logo?'Logo recebida. Uma nova imagem substitui a anterior.':'A imagem será publicada somente após o pagamento aprovado.','sponsor-help'));
  file.onchange=()=>task(async()=>{if(!file.files?.[0])return;if(window.AmorReview?.active){await call('logo');status('Conta de teste: envio de logo simulado. Nenhum arquivo foi enviado.');return;}file.disabled=true;try{const png=await normalizeLogo(file.files[0]);const session=(await hooks.session()).session;const r=await fetch(API+'/patrocinadores/logo',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'image/png'},body:png});const result=await r.json();if(!r.ok)throw Error(result.error);await loadMine();await publicBoard();showOwn();status('Logo recebida com sucesso.');}finally{file.disabled=false;}});
  const controls=node('div',null,'sponsor-payment-controls');controls.innerHTML='<label>Contribuição<select class="fi" data-period><option value="monthly">Mensal · '+E(money(tier?.monthly||0))+'</option><option value="annual">Anual · '+E(money(tier?.annual||0))+' (10% de desconto)</option></select></label><button type="button" class="sponsor-primary" data-pay>Gerar Pix</button><button type="button" data-edit>Editar cadastro</button>';
  controls.querySelector('[data-pay]').disabled=!p.logo||p.paid_until>Date.now()+7*86400000;controls.querySelector('[data-pay]').onclick=()=>task(()=>pay(controls.querySelector('select').value));controls.querySelector('[data-edit]').onclick=()=>showForm(p.slot);card.append(controls);
  const history=node('div',null,'sponsor-history');history.append(node('h3','Contribuições e comprovantes'));
  for(const i of mine.intents||[]){const row=node('div',null,'sponsor-history-row');row.append(node('span',new Date(i.created).toLocaleDateString('pt-BR')+' · '+money(i.amount)+' · '+({approved:'Pago',pending:'Pendente',created:'Aguardando pagamento',rejected:'Recusado',cancelled:'Cancelado'}[i.status]||i.status)));
   const b=node('button','Conferir pagamento');b.type='button';b.onclick=()=>task(async()=>{const result=await call('consultar',{intent:i.id});status(result.status==='approved'?'Pagamento aprovado. O comprovante segue por e-mail.':'Situação: '+result.status);await loadMine();await publicBoard();showOwn();});row.append(b);history.append(row);
  }card.append(history);details.append(card);
 }
 async function normalizeLogo(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('Selecione uma imagem PNG, JPG ou WebP de até 8 MB.');
  const bitmap=await createImageBitmap(file);try{if(bitmap.width<16||bitmap.height<16||bitmap.width*bitmap.height>24000000)throw Error('Dimensões de imagem inválidas.');const ratio=Math.min(1,1200/bitmap.width,1200/bitmap.height),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob||blob.size>2*1024*1024)throw Error('A logo ficou muito grande. Envie uma imagem menor.');return blob;}finally{bitmap.close();}
 }
 async function pay(period){
  if(paymentBusy)return;paymentBusy=true;try{
   const intent=await call('checkout',{period});const overlay=node('div',null,'modal-overlay open');overlay.id='sponsor-checkout';overlay.innerHTML='<section class="modal checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="sponsor-pay-title"><div class="modal-hdr"><h2 id="sponsor-pay-title">Contribuição de patrocínio</h2></div><div class="modal-body"><strong>'+E(money(intent.amount))+'</strong><p role="status">Gerando Pix…</p><div data-pix></div><div class="modal-actions"><button type="button" data-check>Já paguei · conferir</button><button type="button" data-close>Voltar</button></div></div></section>';document.body.append(overlay);
   const st=overlay.querySelector('[role=status]'),checkButton=overlay.querySelector('[data-check]');let closed=false,checking=false;
   const close=()=>{if(closed)return;closed=true;clearInterval(timer);timer=null;overlay.remove();paymentBusy=false;};overlay.querySelector('[data-close]').onclick=close;
   const update=async result=>{
    if(closed||!overlay.isConnected)return;
    if(result.status==='approved'){
     close();status('Pagamento aprovado! Obrigado pelo patrocínio. Atualizando sua área…');
     try{await loadMine();await publicBoard();if(stopped)return;showOwn();status('Pagamento aprovado! Obrigado pelo patrocínio. Confira os detalhes em Contribuições e comprovantes.');const heading=g('sponsor-details').querySelector('h2');heading?.setAttribute('tabindex','-1');heading?.focus?.({preventScroll:true});g('sponsor-details').scrollIntoView?.({behavior:'smooth',block:'start'});}
     catch{if(!stopped)status('Pagamento aprovado! Toque em Atualizar para conferir os detalhes do seu patrocínio.');}
     return;
    }
    if(result.pix?.code){st.textContent='Pix gerado. Confirme o valor antes de pagar.';const area=overlay.querySelector('[data-pix]');if(!area.querySelector('textarea')){if(result.pix.image){const img=node('img',null,'checkout-qr');img.src='data:image/png;base64,'+result.pix.image;img.alt='QR Code do Pix de patrocínio';area.append(img);}const code=node('textarea');code.readOnly=true;code.value=result.pix.code;code.setAttribute('aria-label','Código Pix copia e cola');const copy=node('button','Copiar código Pix');copy.type='button';copy.onclick=()=>task(async()=>{await navigator.clipboard.writeText(code.value);st.textContent='Código copiado.';});area.append(code,copy);}}else st.textContent='Situação: '+result.status;
   };
   const check=async()=>{if(checking||closed||document.hidden||!overlay.isConnected)return;checking=true;checkButton.disabled=true;try{await update(await call('consultar',{intent:intent.id}));}catch{if(!closed)st.textContent='Não foi possível consultar agora. Confira o extrato antes de tentar novamente.';}finally{checking=false;if(!closed)checkButton.disabled=false;}};
   overlay.querySelector('[data-check]').onclick=check;
   try{const result=await call('pix',{intent:intent.id});await update(result);if(!closed&&result.status!=='approved')timer=setInterval(check,12000);}catch{if(!closed)st.textContent='Não foi possível mostrar o Pix. Confira o pagamento na sua área antes de gerar outro.';}
  }catch(e){paymentBusy=false;throw e;}
 }
 async function openAdmin(){
  if(!hooks.isAdmin())throw Error('Acesso restrito à gestão.');adminMode=true;show();await publicBoard();const data=await call('admin/listar'),details=g('sponsor-details');details.hidden=false;details.replaceChildren();
  const card=node('section',null,'sponsor-card');card.innerHTML='<h2>Planos de patrocínio</h2><p>Os novos valores valem para próximas contribuições. Pagamentos emitidos e patrocínios já pagos mantêm o valor contratado.</p>';const form=node('form',null,'sponsor-plan-form');
  for(const tier of data.plans){const label=node('label',tier.name+' · '+tier.count+' espaço(s)');const value=node('input',null,'fi');value.name=tier.id;value.inputMode='decimal';value.value=tier.monthly.toFixed(2).replace('.',',');label.append(value);form.append(label);}
  const save=node('button','Salvar valores','sponsor-primary');save.type='submit';form.append(save);form.onsubmit=event=>{event.preventDefault();return task(async()=>{const prices={};for(const el of form.querySelectorAll('input')){const n=AmorDomain.parseMoney(el.value);if(n===null||n<1)throw Error('Confira os valores dos cinco planos.');prices[el.name]=n;}save.disabled=true;try{await call('admin/planos',{prices,version:data.version});await openAdmin();status('Valores dos planos salvos.');}finally{save.disabled=false;}});};card.append(form);details.append(card);
  const list=node('section',null,'sponsor-card');list.append(node('h2','Patrocinadores cadastrados'));if(!data.profiles.length)list.append(node('p','Nenhum patrocinador cadastrado.'));
  for(const p of data.profiles){const item=node('article',null,'sponsor-admin-item');item.append(node('h3',p.trade_name),node('p',p.company+' · '+p.slot),node('p',p.contact+' · '+p.email+' · '+p.phone),node('p',p.paid_until>Date.now()?'Ativo até '+new Date(p.paid_until).toLocaleDateString('pt-BR'):'Aguardando pagamento'));
   const b=node('button',p.hidden?'Reexibir logo':'Pausar exibição');b.type='button';b.onclick=()=>task(async()=>{await call('admin/visibilidade',{target:p.user,hidden:!p.hidden});await openAdmin();});item.append(b);list.append(item);
  }details.append(list);status('Gestão de patrocinadores · alterações exclusivas da administração.');
 }
 function connect(){if(ws||stopped||document.hidden||window.AmorReview?.active)return;try{ws=new WebSocket(API.replace('https:','wss:')+'/patrocinadores/ao-vivo');ws.onmessage=event=>{try{const message=JSON.parse(event.data);if(message.event==='board'&&message.version>=(board?.version||0)){board=message;renderBoard();}}catch{}};ws.onclose=()=>{ws=null;if(!stopped)reconnect=setTimeout(connect,15000);};ws.onerror=()=>ws?.close();}catch{reconnect=setTimeout(connect,15000);}}
 function closeSocket(){clearTimeout(reconnect);if(ws){ws.onclose=null;ws.close();ws=null;}}
 function stop(){stopped=true;closeSocket();clearInterval(timer);timer=null;paymentBusy=false;g('sponsor-checkout')?.remove();}
 function reset(){stop();user=null;mine=null;selected=null;adminMode=false;associateAvailable=false;g('view-patrocinador')?.querySelector('.member-area-switcher')?.setAttribute('hidden','');}
 return {install,route,begin,openPublic,openAdmin,stop,reset,normalizeLogo};
})();
