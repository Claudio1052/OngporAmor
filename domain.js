(function(root){
  'use strict';
  const zone='America/Sao_Paulo';
  function today(now=new Date()){
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  const month=(now)=>today(now).slice(0,7);
  function dueDate(p,day=10){
    if(/^\d{4}-\d{2}-\d{2}$/.test(p.data_vencimento||'')) return p.data_vencimento;
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.mes_referencia||'')) return null;
    return `${p.mes_referencia}-${String(Math.max(1,Math.min(28,Number(day)||10))).padStart(2,'0')}`;
  }
  function status(p,day,now){
    if(p.status==='pago'||p.status==='cancelado') return p.status;
    const due=dueDate(p,day);
    return due && due<today(now) ? 'atrasado':'pendente';
  }
  function canonical(rows){
    const map=new Map();
    const rank={pago:3,cancelado:2,atrasado:1,pendente:0};
    for(const p of rows||[]){
      const key=`${p.associado_id||p.doador_id||''}:${p.mes_referencia}`;
      const old=map.get(key);
      if(!old || (rank[p.status]??0)>(rank[old.status]??0)) map.set(key,p);
    }
    return [...map.values()].sort((a,b)=>b.mes_referencia.localeCompare(a.mes_referencia));
  }
  function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function validCPF(value){
    const n=String(value).replace(/\D/g,'');
    if(n.length!==11||/^(\d)\1{10}$/.test(n)) return false;
    for(let length=9;length<=10;length++){
      let sum=0; for(let i=0;i<length;i++) sum+=Number(n[i])*(length+1-i);
      const digit=(sum*10)%11%10; if(digit!==Number(n[length])) return false;
    }
    return true;
  }
  function validDate(value){
    if(!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false;
    const [d,m,y]=value.split('/').map(Number), dt=new Date(Date.UTC(y,m-1,d));
    return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d&&`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`<=today();
  }
  function reminder(rows,day=10,now=new Date()){
    const date=today(now), soon=new Date(`${date}T12:00:00Z`); soon.setUTCDate(soon.getUTCDate()+3);
    const end=soon.toISOString().slice(0,10);
    const open=canonical(rows).filter(p=>!['pago','cancelado'].includes(p.status));
    if(open.some(p=>dueDate(p,day)<date)) return 'Sua contribuição está atrasada. Abra o app para conferir. Se já pagou, atualize a confirmação.';
    if(open.some(p=>dueDate(p,day)===date)) return 'Você tem uma contribuição pendente com vencimento hoje.';
    if(open.some(p=>dueDate(p,day)>date&&dueDate(p,day)<=end)) return 'Está próxima a data da sua contribuição. Abra o app para conferir.';
    return null;
  }
  root.AmorDomain={today,month,dueDate,status,canonical,escapeHTML,validCPF,validDate,reminder};
})(typeof window==='undefined'?globalThis:window);
