'use strict';
// Private test workspace. Supabase still authenticates the account; all sample
// data and mutations stay in memory. This never grants a production admin role.
window.AmorReview=(()=>{
  const uid='a0949852-3a2c-40fc-8f65-63be6f6d2b20',email='ongporamoradmin+playteste@gmail.com';
  const clone=value=>JSON.parse(JSON.stringify(value));
  let active=false,role='associado',state=null,client=null,change=null;
  const denied=()=>({data:null,error:{code:'42501',message:'Operação indisponível na conta de teste'}});
  function seed(){
    const now=new Date(),month=now.toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}).slice(0,7);
    const next=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),15)).toISOString().slice(0,7);
    const person={nome:'Associado de Teste',email,cpf:'52998224725',telefone:'00000000000',profissao:'Cadastro fictício',cidade:'João Pessoa',uf:'PB',bairro:'Centro',logradouro:'Rua de Exemplo',numero:'100',cep:'58000-000',status:'ativo',valor_contribuicao:35,dia_pagamento:10,forma_pagamento:'PIX',created_at:month+'-05T12:00:00Z',data_nascimento:'1990-01-01'};
    const a={...person,id:'00000000-0000-4000-8000-000000000001',numero_associado:1};
    const d={...person,id:'00000000-0000-4000-8000-000000000002',nome:'Doador de Teste'};
    const ledger=(p,key)=>[month,next].map((m,i)=>({id:p.id.slice(0,-1)+(i+3),[key]:p.id,mes_referencia:m,valor:p.valor_contribuicao,data_vencimento:m+'-10',status:'pendente',data_pagamento:null}));
    const plans=[['diamante','Diamante',1500,1],['ouro','Ouro',800,2],['prata','Prata',400,4],['bronze','Bronze',200,6],['ferro','Ferro',100,10]].map(([id,name,monthly,count])=>({id,name,monthly,count,annual:monthly*10.8}));
    const sponsor={user:uid,email,company:'Empresa Fictícia de Teste',trade_name:'Patrocinador de Teste',contact:'Responsável Fictício',document:'00000000000000',phone:'00000000000',city:'Campina Grande',state:'PB',slot:'ouro-1',tier:'ouro',logo:'review-logo',paid_until:Date.now()+30*86400000};
    return {associados:[a],doadores:[d],pagamentos:ledger(a,'associado_id'),pagamentos_doadores:ledger(d,'doador_id'),settings:{minimum_associado:35,version:1},sponsors:{version:1,plans,profile:sponsor}};
  }
  function canRead(table){return role==='gestao'||!((role==='associado'&&['doadores','pagamentos_doadores'].includes(table))||(role==='doador'&&['associados','pagamentos'].includes(table)));}
  function query(table){
    let action='select',payload=null,filters=[],start=0,end=Infinity,single=false,sort=null;
    const q={
      select(){return q;},eq(key,value){filters.push(row=>row[key]===value);return q;},
      ilike(key,value){const needle=String(value).replace(/\\([%_\\])/g,'$1').toLowerCase();filters.push(row=>String(row[key]||'').toLowerCase()===needle);return q;},
      order(key){sort=key;return q;},limit(n){end=n-1;return q;},range(a,b){start=a;end=b;return q;},
      single(){single=true;return q;},maybeSingle(){single=true;return q;},
      update(value){action='update';payload=clone(value);return q;},insert(value){action='insert';payload=clone(value);return q;},
      then(resolve,reject){return Promise.resolve().then(()=>{
        if(!active||!Object.hasOwn(state,table)||!Array.isArray(state[table]))return denied();
        if(!canRead(table))return action==='select'?{data:single?null:[],error:null}:denied();
        let rows=state[table].filter(row=>filters.every(fn=>fn(row)));
        if(action!=='select'){
          if(role!=='gestao')return denied();
          if(action==='insert'){const row={...payload,id:crypto.randomUUID(),created_at:new Date().toISOString()};state[table].push(row);rows=[row];}
          else rows.forEach(row=>Object.assign(row,payload));
        }
        if(sort)rows.sort((a,b)=>String(a[sort]).localeCompare(String(b[sort])));
        rows=rows.slice(start,end===Infinity?undefined:end+1);
        return {data:clone(single?(rows[0]||null):rows),error:null};
      }).then(resolve,reject);}
    };return q;
  }
  async function rpc(name,args={}){
    if(!active)return denied();
    if(name==='amor_is_admin')return {data:role==='gestao',error:null};
    if(name==='amor_contribution_settings')return {data:clone(state.settings),error:null};
    if(name==='amor_ensure_my_contributions')return {data:null,error:null};
    if(name==='amor_reminder_snapshot')return {data:{updated_at:new Date().toISOString(),profiles:[]},error:null};
    if(role!=='gestao')return denied();
    if(name==='amor_set_minimum_contribution'){
      if(args.p_expected_version!==state.settings.version)return {data:null,error:{code:'40001'}};
      if(!Number.isFinite(args.p_minimum)||args.p_minimum<0.01||args.p_minimum>100000)return denied();
      state.settings={minimum_associado:args.p_minimum,version:state.settings.version+1};
      const month=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}).slice(0,7);
      for(const table of ['associados','doadores'])for(const person of state[table])person.valor_contribuicao=Math.max(person.valor_contribuicao,args.p_minimum);
      for(const table of ['pagamentos','pagamentos_doadores'])for(const payment of state[table])if(payment.mes_referencia>month&&!['pago','cancelado'].includes(payment.status))payment.valor=Math.max(payment.valor,args.p_minimum);
      return {data:clone(state.settings),error:null};
    }
    if(name==='amor_set_payment_status'){
      const table=args.p_kind==='associado'?'pagamentos':args.p_kind==='doador'?'pagamentos_doadores':null;
      if(!table||!['pago','pendente'].includes(args.p_status))return denied();
      const key=args.p_kind==='associado'?'associado_id':'doador_id';
      const row=state[table].find(p=>p[key]===args.p_id&&p.mes_referencia===args.p_month);
      if(!row)return denied();row.status=args.p_status;return {data:null,error:null};
    }
    return denied();
  }
  function decorate(sb){
    if(client===sb)return;
    const from=sb.from.bind(sb),originalRpc=sb.rpc.bind(sb);
    sb.from=(...args)=>active?query(...args):from(...args);
    sb.rpc=(...args)=>active?rpc(...args):originalRpc(...args);client=sb;
  }
  function banner(){
    if(document.getElementById('review-workspace'))return;
    const bar=document.createElement('section');bar.id='review-workspace';bar.setAttribute('aria-label','Ambiente privado de teste');
    const text=document.createElement('p');text.textContent='Conta de teste · Dados fictícios · Sem cobranças. Alterações são descartadas ao sair.';
    const label=document.createElement('label');label.textContent='Área para testar ';
    const select=document.createElement('select');select.setAttribute('aria-label','Área para testar');
    for(const [value,name] of [['associado','Associado'],['doador','Doador'],['patrocinador','Patrocinador'],['gestao','Gestão']]){const o=document.createElement('option');o.value=value;o.textContent=name;if(value===role)o.setAttribute('selected','');select.append(o);}
    select.onchange=async()=>{select.disabled=true;role=select.value;try{await change?.();}finally{select.disabled=false;}};
    label.append(select);bar.append(text,label);document.body.prepend(bar);
  }
  function disable(){active=false;state=null;role='associado';document.getElementById('review-workspace')?.remove();}
  async function activate(user,sb,onChange){
    if(user?.id!==uid||user?.email?.toLowerCase()!==email||!user?.email_confirmed_at){disable();return false;}
    // Always verify with Auth, not editable profile metadata or URL parameters.
    const checked=await sb.auth.getUser();const verified=checked.data?.user;
    if(checked.error||verified?.id!==uid||verified?.email?.toLowerCase()!==email||!verified?.email_confirmed_at){disable();throw Error('Conta de teste não verificada');}
    decorate(sb);state??=seed();active=true;change=onChange;banner();return true;
  }
  async function gateway(path,args={}){
    if(!active)throw Error('Conta de teste não ativa');
    const sponsors=state.sponsors;
    if(path==='/patrocinadores/painel')return clone({version:sponsors.version,plans:sponsors.plans,slots:sponsors.plans.flatMap(p=>Array.from({length:p.count},(_,i)=>{const id=p.id+'-'+(i+1),occupied=id===sponsors.profile.slot&&!sponsors.profile.hidden;return {id,tier:p.id,status:occupied?'occupied':'available',...(occupied?{name:sponsors.profile.trade_name,logo:'/review/logo.png'}:{})};}))});
    if(path==='/patrocinadores/minha-area')return clone({profile:role==='patrocinador'?sponsors.profile:null,intents:[]});
    if(path==='/patrocinadores/cadastro'){sponsors.profile={...sponsors.profile,...clone(args.profile),slot:args.slot,tier:args.slot.split('-')[0]};sponsors.version++;role='patrocinador';const selector=document.querySelector('#review-workspace select');if(selector)selector.value=role;return clone(sponsors.profile);}
    if(path==='/patrocinadores/logo')return {saved:true};
    if(role==='gestao'){
      if(path==='/patrocinadores/admin/listar')return clone({version:sponsors.version,plans:sponsors.plans,profiles:[sponsors.profile],intents:[]});
      if(path==='/patrocinadores/admin/planos'){if(args.version!==sponsors.version)throw Error('Atualize os planos fictícios antes de salvar.');for(const p of sponsors.plans)if(!Number.isFinite(args.prices?.[p.id])||args.prices[p.id]<1||args.prices[p.id]>100000)throw Error('Valor inválido.');for(const p of sponsors.plans){p.monthly=args.prices[p.id];p.annual=p.monthly*10.8;}sponsors.version++;return {saved:true};}
      if(path==='/patrocinadores/admin/visibilidade'){sponsors.profile.hidden=Boolean(args.hidden);sponsors.version++;return {saved:true};}
    }
    if(path==='/sincronizar')return {processed:0,reviews:0};
    if(path==='/financeiro'&&role==='gestao')return {results:[{id:100001,status:'approved',transaction_amount:30,date_created:new Date().toISOString(),date_approved:new Date().toISOString(),payment_method_id:'pix',payer:{email:'exemplo@review.invalid'}}]};
    const error=Error('Esta é uma conta de teste. Não são criadas cobranças reais.');error.code='REVIEW_PAYMENT';throw error;
  }
  return {activate,disable,gateway,get active(){return active;},get role(){return active?role:null;}};
})();
