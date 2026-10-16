'use strict';
const AmorApp=(()=>{
  const D=AmorDomain, E=D.escapeHTML, money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  let currentUser=null, admin=false, timer=null, refreshing=false, requestedPayments=false;
  const pending=new Set();
  const tableState={associado:{page:0,key:''},doador:{page:0,key:''}};
  async function checked(query){const r=await query;if(r.error)throw r.error;return r.data;}
  function fail(e){console.error('Operação não concluída:',e.code||e.name||'erro');toast(e.code==='PAYMENT_UNAVAILABLE'?'O pagamento online está temporariamente indisponível. Aguarde a liberação pela ONG.':navigator.onLine?'Não foi possível concluir. Seus dados não foram alterados. Tente novamente.':'Sem conexão. Reconecte-se para confirmar esta operação.','err');}
  async function busy(key,fn){if(pending.has(key))return;pending.add(key);const b=g(key);if(b)b.disabled=true;try{return await fn();}catch(e){fail(e);}finally{pending.delete(key);if(b)b.disabled=false;}}
  async function user(){const data=await checked(sb.auth.getUser());if(!data?.user)throw Error('Sem sessão');return data.user;}
  async function isAdmin(){return Boolean(await checked(sb.rpc('amor_is_admin')));}
  function safeSession(u){return {id:u.id,email:u.email,nome:u.user_metadata?.nome||u.email.split('@')[0]};}
  async function route(){
    currentUser=await user();admin=await isAdmin();
    if(admin)return openAdmin();
    const donor=await checked(sb.from('doadores').select('*').ilike('email',currentUser.email.replace(/[%_\\]/g,'\\$&')).limit(2));
    if(donor?.length>1)throw Error('Cadastro duplicado: revisão necessária');
    if(donor?.length){doadorLogado=safeSession(currentUser);associadoLogado=null;await carregarDadosDoador();showView('view-doador');}
    else{associadoLogado=safeSession(currentUser);doadorLogado=null;await carregarDadosAssociado();if(fichaAssociado)_redirecionarAposLogin(false);else{showView('view-admin-login');abrirTipoSelect();}}
    if(requestedPayments)openPayments();
    await syncNative();iniciarPolling();
  }
  async function openAdmin(){
    admin=await isAdmin();if(!admin)throw Error('Acesso restrito');
    await ensure();showView('view-admin');await Promise.all([loadAssociados(),loadDoadores()]);renderCharts();iniciarPolling();
  }
  async function doAssocLogin(){return busy('btn-assoc-login',async()=>{
    g('assoc-login-err').classList.remove('show');
    try{await checked(sb.auth.signInWithPassword({email:g('assoc-email-login').value.trim().toLowerCase(),password:g('assoc-senha-login').value}));g('assoc-senha-login').value='';await route();}
    catch(e){g('assoc-login-err-msg').textContent='Confira e-mail e senha. Contas antigas precisam ativar o acesso seguro usando o mesmo e-mail.';g('assoc-login-err').classList.add('show');throw e;}
  });}
  async function doCadastro(){return busy('btn-cadastrar',async()=>{
    const nome=g('cad-nome').value.trim(),email=g('cad-email').value.trim().toLowerCase(),password=g('cad-senha').value;
    g('cad-err').classList.remove('show');
    if(nome.length<3||!g('cad-email').checkValidity()||!email||password.length<10||password!==g('cad-senha2').value){g('cad-err-msg').textContent='Informe nome, e-mail válido e uma senha de pelo menos 10 caracteres. As senhas devem coincidir.';g('cad-err').classList.add('show');return;}
    const data=await checked(sb.auth.signUp({email,password,options:{data:{nome},emailRedirectTo:'https://www.ongporamor.top/'}}));
    g('cad-senha').value='';g('cad-senha2').value='';
    g('cad-ok-msg').textContent='Confira seu e-mail para confirmar o acesso. Se já tem cadastro na ONG, use o mesmo e-mail para recuperar seu histórico.';g('cad-ok').classList.add('show');
    if(data.session&&data.user?.email_confirmed_at)await route();
  });}
  async function doLogin(){return busy('admin-sign-in',async()=>{
    await checked(sb.auth.signInWithPassword({email:g('adm-login').value.trim().toLowerCase(),password:g('adm-senha').value}));
    g('adm-senha').value='';currentUser=await user();
    if(!await isAdmin()){await sb.auth.signOut();g('login-err').classList.add('show');return;}
    await openAdmin();
  });}
  async function logout(){
    pararPolling();currentUser=null;admin=false;associadoLogado=null;doadorLogado=null;fichaAssociado=null;fichaDoador=null;pagamentosAssociado=[];pagamentosDoador=[];
    if(window.AmorAndroid)AmorAndroid.clear();
    for(const key of ['assoc_sessao','doador_sessao','assoc_ultima_aba'])localStorage.removeItem(key);
    await sb.auth.signOut({scope:'local'});showView('view-admin-login');switchLoginTab('tab-login');
    history.replaceState({},'',location.pathname);
  }
  async function checkAdminMode(){
    for(const key of ['assoc_sessao','doador_sessao'])localStorage.removeItem(key);
    showView('view-admin-login');
    const session=await checked(sb.auth.getSession());
    if(session.session){try{await route();}catch(e){fail(e);}}
  }
  async function ensure(){return checked(sb.rpc('amor_ensure_my_contributions'));}
  async function carregarDadosAssociado(){
    if(!associadoLogado)return;
    const rows=await checked(sb.from('associados').select('*').ilike('email',associadoLogado.email.replace(/[%_\\]/g,'\\$&')).limit(2));
    if(rows.length>1)throw Error('Mais de uma ficha: revisão administrativa necessária');
    fichaAssociado=rows[0]||null;pagamentosAssociado=[];
    if(fichaAssociado){await ensure();pagamentosAssociado=await _buscarTodosPagamentosAssociado();}
    renderAreaAssociado();await syncNative();
  }
  async function _buscarTodosPagamentosAssociado(){
    if(!fichaAssociado)return [];
    return D.canonical(await pages('pagamentos','*',q=>q.eq('associado_id',fichaAssociado.id)));
  }
  async function carregarDadosDoador(){
    if(!doadorLogado)return;
    const rows=await checked(sb.from('doadores').select('*').ilike('email',doadorLogado.email.replace(/[%_\\]/g,'\\$&')).limit(2));
    if(rows.length>1)throw Error('Mais de uma ficha: revisão administrativa necessária');
    fichaDoador=rows[0]||null;await ensure();pagamentosDoador=await _buscarPagamentosDoador();renderAreaDoador();await syncNative();
  }
  async function _buscarPagamentosDoador(){if(!fichaDoador)return [];return D.canonical(await pages('pagamentos_doadores','*',q=>q.eq('doador_id',fichaDoador.id)));}
  async function pages(table,columns='*',filter=q=>q){
    const all=[];for(let start=0;;start+=500){const rows=await checked(filter(sb.from(table).select(columns)).order('id').range(start,start+499));all.push(...rows);if(rows.length<500)return all;}
  }
  const listFields='id,numero_associado,nome,cpf,telefone,email,valor_contribuicao,dia_pagamento,forma_pagamento,status,cidade,profissao,created_at';
  async function loadAssociados(){
    if(!admin)throw Error('Acesso restrito');
    const [people,rows]=await Promise.all([pages('associados',listFields),pages('pagamentos')]);
    associados=people;pagamentos={};for(const p of D.canonical(rows))(pagamentos[p.associado_id]??=[]).push(p);
    renderTable();updateKPIs();renderPendencias();
  }
  async function loadDoadores(){
    if(!admin)throw Error('Acesso restrito');
    const [people,rows]=await Promise.all([pages('doadores'),pages('pagamentos_doadores')]);
    doadores=people;pagamentosDoadores={};for(const p of D.canonical(rows))(pagamentosDoadores[p.doador_id]??=[]).push(p);
    renderDoadores();updateKPIs();renderPendencias();
  }
  function openRows(rows,day){return D.canonical(rows).filter(p=>!['pago','cancelado'].includes(p.status)&&D.dueDate(p,day)?.slice(0,7)<=D.month());}
  function renderPeople(kind){
    const assoc=kind==='associado',people=assoc?associados:doadores,ledger=assoc?pagamentos:pagamentosDoadores;
    const query=(g(assoc?'f-busca':'fd-busca')?.value||'').trim().toLocaleLowerCase('pt-BR'),payFilter=g(assoc?'f-pgstatus':'fd-pgstatus')?.value||'',day=assoc?g('f-dia').value:'',status=assoc?g('f-status').value:'';
    const filtered=people.filter(p=>{
      const hasOpen=openRows(ledger[p.id]||[],p.dia_pagamento).length>0;
      return (!query||[p.nome,p.cpf,p.email,p.telefone].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(query)))&&(!day||String(p.dia_pagamento)===day)&&(!status||p.status===status)&&(payFilter!=='pendente'||hasOpen)&&(payFilter!=='em_dia'||!hasOpen);
    });
    const state=tableState[kind],key=JSON.stringify([query,payFilter,day,status]);if(key!==state.key){state.page=0;state.key=key;}
    state.page=Math.min(state.page,Math.max(0,Math.ceil(filtered.length/25)-1));
    const badge=g(assoc?'count-badge':'count-badge-doadores');if(badge)badge.textContent=filtered.length;
    const tbody=g(assoc?'table-body':'doadores-body');if(!tbody)return;tbody.textContent='';
    for(const p of filtered.slice(state.page*25,state.page*25+25)){
      const tr=document.createElement('tr'),rows=D.canonical(ledger[p.id]||[]);
      const td=(text)=>{const cell=document.createElement('td');cell.textContent=text;tr.append(cell);return cell;};
      if(assoc)td('#'+String(p.numero_associado||'—').padStart(3,'0'));
      const name=td(p.nome);name.className='td-name';if(assoc){const sub=document.createElement('small');sub.textContent=p.cpf||'';sub.style.display='block';name.append(sub);}
      td(p.telefone||'—');if(!assoc)td(p.email||'—');td('Dia '+(p.dia_pagamento||10));td(money(p.valor_contribuicao));td(p.forma_pagamento||'PIX');if(assoc)td(p.status||'ativo');
      const paymentsCell=td(''),chips=document.createElement('div');chips.className='pay-month-row';paymentsCell.append(chips);
      for(const m of getMesesDoAno()){
        const payment=rows.find(x=>x.mes_referencia===m);
        if(!payment){const blank=document.createElement('span');blank.textContent=m.slice(5)+' —';blank.className='pay-chip';blank.title='Sem contribuição registrada nesta competência';chips.append(blank);continue;}
        const s=D.status(payment,p.dia_pagamento),b=document.createElement('button');b.type='button';b.className='pay-chip '+(s==='pago'?'paid':s==='atrasado'?'overdue':'pending');b.textContent=m.slice(5)+(s==='pago'?' ✓':s==='cancelado'?' ×':' ○');b.title=`${m}: ${s}. Abrir confirmação de alteração`;b.disabled=s==='cancelado';b.onclick=()=>toggle(kind,p.id,m);chips.append(b);
      }
      const actions=td(''),wrap=document.createElement('div');wrap.className='actions-cell';actions.append(wrap);
      function action(label,fn,style){const b=document.createElement('button');b.type='button';b.className='btn-sm '+style;b.textContent=label;b.onclick=fn;wrap.append(b);}
      action('Lembrar',()=>cobrar(kind,p.id),'btn-sm-warn');
      if(assoc){action('Editar',()=>openEdit(p.id),'btn-sm-teal');action('Ficha',async()=>{try{const full=await checked(sb.from('associados').select('*').eq('id',p.id).single());Object.assign(p,full);printAssociado(p.id);}catch(e){fail(e);}},'btn-sm-navy');}
      action('Desativar',()=>{if(confirm(`Desativar ${p.nome}? O histórico será preservado.`))archive(kind,p.id);},'btn-sm-red');
      tbody.append(tr);
    }
    if(!filtered.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=9;td.textContent='Nenhum cadastro corresponde aos filtros.';tr.append(td);tbody.append(tr);}
    let nav=g(`pagination-${kind}`);if(!nav){nav=document.createElement('nav');nav.id=`pagination-${kind}`;nav.className='table-pagination';nav.setAttribute('aria-label','Páginas de '+(assoc?'associados':'doadores'));tbody.closest('table').parentElement.after(nav);}
    nav.textContent='';const prev=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');prev.textContent='Anterior';prev.disabled=state.page===0;prev.onclick=()=>{state.page--;renderPeople(kind);};next.textContent='Próxima';next.disabled=(state.page+1)*25>=filtered.length;next.onclick=()=>{state.page++;renderPeople(kind);};label.textContent=`Página ${state.page+1} de ${Math.max(1,Math.ceil(filtered.length/25))}`;nav.append(prev,label,next);
    const alert=g('pending-alert');if(assoc&&alert)alert.style.display='none';
  }
  function updateKPIs(){
    const text=(id,value)=>{if(g(id))g(id).textContent=value;};
    const a=associados.filter(p=>p.status==='ativo'),d=doadores.filter(p=>p.status==='ativo');
    const expected=people=>people.reduce((sum,p)=>sum+Number(p.valor_contribuicao||0),0);
    const outstanding=(people,ledger)=>people.flatMap(p=>openRows(ledger[p.id]||[],p.dia_pagamento));
    const ap=outstanding(a,pagamentos),dp=outstanding(d,pagamentosDoadores);
    text('kpi-total',associados.length);text('kpi-ativos',`${a.length} ativos`);text('kpi-receita',money(expected(a)));text('kpi-pend',money(ap.reduce((s,p)=>s+Number(p.valor||0),0)));text('kpi-npend',`${a.filter(p=>openRows(pagamentos[p.id]||[],p.dia_pagamento).length).length} associados`);text('kpi-ticket',money(a.length?expected(a)/a.length:0));
    text('kpi-d-total',doadores.length);text('kpi-d-ativos',`${d.length} ativos`);text('kpi-d-receita',money(expected(d)));text('kpi-d-pend',money(dp.reduce((s,p)=>s+Number(p.valor||0),0)));text('kpi-d-npend',`${d.filter(p=>openRows(pagamentosDoadores[p.id]||[],p.dia_pagamento).length).length} doadores`);text('kpi-total-geral',money(expected(a)+expected(d)));text('kpi-rcpt','previsão, sujeita ao recebimento');
  }
  function renderPendencias(){
    for(const [kind,people,ledger,id] of [['associado',associados,pagamentos,'pend-body'],['doador',doadores,pagamentosDoadores,'pend-body-doadores']]){
      const tbody=g(id);if(!tbody)continue;tbody.textContent='';
      const entries=people.filter(p=>p.status==='ativo').flatMap(p=>openRows(ledger[p.id]||[],p.dia_pagamento).filter(x=>D.dueDate(x,p.dia_pagamento)<=D.today()).map(payment=>({p,payment}))).sort((a,b)=>D.dueDate(a.payment,a.p.dia_pagamento).localeCompare(D.dueDate(b.payment,b.p.dia_pagamento)));
      for(const {p,payment} of entries.slice(0,15)){
        const row=document.createElement('tr');for(const value of [p.nome,p.telefone||'—',money(payment.valor),D.dueDate(payment,p.dia_pagamento).split('-').reverse().join('/')]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
        const cell=document.createElement('td'),button=document.createElement('button');button.className='btn-sm btn-sm-warn';button.textContent='Preparar lembrete';button.onclick=()=>cobrar(kind,p.id);cell.append(button);row.append(cell);tbody.append(row);
      }
      if(!entries.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=5;cell.textContent='Nenhuma contribuição vencida ou com vencimento hoje.';row.append(cell);tbody.append(row);}
    }
  }
  function printProfile(id){
    const p=associados.find(x=>x.id===id);if(!p)return;
    const fields=[['Nome',p.nome],['CPF',p.cpf],['Nascimento',p.data_nascimento],['RG',p.rg],['Telefone',p.telefone],['E-mail',p.email],['Logradouro',p.logradouro],['Número',p.numero],['Complemento',p.complemento],['Bairro',p.bairro],['Cidade',p.cidade],['UF',p.uf],['CEP',p.cep],['Contribuição',money(p.valor_contribuicao)],['Vencimento','Dia '+p.dia_pagamento],['Pagamento',p.forma_pagamento],['Status',p.status]];
    printSheet('Ficha de associado',fields,p.assinatura_data);
  }
  function printSheet(title,fields,signature){
    g('print-sheet')?.remove();const sheet=document.createElement('article');sheet.id='print-sheet';
    const heading=document.createElement('h1');heading.textContent='ONG Por Amor — '+title;sheet.append(heading);
    const table=document.createElement('table');for(const [label,value] of fields){const row=document.createElement('tr'),th=document.createElement('th'),td=document.createElement('td');th.textContent=label;td.textContent=value||'________________________________';row.append(th,td);table.append(row);}sheet.append(table);
    if(typeof signature==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature)&&signature.length<=300000){const img=document.createElement('img');img.src=signature;img.alt='Assinatura registrada na ficha';img.style.maxWidth='300px';sheet.append(img);}
    document.body.append(sheet);document.body.classList.add('print-mode');if(window.AmorAndroid)AmorAndroid.printPage();else window.print();
  }
  function printBlank(){printSheet('Ficha para preenchimento',[['Nome',''],['CPF',''],['Nascimento',''],['Telefone',''],['E-mail',''],['Endereço',''],['Contribuição',''],['Vencimento',''],['Assinatura','']]);}
  function printCurrent(){document.body.classList.remove('print-mode');if(window.AmorAndroid)AmorAndroid.printPage();else window.print();}
  async function submitForm(){return busy('submit-ficha',async()=>{
    if(![1,2,3].every(validatePage)||!hasSigned||!g('t-lgpd').checked)return toast('Revise os dados obrigatórios, a autorização e a assinatura.','err');
    currentUser=await user();const city=g('inp-cidade').value.split(' / ');
    const payload={nome:g('inp-nome').value.trim(),email:currentUser.email,cpf:g('inp-cpf').value.replace(/\D/g,''),data_nascimento:parseDate(g('inp-nasc').value),rg:g('inp-rg').value,estado_civil:g('inp-ecivil').value,profissao:g('inp-prof').value,cep:g('inp-cep').value,logradouro:g('inp-log').value,numero:g('inp-num').value,complemento:g('inp-comp').value,bairro:g('inp-bairro').value,cidade:city[0].trim(),uf:city[1]?.trim()||'',telefone:g('inp-tel').value,valor_contribuicao:Number(g('inp-valor').value.replace(',','.')),dia_pagamento:Number(g('inp-dia').value),forma_pagamento:document.querySelector('input[name="pag"]:checked')?.value||'PIX',autoriza_lgpd:true,autoriza_imagem:g('t-img').checked,autoriza_comunicacoes:g('t-com').checked,assinatura_tipo:'desenho',assinatura_data:sigCanvas.toDataURL(),status:'ativo'};
    if(!D.validCPF(payload.cpf)||!Number.isFinite(payload.valor_contribuicao)||payload.valor_contribuicao<30)return toast('Confira o CPF e o valor da contribuição.','err');
    await checked(sb.from('associados').insert(payload).select('id').single());
    await carregarDadosAssociado();showView('view-associado');toast('Ficha salva! Sua contribuição já está disponível.');
  });}
  async function submitDonorForm(){return busy('btn-donor-submit',async()=>{
    currentUser=await user();const valor=Number(g('df-valor').value.replace(',','.')),day=Number(g('df-dia').value);
    if(g('df-nome').value.trim().length<3||g('df-tel').value.replace(/\D/g,'').length<10||!Number.isFinite(valor)||valor<10||day<1||day>28)throw Error('Dados inválidos');
    await checked(sb.from('doadores').insert({nome:g('df-nome').value.trim(),email:currentUser.email,telefone:g('df-tel').value,dia_pagamento:day,forma_pagamento:g('df-pgto').value||'PIX',valor_contribuicao:valor,status:'ativo'}).select('id').single());
    fecharDonorForm();doadorLogado=safeSession(currentUser);associadoLogado=null;await carregarDadosDoador();showView('view-doador');toast('Cadastro salvo. Obrigado por fazer parte!');
  });}
  async function gateway(path,body){
    if(!navigator.onLine)throw Error('Sem conexão');
    const {session}=await checked(sb.auth.getSession());if(!session)throw Error('Sem sessão');
    const r=await fetch(`${MP_PROXY_URL}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body||{}),signal:AbortSignal.timeout(20000)});
    const data=await r.json();if(!r.ok){const error=Error(data.error||'Pagamento indisponível');if(r.status===503)error.code='PAYMENT_UNAVAILABLE';throw error;}return data;
  }
  function external(url){
    const u=new URL(url);if(u.protocol!=='https:'||!/(^|\.)(mercadopago\.com\.br|mercadopago\.com)$/.test(u.hostname))throw Error('Link de pagamento inválido');
    if(window.AmorAndroid)AmorAndroid.openExternal(u.href);else location.assign(u.href);
  }
  async function pay(kind,id,months){return busy('payment',async()=>{toast('Preparando seu pagamento…');const r=await gateway('/criar-preferencia',{kind,id,months});external(r.init_point);});}
  async function sincronizar(){return busy('sync-payments',async()=>{const result=await gateway('/sincronizar');await refresh();toast(result.reviews?'Há pagamento aguardando conferência da gestão.':'Extrato atualizado com as confirmações recebidas.');});}
  async function toggle(kind,id,month){return busy(`pay-${id}-${month}`,async()=>{
    if(!admin||!await isAdmin())throw Error('Acesso restrito');
    const rows=kind==='associado'?pagamentos[id]||[]:pagamentosDoadores[id]||[],old=rows.find(p=>p.mes_referencia===month);
    const next=old?.status==='pago'?'pendente':'pago';
    if(!confirm(`${next==='pago'?'Confirmar recebimento':'Reabrir contribuição'} de ${month}? Esta alteração ficará no histórico da gestão.`))return;
    await checked(sb.rpc('amor_set_payment_status',{p_kind:kind,p_id:id,p_month:month,p_status:next}));
    if(kind==='associado')await loadAssociados();else await loadDoadores();toast('Alteração confirmada pelo banco.');
  });}
  async function saveEdit(){return busy('save-edit',async()=>{
    if(!admin||!editingId)throw Error('Acesso restrito');
    const value=Number(g('edit-valor').value.replace(',','.')),day=Number(g('edit-dia').value);
    if(!Number.isFinite(value)||value<30||!D.validCPF(g('edit-cpf').value)||day<1||day>28)throw Error('Dados inválidos');
    await checked(sb.from('associados').update({nome:g('edit-nome').value.trim(),cpf:g('edit-cpf').value.replace(/\D/g,''),telefone:g('edit-tel').value,email:g('edit-email').value.trim().toLowerCase(),profissao:g('edit-prof').value,valor_contribuicao:value,dia_pagamento:day,forma_pagamento:g('edit-pgto').value,status:g('edit-status').value}).eq('id',editingId).select('id').single());
    closeEdit();await loadAssociados();toast('Cadastro atualizado. O histórico financeiro foi preservado.');
  });}
  async function archive(kind,id){return busy('archive',async()=>{if(!admin)throw Error('Acesso restrito');await checked(sb.from(kind==='associado'?'associados':'doadores').update({status:'inativo'}).eq('id',id).select('id').single());closeDelete();await refresh();toast('Cadastro desativado. O histórico continua disponível.');});}
  async function cobrar(kind,id){
    const profile=(kind==='associado'?associados:doadores).find(p=>p.id===id);if(!profile)return;
    const rows=D.canonical(kind==='associado'?pagamentos[id]||[]:pagamentosDoadores[id]||[]).filter(p=>!['pago','cancelado'].includes(p.status)&&D.dueDate(p,profile.dia_pagamento)<=D.today());
    if(!rows.length)return toast('Não há contribuição vencida ou com vencimento hoje.');
    const title=g('modal-cobranca').querySelector('.modal-title');if(title)title.textContent='Contribuição a conferir';g('modal-cobranca').classList.add('open');
    g('msg-template').textContent=`Olá, ${profile.nome.split(' ')[0]}! Há ${rows.length} contribuição(ões) a conferir na ONG Por Amor. Consulte seu extrato em https://www.ongporamor.top/ . Se já pagou, atualize a confirmação no aplicativo. Obrigado pelo apoio!`;
    const a=g('modal-cobranca').querySelector('a[href*="wa.me"]');if(a){a.href=`https://wa.me/55${String(profile.telefone||'').replace(/\D/g,'')}?text=${encodeURIComponent(g('msg-template').textContent)}`;a.rel='noopener noreferrer';}
  }
  async function loadMPFinanceiro(){return busy('finance',async()=>{if(!admin)throw Error('Acesso restrito');const r=await gateway('/financeiro');mpPayments=r.results||[];mpBalance=r.balance;renderMPPayments();});}
  function renderPayments(kind){
    const profile=kind==='associado'?fichaAssociado:fichaDoador,rows=D.canonical(kind==='associado'?pagamentosAssociado:pagamentosDoador);
    const box=g(kind==='associado'?'assoc-pay-list':'doador-pay-list');if(!box)return;
    const summary=g(kind==='associado'?'assoc-pay-resumo':'doador-pay-resumo');
    if(summary)summary.textContent=`${rows.filter(p=>p.status==='pago').length} pago(s) · ${rows.filter(p=>!['pago','cancelado'].includes(p.status)).length} em aberto`;
    box.innerHTML='<p class="payment-help">Escolha a contribuição e toque em <strong>Pagar contribuição</strong>. A confirmação aparece após a validação do pagamento. PIX por chave depende da conferência da ONG.</p>';
    if(!rows.length){box.insertAdjacentHTML('beforeend','<p>Nenhuma contribuição registrada.</p>');return;}
    const sorted=[...rows].sort((a,b)=>Number(['pago','cancelado'].includes(a.status))-Number(['pago','cancelado'].includes(b.status))||a.mes_referencia.localeCompare(b.mes_referencia));
    for(const p of sorted){
      const status=D.status(p,profile?.dia_pagamento),due=D.dueDate(p,profile?.dia_pagamento),label={pago:'Pago',cancelado:'Cancelado',atrasado:'Atrasado',pendente:'Pendente'}[status];
      const el=document.createElement('article');el.className=`pay-item ${status==='pago'?'pago':status==='atrasado'?'vencido':'pendente'}`;
      el.innerHTML=`<div style="flex:1"><strong>${E(p.mes_referencia.split('-').reverse().join('/'))} · ${label}</strong><p>Vencimento: ${E(due?.split('-').reverse().join('/')||'A conferir')}</p></div><strong>${money(p.valor)}</strong>`;
      if(!['pago','cancelado'].includes(status)){const b=document.createElement('button');b.className='btn-mp-pagar';b.textContent='Pagar contribuição';b.onclick=()=>pay(kind,profile.id,[p.mes_referencia]);el.append(b);}
      box.append(el);
    }
  }
  async function syncNative(){
    if(!window.AmorAndroid)return;
    const {session}=await checked(sb.auth.getSession());if(!session)return;
    const snapshot=await checked(sb.rpc('amor_reminder_snapshot'));
    AmorAndroid.sync(JSON.stringify({snapshot,access_token:session.access_token,refresh_token:session.refresh_token,expires_at:session.expires_at}));
  }
  async function refresh(){
    if(refreshing||document.hidden||!navigator.onLine)return;refreshing=true;
    try{if(admin&&g('view-admin').classList.contains('active'))await Promise.all([loadAssociados(),loadDoadores()]);else if(associadoLogado)await carregarDadosAssociado();else if(doadorLogado)await carregarDadosDoador();}
    finally{refreshing=false;}
  }
  function iniciarPolling(){if(timer||!currentUser||document.hidden)return;timer=setInterval(()=>refresh().catch(fail),60000);}
  function pararPolling(){if(timer)clearInterval(timer);timer=null;}
  function showRecovery(){const panel=document.createElement('section');panel.className='reminder-control';panel.innerHTML='<h2>Definir nova senha</h2><label for="recovery-password">Nova senha (mínimo 10 caracteres)</label><input id="recovery-password" type="password" autocomplete="new-password" minlength="10" class="fi"><button type="button">Salvar nova senha</button>';panel.querySelector('button').onclick=()=>busy('recover-password',async()=>{const password=panel.querySelector('input').value;if(password.length<10)return toast('Use pelo menos 10 caracteres.','err');await checked(sb.auth.updateUser({password}));panel.remove();toast('Senha atualizada.');await route();});document.body.prepend(panel);}
  async function recover(){return busy('recover-access',async()=>{const email=g('assoc-email-login').value.trim().toLowerCase();if(!email||!g('assoc-email-login').checkValidity())return toast('Preencha o e-mail acima.','err');await checked(sb.auth.resetPasswordForEmail(email,{redirectTo:'https://www.ongporamor.top/?type=recovery'}));toast('Se a conta existir, você receberá as instruções por e-mail.');});}
  function openPayments(){requestedPayments=true;if(fichaAssociado){showAssocTab('tab-assoc-pagamentos');requestedPayments=false;}else if(fichaDoador){showDoadorTab('tab-doador-pagamentos');requestedPayments=false;}}
  async function restoreNative(native){if(!native?.refresh_token)return;const {session}=await checked(sb.auth.getSession());if(!session||native.expires_at>session.expires_at)await checked(sb.auth.setSession({access_token:native.access_token,refresh_token:native.refresh_token}));}
  function back(){const modal=document.querySelector('.modal-overlay.open');if(modal){modal.classList.remove('open');return true;}if(fichaAssociado&&g('view-associado').classList.contains('active')){if(!g('tab-assoc-inicio').classList.contains('active')){showAssocTab('tab-assoc-inicio');return true;}}if(fichaDoador&&g('view-doador').classList.contains('active')){if(!g('tab-doador-inicio').classList.contains('active')){showDoadorTab('tab-doador-inicio');return true;}}return false;}
  function init(){
    const banner=document.createElement('div');banner.className='app-network';banner.setAttribute('role','status');banner.id='network-status';document.body.prepend(banner);
    function network(){banner.hidden=navigator.onLine;banner.textContent='Você está sem internet. Os lembretes continuam no Android. Pagamentos e atualizações precisam de conexão.';}
    addEventListener('online',()=>{network();refresh().catch(fail);});addEventListener('offline',network);network();
    for(const input of document.querySelectorAll('input,select,textarea')){const label=input.closest('.field')?.querySelector('label');if(label&&input.id)label.setAttribute('for',input.id);}
    for(const b of document.querySelectorAll('.btn-eye')){b.tabIndex=0;b.setAttribute('aria-label','Mostrar ou ocultar senha');}
    const toastEl=g('toast');if(toastEl){toastEl.setAttribute('role','status');toastEl.setAttribute('aria-live','polite');}
    g('adm-login').type='email';g('adm-login').placeholder='E-mail da gestão';g('adm-login').autocomplete='username';g('adm-senha').autocomplete='current-password';
    g('cad-senha').placeholder='Mínimo 10 caracteres';
    g('inp-cidade').readOnly=false;g('inp-email').readOnly=true;if(g('df-email'))g('df-email').readOnly=true;
    const adminLink=document.createElement('button');adminLink.className='recovery-button';adminLink.textContent='Receber link de acesso por e-mail';adminLink.onclick=()=>busy('admin-link',async()=>{const email=g('adm-login').value.trim().toLowerCase();if(!email||!g('adm-login').checkValidity())return toast('Preencha o e-mail da gestão.','err');await checked(sb.auth.signInWithOtp({email,options:{emailRedirectTo:'https://www.ongporamor.top/'}}));toast('Confira seu e-mail para concluir o acesso.');});g('tab-admin').append(adminLink);
    document.querySelector('.login-card-top-sub').textContent='Seu apoio transforma vidas. Entre para acompanhar.';
    const recovery=document.createElement('button');recovery.className='recovery-button';recovery.textContent='Esqueci minha senha';recovery.onclick=recover;g('btn-assoc-login').after(recovery);
    const activate=document.createElement('p');activate.className='login-hint';activate.textContent='Já contribuía antes? Ative seu acesso em Criar Conta com o mesmo e-mail. Confirme o e-mail para reencontrar seu histórico.';g('tab-login').append(activate);
    for(const id of ['view-associado','view-doador']){
      const card=document.createElement('section');card.className='reminder-control';card.innerHTML='<strong>Lembretes de contribuição</strong><p>Um aviso por dia perto das 9h (Brasília), a partir de três dias antes do vencimento. Após o pagamento confirmado e sincronizado, os avisos param. Sem internet, vale a última atualização disponível.</p>';
      if(window.AmorAndroid){const b=document.createElement('button');b.textContent='Ativar lembretes neste celular';b.onclick=()=>{AmorAndroid.enableNotifications();syncNative().catch(fail);};card.append(b);const off=document.createElement('button');off.textContent='Desativar';off.onclick=()=>{AmorAndroid.disableNotifications();toast('Lembretes desativados neste celular.');};card.append(off);}
      else card.insertAdjacentHTML('beforeend','<p>Os avisos com o aplicativo fechado estão disponíveis no APK Android.</p>');
      g(id).append(card);
    }
    document.addEventListener('visibilitychange',()=>{if(document.hidden){pararPolling();if(window.AmorAndroid)sb.auth.stopAutoRefresh();}else{(async()=>{if(window.AmorAndroid){await restoreNative(JSON.parse(AmorAndroid.getSession()||'null'));sb.auth.startAutoRefresh();}await refresh();iniciarPolling();})().catch(fail);}});
    sb.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY')showRecovery();if(event==='SIGNED_OUT'){currentUser=null;pararPolling();if(window.AmorAndroid)AmorAndroid.clear();}if(event==='TOKEN_REFRESHED')setTimeout(()=>syncNative().catch(()=>{}),0);});
    (async()=>{
      if(window.AmorAndroid){
        const native=JSON.parse(AmorAndroid.getSession()||'null');
        if(native?.refresh_token)await checked(sb.auth.setSession({access_token:native.access_token,refresh_token:native.refresh_token}));
        sb.auth.startAutoRefresh();
      }
      await checkAdminMode();
    })().catch(fail);
  }
  const api={doAssocLogin,doCadastro,doLogin,doLogout:logout,doAssocLogout:logout,doDoadorLogout:logout,checkAdminMode,carregarDadosAssociado,carregarDadosDoador,_buscarTodosPagamentosAssociado,_buscarPagamentosDoador,_garantirPagamentosPendentes:ensure,_garantirPagamentosDoadorPendentes:ensure,submitForm,submitDonorForm,loadAssociados,loadDoadores,saveEdit,iniciarPolling,pararPolling,loadMPFinanceiro,
    renderPagamentosAssociado:()=>renderPayments('associado'),renderPagamentosDoador:()=>renderPayments('doador'),renderTable:()=>renderPeople('associado'),renderDoadores:()=>renderPeople('doador'),updateKPIs,renderPendencias,printAssociado:printProfile,printFichaEmBranco:printBlank,printTable:printCurrent,
    togglePay:(id,m)=>toggle('associado',id,m),togglePayDoador:(id,m)=>toggle('doador',id,m),doDelete:()=>archive('associado',deleteId),doDeleteDoador:()=>archive('doador',deleteDoadorId),
    openCobranca:id=>cobrar('associado',id),openCobrancaDoador:id=>cobrar('doador',id),
    pagarViaMPAssociado:m=>pay('associado',fichaAssociado?.id,[m]),pagarViaMPDoador:m=>pay('doador',fichaDoador?.id,[m]),
    pagarAdiantamentoMP:()=>pay(adiantamentoContext==='doador'?'doador':'associado',adiantamentoContext==='doador'?fichaDoador?.id:fichaAssociado?.id,[...adiantamentoSelecionados]),
    pagarAssinaturaMP:()=>toast('Use o pagamento por contribuição. A cobrança automática será disponibilizada após a validação da integração.'),
    criarPagamentoMP:()=>toast('Abra seu extrato para escolher a contribuição.'),checkDoadorLogin:async()=>false,
    sincronizarPagamentosAssociado:sincronizar,sincronizarPagamentosDoador:sincronizar,forceSincronizacaoTotal:sincronizar,
    sincronizarPagamentosMP:async()=>{},sincronizarMPBackground:async()=>{},refresh,syncNative,openPayments,restoreNative,back,init};
  return api;
})();
window.AmorApp=AmorApp;
window.amorOpenPayments=AmorApp.openPayments;
window.amorRestoreNativeSession=AmorApp.restoreNative;
AmorApp.init();
