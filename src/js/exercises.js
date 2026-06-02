/* =============================================================================
   MODULE DES EXERCICES INTERACTIFS (gamification 'GX')
   Les 8 mini-jeux, le HUD XP/badges, et les hooks de progression SCORM.
   👉 CONSULTANTS : le contenu des exercices se trouve dans les objets de config
   en haut de chaque exX (libellés, bonnes réponses, explications).
   ============================================================================= */
const GX = (function(){
  "use strict";

  /* ---------- Global progress / XP / badges ---------- */
  const MODULES = ['data','storage','api','etl','ai','agents','rag','business'];
  const BADGE_ICON = {data:'📊',storage:'🏛',api:'📡',etl:'🧹',ai:'🧠',agents:'🛠',rag:'🔄',business:'💼'};
  const XP_PER = 50;
  const state = { done:{}, xp:0 };

  function toast(msg, xp){
    const t = document.getElementById('gx-toast');
    t.innerHTML = msg + (xp ? ' <span class="xp">+'+xp+' XP</span>' : '');
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(()=>t.classList.remove('show'), 2600);
  }

  function renderHud(){
    const count = Object.keys(state.done).length;
    const pct = Math.round(count / MODULES.length * 100);
    document.getElementById('gx-hud-xp').textContent = state.xp;
    document.getElementById('gx-hud-pct').textContent = pct + '%';
    const C = 2 * Math.PI * 17;
    document.getElementById('gx-hud-arc').style.strokeDashoffset = (C * (1 - pct/100)).toFixed(1);
    const wrap = document.getElementById('gx-hud-badges');
    wrap.innerHTML = MODULES.map(m =>
      `<span class="gx-hud-badge ${state.done[m]?'on':''}" title="${m}">${BADGE_ICON[m]}</span>`
    ).join('');
  }

  /* Mark a module complete: award XP once, show inline badge + toast */
  function complete(module, badgeMsg){
    const earnedEl = document.getElementById('gx-ex'+moduleIndex(module)+'-earned');
    if(earnedEl) earnedEl.classList.add('show');
    if(state.done[module]) return;          // idempotent — no double XP
    state.done[module] = true;
    state.xp += XP_PER;
    renderHud();
    toast((badgeMsg||'Module validé') , XP_PER);

    /* --- SCORM: report interactive progress + alternative completion path ---
       Each newly-finished exercise advances progress. Finishing ALL of them is
       a valid completion trigger on its own (independent of the final quiz),
       and finalizes the LMS session immediately (no close-button needed). */
    try {
      if (window.ConverteoSCORM) {
        const doneCount = Object.keys(state.done).length;
        const pct = Math.round(doneCount / MODULES.length * 100);
        window.ConverteoSCORM.setProgress(pct);
        if (doneCount >= MODULES.length) {
          console.log('[SCORM] all interactive exercises completed');
          window.ConverteoSCORM.finalizeQuiz();   // completed + commit + finish NOW (no score)
          window.ConverteoSCORM.debug();
        }
      }
    } catch (e) { console.warn('[SCORM] progress hook error:', e); }
  }
  function moduleIndex(m){ return MODULES.indexOf(m)+1; }

  /* ---------- Small DOM helpers ---------- */
  function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; }
  function fb(id, kind, html){
    const f=document.getElementById(id);
    f.className='gx-fb show '+(kind||'');
    f.innerHTML='<div class="gx-fb-label">'+(kind==='good'?'Bravo':kind==='bad'?'À revoir':'Explication')+'</div>'+html;
  }
  function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];} return a; }

  /* ---------- Shared drag & drop utilities ---------- */
  // Detects whether a drop target (zone) is under a touch point.
  function zoneUnderPoint(root, x, y){
    const els = document.elementsFromPoint(x, y) || [];
    for(const e of els){
      const z = e.closest && e.closest('.gx-zone, .gx-droppool');
      if(z && root.contains(z)) return z;
    }
    return null;
  }
  // Adds touch-drag (long-press-free) to a chip: mirrors HTML5 dnd for mobile.
  function addTouchDrag(chip, onDrop, root){
    let ghost=null, dropping=false;
    chip.addEventListener('touchstart',e=>{
      // single-finger only; let multi-touch gestures (zoom) pass through
      if(e.touches.length!==1) return;
    },{passive:true});
    chip.addEventListener('touchmove',e=>{
      if(e.touches.length!==1) return;
      const t=e.touches[0];
      if(!ghost){
        // begin drag once finger actually moves
        dropping=true;
        chip.classList.add('gx-dragging');
        ghost=chip.cloneNode(true);
        ghost.style.cssText='position:fixed;z-index:9999;pointer-events:none;opacity:.9;left:0;top:0;margin:0;box-shadow:0 8px 24px rgba(0,0,0,.25);';
        document.body.appendChild(ghost);
      }
      e.preventDefault(); // prevent scroll while dragging a chip
      ghost.style.transform=`translate(${t.clientX-ghost.offsetWidth/2}px,${t.clientY-ghost.offsetHeight/2}px)`;
      root.querySelectorAll('.gx-hover').forEach(z=>z.classList.remove('gx-hover'));
      const z=zoneUnderPoint(root,t.clientX,t.clientY);
      if(z) z.classList.add('gx-hover');
    },{passive:false});
    chip.addEventListener('touchend',e=>{
      if(!dropping){ return; } // was a tap → let click handler fire
      dropping=false;
      chip.classList.remove('gx-dragging');
      if(ghost){ ghost.remove(); ghost=null; }
      const t=e.changedTouches[0];
      const z=zoneUnderPoint(root,t.clientX,t.clientY);
      root.querySelectorAll('.gx-hover').forEach(zz=>zz.classList.remove('gx-hover'));
      if(z){ e.preventDefault(); onDrop(z); }
    });
  }
  const GRIP='<span class="gx-grip">⠿</span>';

  /* ===================================================================
     Reusable "classify into zones" engine (used by Ex1 & Ex5)
     =================================================================== */
  function makeClassifier(cfg){
    // cfg: {prefix, module, items:[{id,label,cat,exp}], badgeMsg}
    const sel = {}; // itemId -> zone or null
    let active = null;

    function poolEl(){ return document.getElementById(cfg.prefix+'-pool'); }
    function root(){ return document.getElementById('gx-ex'+moduleIndex(cfg.module)); }

    function render(){
      const r = root();
      // helper: place an item into a zone (or back to pool when zone==='__pool__')
      const place = (id, zone)=>{ sel[id] = (zone==='__pool__') ? null : zone; active=null; render(); refreshBtn(); };

      // build a chip element with drag + click + (mobile) touch
      function buildChip(it, placed){
        const c = el(`<span class="gx-chip${placed?' gx-locked gx-placed-in':''}" draggable="true" data-id="${it.id}">${GRIP}<span>${it.label}</span>${placed?' <span class="gx-mini">✕</span>':''}</span>`);
        // click-to-select (fallback, esp. touch)
        c.onclick = (e)=>{ if(e.target.classList.contains('gx-mini')) return; if(placed){ place(it.id,'__pool__'); } else { toggle(it.id, c); } };
        if(placed){ c.querySelector('.gx-mini').onclick=(e)=>{ e.stopPropagation(); place(it.id,'__pool__'); }; }
        if(!placed && active===it.id) c.classList.add('gx-active');
        // HTML5 drag
        c.addEventListener('dragstart',e=>{ e.dataTransfer.setData('text/plain',it.id); e.dataTransfer.effectAllowed='move'; c.classList.add('gx-dragging'); active=null; });
        c.addEventListener('dragend',()=>{ c.classList.remove('gx-dragging'); r.querySelectorAll('.gx-hover').forEach(z=>z.classList.remove('gx-hover')); });
        // touch drag (mobile)
        addTouchDrag(c, (zoneEl)=>{ place(it.id, zoneEl.dataset.cat || (zoneEl.classList.contains('gx-droppool')?'__pool__':null)); }, r);
        return c;
      }

      // unplaced chips into pool
      const pool = poolEl(); pool.innerHTML='';
      cfg.items.forEach(it=>{ if(!sel[it.id]) pool.appendChild(buildChip(it,false)); });

      // placed chips into zones
      r.querySelectorAll('[data-zone]').forEach(z=>{
        z.innerHTML='';
        cfg.items.filter(it=>sel[it.id]===z.dataset.zone).forEach(it=>z.appendChild(buildChip(it,true)));
      });

      // make zones drop targets (HTML5) + keep click-to-place
      r.querySelectorAll('.gx-zone').forEach(zone=>{
        zone.onclick=()=>{ if(!active) return; place(active, zone.dataset.cat); };
        zone.ondragover=(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect='move'; zone.classList.add('gx-hover'); };
        zone.ondragleave=()=>zone.classList.remove('gx-hover');
        zone.ondrop=(e)=>{ e.preventDefault(); zone.classList.remove('gx-hover'); const id=e.dataTransfer.getData('text/plain'); if(id) place(id, zone.dataset.cat); };
      });
      // make the pool a drop target too (drag a placed chip back out)
      pool.classList.add('gx-droppool');
      pool.ondragover=(e)=>{ e.preventDefault(); pool.classList.add('gx-hover'); };
      pool.ondragleave=()=>pool.classList.remove('gx-hover');
      pool.ondrop=(e)=>{ e.preventDefault(); pool.classList.remove('gx-hover'); const id=e.dataTransfer.getData('text/plain'); if(id) place(id,'__pool__'); };
    }
    function toggle(id, chip){ active = (active===id)? null : id; render(); }
    function refreshBtn(){
      const all = cfg.items.every(it=>sel[it.id]);
      document.getElementById(cfg.prefix+'-check').disabled = !all;
    }
    function check(){
      let ok=0;
      cfg.items.forEach(it=>{
        const correct = sel[it.id]===it.cat;
        if(correct) ok++;
        // colour the placed chip
        const z = root().querySelector(`[data-zone="${sel[it.id]}"] [data-id="${it.id}"]`);
        if(z) z.classList.add(correct?'gx-ok':'gx-ko');
      });
      document.getElementById(cfg.prefix+'-score').textContent = ok+' / '+cfg.items.length;
      const wrong = cfg.items.filter(it=>sel[it.id]!==it.cat);
      if(ok===cfg.items.length){
        fb(cfg.prefix+'-fb','good','<p>Sans faute ! '+cfg.allGood+'</p>');
        complete(cfg.module, cfg.badgeMsg);
      } else {
        fb(cfg.prefix+'-fb','bad','<p>'+ok+'/'+cfg.items.length+' correct. Corrections :</p>'+
          wrong.map(it=>'<p>• <b>'+it.label+'</b> → '+it.exp+'</p>').join(''));
      }
    }
    function reset(){
      cfg.items.forEach(it=>sel[it.id]=null); active=null;
      render(); refreshBtn();
      const f=document.getElementById(cfg.prefix+'-fb'); f.className='gx-fb';
      document.getElementById(cfg.prefix+'-score').textContent='0 / '+cfg.items.length;
    }
    function initZones(){
      // If zonesOverride provided, build zone DOM dynamically (e.g. Ex2 with 5 solution columns)
      if(cfg.zonesOverride){
        const container = document.getElementById(cfg.prefix+'-zones');
        if(container){
          container.innerHTML='';
          cfg.zonesOverride.forEach(z=>{
            const div=el('<div class="gx-zone" data-cat="'+z.cat+'"><div class="gx-zone-title">'+z.title+'</div><div class="gx-zone-sub">'+z.sub+'</div><div class="gx-zone-items" data-zone="'+z.cat+'"></div></div>');
            container.appendChild(div);
          });
        }
      }
    }
    return { init(){ shuffleInit(); initZones(); render(); }, check, reset, _render:render };
    function shuffleInit(){ cfg.items = shuffle(cfg.items); cfg.items.forEach(it=>sel[it.id]=null); }
  }

  /* ===================================================================
     EX1 — Data classification
     =================================================================== */
  const ex1 = makeClassifier({
    prefix:'gx-ex1', module:'data',
    badgeMsg:'🏅 Maître de la Donnée',
    allGood:'Vous distinguez parfaitement les trois grandes familles de données.',
    items:[
      {id:'d1',label:'Table SQL de commandes',cat:'structured',exp:'lignes/colonnes à schéma fixe = structurée.'},
      {id:'d2',label:'Photos de produits',cat:'unstructured',exp:'une image n\'a pas de schéma = non structurée.'},
      {id:'d3',label:'Réponse JSON d\'une API',cat:'semi',exp:'JSON a une structure souple par balises = semi-structurée.'},
      {id:'d4',label:'Avis client en texte libre',cat:'unstructured',exp:'du texte libre = non structurée.'},
      {id:'d5',label:'Fichier Excel de ventes',cat:'structured',exp:'tableau à colonnes typées = structurée.'},
      {id:'d6',label:'E-mail (entête + corps)',cat:'semi',exp:'champs structurés + corps libre = semi-structurée.'}
    ]
  });

  /* ===================================================================
     EX2 — Storage matching (need -> solution, via selects)
     =================================================================== */
  const ex2 = makeClassifier({
    prefix:'gx-ex2', module:'storage',
    badgeMsg:'\ud83c\udfc5 Architecte Data',
    allGood:'Vous savez choisir la bonne brique de stockage selon le besoin m\u00e9tier \u2014 r\u00e9flexe cl\u00e9 en mission.',
    zonesOverride:[
      {cat:'Data Lake',     title:'\ud83c\udf0a Data Lake',     sub:'Stockage brut, tout format'},
      {cat:'Data Warehouse',title:'\ud83c\udfd7 Data Warehouse', sub:'Analytique structur\u00e9'},
      {cat:'CDP',           title:'\ud83d\udc64 CDP',            sub:'Profils clients unifi\u00e9s'},
      {cat:'SQL',           title:'\ud83d\udd17 SQL',            sub:'Base relationnelle transac.'},
      {cat:'NoSQL',         title:'\u26a1 NoSQL',                sub:'Flexible & haute scalabilit\u00e9'}
    ],
    items:[
      {id:'s1',label:'Stocker des To de logs bruts & fichiers h\u00e9t\u00e9rog\u00e8nes \u00e0 bas co\u00fbt',cat:'Data Lake',exp:'Le Data Lake ing\u00e8re tout format en brut, id\u00e9al et \u00e9conomique pour le stockage massif non raffin\u00e9.'},
      {id:'s2',label:'Croiser des ann\u00e9es de ventes pour du reporting BI fiable',cat:'Data Warehouse',exp:'Le Data Warehouse est structur\u00e9 et optimis\u00e9 pour les requ\u00eates analytiques complexes.'},
      {id:'s3',label:'R\u00e9concilier les interactions d\'un client en un profil unique activable',cat:'CDP',exp:'La CDP unifie les donn\u00e9es clients first-party pour l\'activation marketing temps r\u00e9el.'},
      {id:'s4',label:'G\u00e9rer des transactions e-commerce avec relations strictes (commandes/clients)',cat:'SQL',exp:'Une base relationnelle (SQL) garantit l\'int\u00e9grit\u00e9 des relations et la fiabilit\u00e9 des transactions.'},
      {id:'s5',label:'Servir un catalogue produit flexible, \u00e0 tr\u00e8s haut trafic et sch\u00e9ma changeant',cat:'NoSQL',exp:'Le NoSQL offre flexibilit\u00e9 de sch\u00e9ma et scalabilit\u00e9 horizontale pour ces charges.'}
    ]
  });

  /* ===================================================================
     EX3 — API simulator
     =================================================================== */
  const ex3 = (function(){
    let method='GET', calls=0;
    const EP = {
      GET:[
        {path:'/api/v1/clients?id=123', status:'200', code:'s200', body:{id:123,name:'Fnac Darty',segment:'Premium',revenue:4200000}},
        {path:'/api/v1/orders?date=today', status:'200', code:'s200', body:{count:842,total_eur:128400,currency:'EUR'}},
        {path:'/api/v1/products/999999', status:'400', code:'s400', body:{error:'not_found',message:'Produit inexistant'}}
      ],
      POST:[
        {path:'/api/v1/clients', status:'201', code:'s201', payload:{name:'Nouveau Client',segment:'Standard'}, body:{id:5567,created:true}},
        {path:'/api/v1/events', status:'201', code:'s201', payload:{type:'banner_click',user:123}, body:{event_id:'evt_91a2',stored:true}},
        {path:'/api/v1/orders', status:'400', code:'s400', payload:{items:[]}, body:{error:'validation',message:'Panier vide'}}
      ]
    };
    function setMethod(m){
      method=m;
      document.querySelectorAll('#gx-ex3-method button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
      render();
    }
    function render(){
      const sel=document.getElementById('gx-ex3-endpoint');
      sel.innerHTML = EP[method].map((e,i)=>`<option value="${i}">${e.path}</option>`).join('');
      const e=EP[method][0];
      togglePayload();
    }
    function togglePayload(){
      const i=+document.getElementById('gx-ex3-endpoint').value||0;
      const e=EP[method][i];
      const wrap=document.getElementById('gx-ex3-payload-wrap');
      if(method==='POST'){ wrap.style.display='flex'; document.getElementById('gx-ex3-payload').textContent=JSON.stringify(e.payload,null,2); }
      else wrap.style.display='none';
    }
    let obj1Done=false, obj2Done=false;
    function markObj(id, done){
      const el2=document.getElementById(id);
      if(!el2) return;
      el2.textContent=(done?'✅ ':'⬜ ')+el2.textContent.replace(/^[✅⬜] /,'');
      el2.style.background=done?'rgba(16,185,129,.15)':'rgba(255,255,255,.08)';
      el2.style.color=done?'var(--green)':'#8B8ECA';
      el2.style.borderColor=done?'rgba(16,185,129,.4)':'rgba(255,255,255,.12)';
    }
    function send(){
      const i=+document.getElementById('gx-ex3-endpoint').value||0;
      const e=EP[method][i];
      togglePayload();
      const respEl=document.getElementById('gx-ex3-resp');
      respEl.innerHTML='<span style="color:#AEB4DC;">▸ '+method+' '+e.path+'</span>\n<span style="color:#AEB4DC;">⏳ requête en cours…</span>';
      setTimeout(()=>{
        respEl.innerHTML =
          '<span style="color:#AEB4DC;">▸ '+method+' '+e.path+'</span>\n'+
          'HTTP <span class="gx-status '+e.code+'">'+e.status+'</span>\n\n'+
          syntax(JSON.stringify(e.body,null,2));
        calls++;
        document.getElementById('gx-ex3-score').textContent=calls+' appel'+(calls>1?'s':'');
        const isGet=method==='GET', okStatus=e.status[0]!=='4';
        // Track objectives
        if(method==='GET' && e.path.includes('clients?id=123') && okStatus){ obj1Done=true; markObj('obj-1',true); }
        if(method==='POST' && e.path.includes('/api/v1/events') && okStatus){ obj2Done=true; markObj('obj-2',true); }
        const msgSuffix = !obj1Done ? '<br><em style="font-size:11px;color:#8B8ECA;">💡 Avez-vous cherché le segment du client 123 ?</em>'
          : !obj2Done ? '<br><em style="font-size:11px;color:#8B8ECA;">💡 Maintenant créez un événement via POST.</em>' : '';
        fb('gx-ex3-fb', okStatus?'good':'bad',
          okStatus
            ? '<p><b>'+method+'</b> '+(isGet?'a <b>lu</b> une ressource sans la modifier (statut 2xx).':'a <b>créé</b> une ressource côté serveur — statut <b>201 Created</b>.')+'</p>'+msgSuffix
            : '<p>Statut <b>400</b> : la requête est mal formée ou la ressource n\'existe pas. Une API renvoie toujours un code HTTP qui dit si l\'appel a réussi.</p>');
        if(obj1Done && obj2Done) complete('api','🏅 Connecteur d\'APIs');
      }, 420);
    }
    function syntax(s){
      return s.replace(/("(\\.|[^"])*")(\s*:)?/g,(m,p1,_,colon)=>
        colon ? '<span style="color:#7DD3FC;">'+p1+'</span>'+colon : '<span style="color:#A7F3D0;">'+p1+'</span>')
        .replace(/\b(\d+)\b/g,'<span style="color:#F59E0B;">$1</span>')
        .replace(/\b(true|false)\b/g,'<span style="color:#00B2B2;">$1</span>');
    }
    function init(){ setMethod('GET'); }
    return { init, setMethod, render:togglePayload, send };
  })();

  /* ===================================================================
     EX4 — ETL ordered cleaning
     =================================================================== */
  const ex4 = (function(){
    // 3 ordered steps: dedupe -> fill missing -> normalize dates
    const STEPS = [
      {id:'dedupe', label:'🗑 Supprimer les doublons', exp:'On commence par dédupliquer : inutile de traiter deux fois la même ligne.'},
      {id:'fill',   label:'➕ Compléter les valeurs manquantes', exp:'Ensuite on impute les manquants (ici, ville par défaut / valeur connue).'},
      {id:'dates',  label:'📅 Normaliser le format des dates', exp:'Enfin on uniformise les dates au format ISO (AAAA-MM-JJ).'}
    ];
    const ORDER=['dedupe','fill','dates'];
    let step=0;
    const data0=[
      {id:1,name:'Fnac Darty',city:'Paris',date:'01/03/2024',flags:[]},
      {id:2,name:'Decathlon',city:'',date:'2024-03-02',flags:['fill']},
      {id:2,name:'Decathlon',city:'',date:'2024-03-02',flags:['dedupe','fill']},
      {id:3,name:'Sephora',city:'Lyon',date:'March 5 2024',flags:['dates']}
    ];
    let data=clone(data0);
    function clone(d){ return d.map(r=>({...r,flags:r.flags.slice()})); }
    function table(){
      const t=document.getElementById('gx-ex4-table');
      t.innerHTML='<thead><tr><th>id</th><th>name</th><th>city</th><th>date</th></tr></thead><tbody>'+
        data.map(r=>{
          const bad=r.flags.length>0;
          return `<tr class="${bad?'gx-bad':''}"><td>${r.id}</td><td>${r.name}</td>`+
            `<td>${r.city||'<span class="gx-flag">∅ manquant</span>'}</td>`+
            `<td>${/\d{4}-\d{2}-\d{2}/.test(r.date)?r.date:'<span class="gx-flag">'+r.date+'</span>'}</td></tr>`;
        }).join('')+'</tbody>';
    }
    function actions(){
      const pool=document.getElementById('gx-ex4-actions'); pool.innerHTML='';
      shuffle(STEPS).forEach(s=>{
        const c=el(`<span class="gx-chip" data-step="${s.id}">${s.label}</span>`);
        c.onclick=()=>apply(s.id,c);
        pool.appendChild(c);
      });
      document.getElementById('gx-ex4-step').textContent=step+1;
    }
    function apply(id,chip){
      const expected=ORDER[step];
      if(id!==expected){
        chip.classList.add('gx-ko');
        const s=STEPS.find(x=>x.id===expected);
        fb('gx-ex4-fb','bad','<p>Pas encore : la bonne action à cette étape est <b>'+s.label.replace(/^[^ ]+ /,'')+'</b>. '+s.exp+'</p>');
        setTimeout(()=>chip.classList.remove('gx-ko'),700);
        return;
      }
      // perform transform
      if(id==='dedupe') data=dedup(data);
      if(id==='fill') data.forEach(r=>{ if(!r.city){r.city='Paris';} r.flags=r.flags.filter(f=>f!=='fill'); });
      if(id==='dates') data.forEach(r=>{ if(r.date==='01/03/2024')r.date='2024-03-01'; if(r.date==='March 5 2024')r.date='2024-03-05'; r.flags=r.flags.filter(f=>f!=='dates'); });
      step++;
      table();
      const s=STEPS.find(x=>x.id===id);
      document.getElementById('gx-ex4-score').textContent=step+' / 3';
      if(step>=3){
        fb('gx-ex4-fb','good','<p>Dataset propre ! Doublons supprimés, manquants comblés, dates normalisées. C\'est exactement le « T » (Transform) d\'un pipeline ETL.</p>');
        document.getElementById('gx-ex4-actions').innerHTML='<span style="font-size:12px;color:var(--green);font-weight:700;">✓ Pipeline terminé</span>';
        complete('etl','🏅 Chef de la Data Quality');
      } else {
        fb('gx-ex4-fb','good','<p>✓ '+s.exp+'</p>');
        actions();
      }
    }
    function dedup(d){ const seen=new Set(); return d.filter(r=>{ const k=r.id+'|'+r.name; if(seen.has(k))return false; seen.add(k); r.flags=r.flags.filter(f=>f!=='dedupe'); return true; }); }
    function init(){ step=0; data=clone(data0); table(); actions(); const f=document.getElementById('gx-ex4-fb'); f.className='gx-fb'; document.getElementById('gx-ex4-score').textContent='0 / 3'; }
    return { init, reset:init };
  })();

  /* ===================================================================
     EX5 — AI / LLM / Agent classification
     =================================================================== */
  const ex5 = (function(){
    const SCENARIOS = [
      {id:'sc1',
       brief:'Un directeur marketing veut prédire quels clients vont se désabonner dans les 30 prochains jours, à partir de leur historique d\'achats et de leur fréquence de visite.',
       opts:['⚙️ Modèle ML','💬 LLM','🤖 Agent IA'],
       ok:0,
       exp:'C\'est une tâche de prédiction sur données structurées (historique, fréquence) → Modèle ML classique (ex. XGBoost, régression logistique). Le LLM n\'est pas adapté aux tableaux de chiffres.'},
      {id:'sc2',
       brief:'Un consultant veut interroger en langage naturel 500 comptes-rendus de réunion clients et obtenir une synthèse des points de friction récurrents.',
       opts:['⚙️ Modèle ML','💬 LLM + RAG','🤖 Agent IA'],
       ok:1,
       exp:'C\'est un cas typique de LLM + RAG : on récupère les documents pertinents (Retrieval) et on les injecte dans le contexte du LLM pour une synthèse précise et sourcée.'},
      {id:'sc3',
       brief:'Une équipe veut automatiser entièrement la veille concurrentielle : surveiller 20 sites, résumer les nouveautés, et envoyer un email récap chaque lundi matin sans intervention humaine.',
       opts:['⚙️ Modèle ML','💬 LLM seul','🤖 Agent IA'],
       ok:2,
       exp:'Multi-étapes + outils (web scraping, email) + planification autonome = Agent IA. Un LLM seul ne peut pas naviguer sur le web ni envoyer des emails sans outillage.'},
      {id:'sc4',
       brief:'Un retailer veut générer automatiquement des fiches produits à partir d\'un tableau Excel contenant le nom, le poids et la catégorie de 10 000 articles.',
       opts:['⚙️ Modèle ML','💬 LLM','🤖 Agent IA'],
       ok:1,
       exp:'Génération de texte à partir de données structurées = LLM. Pas besoin d\'un agent (pas d\'action multi-étapes) ni d\'un modèle ML (pas de prédiction numérique).'}
    ];
    let answers = {};
    function init(){
      answers = {};
      const wrap = document.getElementById('gx-ex5-scenarios');
      wrap.innerHTML = '';
      SCENARIOS.forEach((sc,si)=>{
        const letters = ['A','B','C'];
        const div = el('<div style="margin-bottom:20px;padding:16px;background:var(--gray-lt);border:1.5px solid var(--gray-bdr);border-radius:12px;" data-sc="'+sc.id+'">'+
          '<div style="font-size:10px;font-weight:700;color:var(--teal);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">Scénario '+(si+1)+' / '+SCENARIOS.length+'</div>'+
          '<p style="font-size:13px;font-weight:600;color:var(--navy);line-height:1.6;margin-bottom:12px;">'+sc.brief+'</p>'+
          '<div class="gx-opts ex5-opts" data-scid="'+sc.id+'">'+
            sc.opts.map((o,i)=>'<div class="gx-opt ex5-opt" data-scid="'+sc.id+'" data-idx="'+i+'"><div class="gx-opt-radio">'+letters[i]+'</div><div class="gx-opt-text">'+o+'</div></div>').join('')+
          '</div>'+
        '</div>');
        wrap.appendChild(div);
      });
      wrap.querySelectorAll('.ex5-opt').forEach(opt=>{
        opt.onclick=()=>{
          const scid=opt.dataset.scid;
          answers[scid]=+opt.dataset.idx;
          wrap.querySelectorAll('.ex5-opt[data-scid="'+scid+'"]').forEach(o=>o.classList.remove('selected'));
          opt.classList.add('selected');
          opt.style.borderColor='var(--teal)'; opt.style.background='var(--teal-lt)';
          wrap.querySelectorAll('.ex5-opt[data-scid="'+scid+'"]:not(.selected)').forEach(o=>{ o.style.borderColor=''; o.style.background=''; });
          refreshBtn();
        };
      });
      const f=document.getElementById('gx-ex5-fb'); f.className='gx-fb';
      document.getElementById('gx-ex5-score').textContent='0 / '+SCENARIOS.length;
    }
    function refreshBtn(){
      document.getElementById('gx-ex5-check').disabled = SCENARIOS.some(sc=>answers[sc.id]===undefined);
    }
    function check(){
      let ok=0;
      const wrap=document.getElementById('gx-ex5-scenarios');
      SCENARIOS.forEach(sc=>{
        const chosen=answers[sc.id];
        const correct=chosen===sc.ok;
        if(correct) ok++;
        wrap.querySelectorAll('.ex5-opt[data-scid="'+sc.id+'"]').forEach(opt=>{
          const idx=+opt.dataset.idx;
          opt.classList.add('gx-locked');
          if(idx===sc.ok){ opt.style.borderColor='var(--green)'; opt.style.background='var(--green-lt)'; opt.querySelector('.gx-opt-radio').style.background='var(--green)'; opt.querySelector('.gx-opt-radio').style.color='#fff'; }
          else if(idx===chosen && !correct){ opt.style.borderColor='var(--red)'; opt.style.background='var(--red-lt)'; }
        });
        // inject explanation
        const scDiv=wrap.querySelector('[data-sc="'+sc.id+'"]');
        if(scDiv){
          const expDiv=document.createElement('div');
          expDiv.style.cssText='margin-top:10px;padding:10px 14px;background:'+(correct?'var(--green-lt)':'var(--red-lt)')+';border-left:3px solid '+(correct?'var(--green)':'var(--red)')+';border-radius:0 8px 8px 0;font-size:12px;color:var(--gray-dk);line-height:1.6;';
          expDiv.innerHTML=(correct?'✅ ':'❌ ')+'<strong>'+sc.opts[sc.ok]+'</strong> — '+sc.exp;
          scDiv.appendChild(expDiv);
        }
      });
      document.getElementById('gx-ex5-score').textContent=ok+' / '+SCENARIOS.length;
      if(ok===SCENARIOS.length){
        fb('gx-ex5-fb','good','<p>Parfait 4/4 ! Vous distinguez modèle ML, LLM et agent — un vrai atout pour cadrer les projets IA en mission.</p>');
        complete('ai','🏅 Cartographe de l\'IA');
      } else {
        fb('gx-ex5-fb','bad','<p>'+ok+'/'+SCENARIOS.length+' correct. Lisez les explications ci-dessus pour affiner votre boussole IA.</p>');
      }
    }
    return { init, check, reset:init };
  })();

  /* ===================================================================
     EX6 — Agent builder
     =================================================================== */
  const ex6 = (function(){
    // Correct combo for the scenario (avis clients négatifs → alerte équipe produit)
    const CORRECT = {
      objective:'Analyser les verbatims clients',
      tools:'CRM + Base verbatims',
      memory:'Long terme (vectorielle)',
      action:'Envoyer un e-mail à l\'équipe'
    };
    const EXPLANATIONS = {
      objective:{
        'Analyser les verbatims clients':'✅ Parfait — l\'objectif est bien d\'analyser les avis clients négatifs.',
        'Surveiller la concurrence':'❌ Hors sujet — le brief porte sur les avis clients internes, pas la veille concurrentielle.',
        'Générer un reporting hebdo':'❌ Trop générique — l\'agent doit surveiller en continu et alerter en temps quasi-réel.'
      },
      tools:{
        'CRM + Base verbatims':'✅ Correct — les avis clients sont dans le CRM et la base de verbatims.',
        'Web search + Scraper':'❌ Ces outils servent à surveiller le web externe, pas les données internes.',
        'SQL Warehouse + BI':'❌ Le BI est utile pour analyser, mais pas pour surveiller et alerter en temps réel.'
      },
      memory:{
        'Long terme (vectorielle)':'✅ Correct — la mémoire vectorielle permet de comparer les avis actuels aux tendances passées.',
        'Court terme (session)':'❌ La mémoire de session ne persiste pas entre les exécutions quotidiennes de l\'agent.',
        'Aucune':'❌ Sans mémoire, l\'agent ne peut pas détecter une dégradation progressive des avis dans le temps.'
      },
      action:{
        'Envoyer un e-mail à l\'équipe':'✅ Correct — l\'alerte se fait bien par e-mail à l\'équipe produit.',
        'Mettre à jour un dashboard':'❌ Un dashboard est passif. Le brief demande une alerte active quand un seuil est dépassé.',
        'Créer un ticket Jira':'❌ Utile en complément, mais le brief demande d\'alerter l\'équipe produit directement.'
      }
    };
    const SLOTS = [
      {key:'objective', label:'1 · Objectif', opts:['Analyser les verbatims clients','Surveiller la concurrence','Générer un reporting hebdo']},
      {key:'tools',     label:'2 · Outils',   opts:['CRM + Base verbatims','Web search + Scraper','SQL Warehouse + BI']},
      {key:'memory',    label:'3 · Mémoire',  opts:['Court terme (session)','Long terme (vectorielle)','Aucune']},
      {key:'action',    label:'4 · Action finale', opts:['Envoyer un e-mail à l\'équipe','Mettre à jour un dashboard','Créer un ticket Jira']}
    ];
    const pick={};
    function init(){
      Object.keys(pick).forEach(k=>delete pick[k]);
      const w=document.getElementById('gx-ex6-builder'); w.innerHTML='';
      SLOTS.forEach(s=>{
        const col=el('<div class="gx-build-col"><div class="gx-build-label">'+s.label+'</div><div class="gx-pool" data-slot="'+s.key+'"></div></div>');
        s.opts.forEach(o=>{
          const c=el('<span class="gx-chip">'+o+'</span>');
          c.onclick=()=>{ pick[s.key]=o; col.querySelectorAll('.gx-chip').forEach(x=>{ x.classList.remove('gx-active','gx-ok','gx-ko'); x.style.borderColor=''; }); c.classList.add('gx-active'); refresh(); };
          col.querySelector('.gx-pool').appendChild(c);
        });
        w.appendChild(col);
      });
      document.getElementById('gx-ex6-wf').className='gx-workflow';
      document.getElementById('gx-ex6-score').textContent='0 / 4';
      const f=document.getElementById('gx-ex6-fb')||null; if(f) f.className='gx-fb';
      refresh();
    }
    function refresh(){ document.getElementById('gx-ex6-build').disabled = SLOTS.some(s=>!pick[s.key]); }
    function build(){
      let ok=0;
      const wf=document.getElementById('gx-ex6-wf');
      const feedbackLines=[];
      SLOTS.forEach(s=>{
        const chosen=pick[s.key];
        const correct=chosen===CORRECT[s.key];
        if(correct) ok++;
        const exp=EXPLANATIONS[s.key][chosen]||'';
        feedbackLines.push('<p><b>'+s.label+'</b> : '+exp+'</p>');
        // colour the selected chip (match on trimmed inner span text, not full textContent which includes grip char)
        document.getElementById('gx-ex6-builder').querySelectorAll('.gx-chip').forEach(c=>{
          const chipLabel = c.querySelector('span') ? c.querySelector('span').textContent.trim() : c.textContent.replace(/[^\w\s\+&éèàùâêîôûçœ'\-]/g,'').trim();
          if(chipLabel===chosen || c.textContent.includes(chosen)){
            c.classList.remove('gx-active');
            c.classList.add(correct?'gx-ok':'gx-ko');
          }
        });
      });
      document.getElementById('gx-ex6-score').textContent=ok+' / 4';
      wf.className='gx-workflow show';
      wf.innerHTML=
        '<div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--teal);margin-bottom:12px;">Workflow de votre agent</div>'+
        '<div class="gx-wf-row">'+
          node('🎯',pick.objective)+arrow()+node('🧰',pick.tools)+arrow()+node('💾',pick.memory)+arrow()+node('⚡',pick.action)+
        '</div>';
      // Insert feedback inline
      const fbWrap=document.createElement('div');
      fbWrap.style.cssText='margin-top:14px;';
      fbWrap.innerHTML=feedbackLines.join('');
      wf.appendChild(fbWrap);
      if(ok===4){
        fb('gx-ex6-fb','good','<p>Combinaison parfaite ! Vous savez architecturer un agent IA adapté à un besoin métier précis.</p>');
        complete('agents','🏅 Bâtisseur d\'Agents');
      } else {
        fb('gx-ex6-fb','bad','<p>'+ok+'/4 briques correctes. Corrigez les erreurs et réessayez — chaque choix doit coller au scénario.</p>');
        // re-enable button for retry
        setTimeout(()=>{ document.getElementById('gx-ex6-build').disabled=false; },800);
        // reset picks to allow re-selection
        SLOTS.forEach(s=>delete pick[s.key]);
        document.getElementById('gx-ex6-builder').querySelectorAll('.gx-chip').forEach(c=>c.classList.remove('gx-active','gx-ok','gx-ko'));
      }
    }
    function node(ic,txt){ return '<span class="gx-wf-node">'+ic+' '+txt+'</span>'; }
    function arrow(){ return '<span class="gx-wf-arrow">→</span>'; }
    // Expose fb for inline use
    function fb_local(id,kind,html){ if(typeof fb==='function') fb(id,kind,html); }
    return { init, build, reset:init };
  })();

  /* ===================================================================
     EX7 — RAG sequencing (drag) + MCP tool selection
     =================================================================== */
  const ex7 = (function(){
    const CORRECT=['question','retrieval','context','generation','response'];
    const LABELS={question:'Question utilisateur',retrieval:'Recherche (Retrieval)',context:'Injection du contexte',generation:'Génération (LLM)',response:'Réponse sourcée'};
    let order=[];
    let dragId=null;

    /* MCP tools: agent must book room, check calendar, send recap email */
    const TOOLS=[
      {id:'cal',label:'📅 Agenda',need:true},
      {id:'room',label:'🚪 Réservation de salle',need:true},
      {id:'mail',label:'✉️ E-mail',need:true},
      {id:'pay',label:'💳 Paiement',need:false},
      {id:'maps',label:'🗺 Cartographie',need:false},
      {id:'img',label:'🖼 Génération d\'images',need:false}
    ];
    const mcpSel={};

    function init(){
      order=shuffle(CORRECT);
      renderSeq();
      const pool=document.getElementById('gx-ex7-tools'); pool.innerHTML='';
      shuffle(TOOLS).forEach(t=>{
        const c=el(`<span class="gx-chip" data-tool="${t.id}">${t.label}</span>`);
        c.onclick=()=>{ mcpSel[t.id]=!mcpSel[t.id]; c.classList.toggle('gx-active',mcpSel[t.id]); };
        pool.appendChild(c);
      });
      ['gx-ex7-fb-seq','gx-ex7-fb-mcp'].forEach(id=>{const f=document.getElementById(id);f.className='gx-fb';});
    }
    function renderSeq(){
      const wrap=document.getElementById('gx-ex7-seq'); wrap.innerHTML='';
      order.forEach((id,i)=>{
        const item=el(`<div class="gx-seq-item" draggable="true" data-id="${id}">
          <span class="gx-seq-num">${i+1}</span><span class="gx-seq-label">${LABELS[id]}</span><span class="gx-seq-grip">⠿</span></div>`);
        // HTML5 drag
        item.addEventListener('dragstart',e=>{dragId=id;e.dataTransfer.effectAllowed='move';item.classList.add('gx-dragging');});
        item.addEventListener('dragend',()=>{dragId=null;item.classList.remove('gx-dragging');clearMarks();});
        item.addEventListener('dragover',e=>{e.preventDefault();markDropSide(item,e.clientY);});
        item.addEventListener('dragleave',()=>{item.classList.remove('gx-drop-before','gx-drop-after');});
        item.addEventListener('drop',e=>{e.preventDefault();clearMarks();reorder(dragId,id, e.clientY<item.getBoundingClientRect().top+item.offsetHeight/2);});
        // touch drag
        addSeqTouch(item,id);
        wrap.appendChild(item);
      });
    }
    function markDropSide(item,y){
      clearMarks();
      const r=item.getBoundingClientRect();
      item.classList.add(y < r.top+r.height/2 ? 'gx-drop-before' : 'gx-drop-after');
    }
    function clearMarks(){ document.querySelectorAll('#gx-ex7-seq .gx-seq-item').forEach(it=>it.classList.remove('gx-drop-before','gx-drop-after')); }
    function addSeqTouch(item,id){
      let ghost=null,dragging=false;
      item.addEventListener('touchmove',e=>{
        if(e.touches.length!==1)return;
        const t=e.touches[0];
        if(!ghost){ dragging=true; dragId=id; item.classList.add('gx-dragging');
          ghost=item.cloneNode(true); ghost.style.cssText='position:fixed;z-index:9999;pointer-events:none;opacity:.9;left:0;top:0;width:'+item.offsetWidth+'px;margin:0;box-shadow:0 8px 24px rgba(0,0,0,.25);'; document.body.appendChild(ghost);
        }
        e.preventDefault();
        ghost.style.transform=`translate(${t.clientX-30}px,${t.clientY-ghost.offsetHeight/2}px)`;
        const over=overSeqItem(t.clientX,t.clientY);
        clearMarks(); if(over&&over!==item){ markDropSide(over,t.clientY); }
      },{passive:false});
      item.addEventListener('touchend',e=>{
        if(!dragging)return; dragging=false; item.classList.remove('gx-dragging');
        if(ghost){ghost.remove();ghost=null;}
        const t=e.changedTouches[0]; const over=overSeqItem(t.clientX,t.clientY); clearMarks();
        if(over&&over!==item){ const before=t.clientY<over.getBoundingClientRect().top+over.offsetHeight/2; reorder(dragId,over.dataset.id,before); }
        dragId=null;
      });
    }
    function overSeqItem(x,y){
      const els=document.elementsFromPoint(x,y)||[];
      for(const e of els){ const it=e.closest&&e.closest('#gx-ex7-seq .gx-seq-item'); if(it) return it; }
      return null;
    }
    function reorder(from,to,before){
      if(!from||from===to)return;
      const a=order.filter(x=>x!==from);
      let idx=a.indexOf(to);
      if(before===false) idx+=1; // insert after
      if(before===undefined){ /* legacy: insert at target index */ }
      a.splice(idx,0,from);
      order=a; renderSeq();
    }
    function checkSeq(){
      const ok=order.every((id,i)=>id===CORRECT[i]);
      document.querySelectorAll('#gx-ex7-seq .gx-seq-item').forEach((it,i)=>{
        it.classList.remove('gx-ok','gx-ko');
        it.classList.add(order[i]===CORRECT[i]?'gx-ok':'gx-ko');
      });
      if(ok){ fb('gx-ex7-fb-seq','good','<p>Exact : Question → Retrieval → Contexte → Génération → Réponse. Le LLM ne « devine » plus, il répond sur des documents récupérés.</p>'); maybeComplete(); }
      else fb('gx-ex7-fb-seq','bad','<p>Pas encore. Le LLM ne peut générer qu\'<b>après</b> avoir récupéré (retrieval) puis reçu le contexte. Reclassez de la question vers la réponse.</p>');
      seqDone=ok;
    }
    let seqDone=false, mcpDone=false;
    function checkMcp(){
      let ok=true;
      TOOLS.forEach(t=>{ if(!!mcpSel[t.id]!==t.need) ok=false; });
      document.querySelectorAll('#gx-ex7-tools .gx-chip').forEach(c=>{
        const t=TOOLS.find(x=>x.id===c.dataset.tool);
        c.classList.remove('gx-ok','gx-ko','gx-active');
        const chosen=!!mcpSel[t.id];
        if(chosen) c.classList.add(t.need?'gx-ok':'gx-ko');
        else if(t.need) c.classList.add('gx-ko');
      });
      if(ok){ fb('gx-ex7-fb-mcp','good','<p>Parfait : on ne branche via MCP que les outils <b>utiles à la tâche</b> (agenda, salle, e-mail). Donner trop d\'outils augmente le risque et le coût.</p>'); mcpDone=true; maybeComplete(); }
      else fb('gx-ex7-fb-mcp','bad','<p>Il faut exactement <b>Agenda + Réservation de salle + E-mail</b>. Le reste n\'est pas nécessaire — le principe MCP : connecter le strict utile.</p>');
    }
    function maybeComplete(){ if(seqDone&&mcpDone) complete('rag','🏅 Orchestrateur RAG & MCP'); }
    return { init, checkSeq, checkMcp, reset:()=>{Object.keys(mcpSel).forEach(k=>delete mcpSel[k]);seqDone=false;mcpDone=false;init();} };
  })();

  /* ===================================================================
     EX8 — Consulting case
     =================================================================== */
  const ex8 = (function(){
    const QUESTIONS = [
      {
        id:'q1', label:'Question 1 / 3 — Architecture',
        text:'Quelle architecture proposez-vous en priorité pour unifier les données clients des 5 outils ?',
        opts:[
          {text:'<b>Construire un Data Lake</b> brut et laisser les conseillers requêter eux-mêmes.',correct:false,
           fb:'&#10060; Un Data Lake est un stockage brut, non activable en temps réel par des conseillers non-tech. Trop lourd pour une équipe junior et inadapté au besoin.'},
          {text:'<b>Déployer une CDP</b> pour unifier les profils clients, alimentée par les 5 sources.',correct:true,
           fb:'&#9989; La CDP est exactement faite pour ça : réconcilier les données clients first-party en profils unifiés et activables en temps réel par des équipes métier.'},
          {text:'<b>Entraîner un LLM maison</b> sur les données clients pour répondre aux conseillers.',correct:false,
           fb:'&#10060; Sur-ingénierie totale. Entraîner un LLM est coûteux, risqué (RGPD) et hors budget. Le problème est d&apos;unifier la donnée, pas de générer du texte.'}
        ]
      },
      {
        id:'q2', label:'Question 2 / 3 — Risques & Gouvernance',
        text:'Le client valide la CDP. Quel est le risque principal à cadrer en priorité avant le déploiement ?',
        opts:[
          {text:'Le choix du fournisseur CDP (Segment, mParticle, etc.)',correct:false,
           fb:'&#10060; Le choix de l&apos;outil est secondaire. On cadre d&apos;abord les risques structurels avant de comparer les vendeurs.'},
          {text:'La qualité des données sources et la gouvernance du consentement RGPD.',correct:true,
           fb:'&#9989; &ldquo;Garbage In, Garbage Out&rdquo; — si les 5 sources alimentent la CDP avec des doublons ou des données non conformes, la vue 360° sera fausse dès le départ. Le consentement est un prérequis légal.'},
          {text:'La formation des conseillers à l&apos;utilisation de la CDP.',correct:false,
           fb:'&#10060; L&apos;adoption est un risque réel, mais secondaire. Sans données propres et conformes, la formation ne sert à rien.'}
        ]
      },
      {
        id:'q3', label:'Question 3 / 3 — Posture consultant',
        text:'Le client vous demande d&apos;ajouter une IA générative pour interroger les profils clients en langage naturel. Quelle est votre réponse ?',
        opts:[
          {text:'Recommander immédiatement un LLM branché sur la CDP.',correct:false,
           fb:'&#10060; Trop rapide. Avant d&apos;introduire l&apos;IA générative, il faut s&apos;assurer que les fondations (qualité données, gouvernance) sont solides. &ldquo;IA on top of bad data&rdquo; = hallucinations et erreurs.'},
          {text:'Refuser — l&apos;IA générative est trop risquée sur des données clients sensibles.',correct:false,
           fb:'&#10060; Trop conservateur. L&apos;IA générative est viable sur ce cas avec un bon cadrage RAG + RGPD. La question n&apos;est pas &ldquo;si&rdquo; mais &ldquo;comment&rdquo; et &ldquo;quand&rdquo;.'},
          {text:'Valider la direction, mais conditionner au bon fonctionnement de la CDP et à un cadrage RAG + RGPD d&apos;abord.',correct:true,
           fb:'&#9989; Posture tech-aware : vous avez une vision de la trajectoire (CDP &rarr; RAG/LLM) et vous séquencez correctement. Les fondations data avant la couche IA. C&apos;est exactement ce que le client doit entendre.'}
        ]
      }
    ];
    let currentQ=0, score=0;
    function init(){
      currentQ=0; score=0;
      const f=document.getElementById('gx-ex8-fb'); f.className='gx-fb';
      document.getElementById('gx-ex8-score').textContent='0 / 3';
      renderQuestion();
    }
    function renderQuestion(){
      const wrap=document.getElementById('gx-ex8-case');
      if(currentQ>=QUESTIONS.length){ showSummary(wrap); return; }
      const q=QUESTIONS[currentQ];
      const letters=['A','B','C'];
      const shuffled=shuffle(q.opts.map(o=>({...o})));
      wrap.innerHTML=
        '<div style="font-size:10px;font-weight:700;color:var(--teal);letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">'+q.label+'</div>'+
        '<p style="font-family:var(--font-head);font-size:15px;font-weight:700;color:var(--navy);margin-bottom:18px;line-height:1.45;">'+q.text+'</p>'+
        '<div class="gx-opts" id="gx-ex8-opts-inner">'+
          shuffled.map((o,i)=>
            '<div class="gx-opt8" style="display:flex;align-items:flex-start;gap:14px;padding:14px 18px;background:var(--gray-lt);border:1.5px solid var(--gray-bdr);border-radius:10px;cursor:pointer;transition:all .2s;font-size:14px;color:var(--text);margin-bottom:10px;" data-correct="'+o.correct+'" data-fb="'+encodeURIComponent(o.fb)+'"><div style="width:30px;height:30px;border-radius:50%;background:#fff;border:1.5px solid var(--gray-bdr);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--navy);flex-shrink:0;">'+letters[i]+'</div><div>'+o.text+'</div></div>'
          ).join('')+
        '</div>'+
        '<div id="gx-ex8-qfb" style="margin-top:4px;"></div>';
      wrap.querySelectorAll('.gx-opt8').forEach(opt=>{
        opt.onmouseenter=()=>{ if(!opt.classList.contains('gx-locked')){ opt.style.borderColor='var(--teal)'; opt.style.background='var(--teal-lt)'; } };
        opt.onmouseleave=()=>{ if(!opt.classList.contains('gx-locked') && !opt.classList.contains('sel')){ opt.style.borderColor=''; opt.style.background=''; } };
        opt.onclick=()=>chooseOpt(opt);
      });
    }
    function chooseOpt(opt){
      if(opt.classList.contains('gx-locked')) return;
      const correct=opt.dataset.correct==='true';
      const expHTML=decodeURIComponent(opt.dataset.fb);
      if(correct) score++;
      document.querySelectorAll('#gx-ex8-opts-inner .gx-opt8').forEach(o=>{
        o.classList.add('gx-locked');
        o.style.cursor='default';
        if(o.dataset.correct==='true'){ o.style.borderColor='var(--green)'; o.style.background='var(--green-lt)'; }
        else if(o===opt){ o.style.borderColor='var(--red)'; o.style.background='var(--red-lt)'; }
        else { o.style.opacity='.5'; o.style.background=''; o.style.borderColor=''; }
      });
      document.getElementById('gx-ex8-score').textContent=score+' / 3';
      const qfb=document.getElementById('gx-ex8-qfb');
      qfb.innerHTML='<div style="padding:12px 16px;background:'+(correct?'var(--green-lt)':'var(--red-lt)')+';border-left:3px solid '+(correct?'var(--green)':'var(--red)')+';border-radius:0 8px 8px 0;font-size:13px;color:var(--gray-dk);line-height:1.6;margin-bottom:14px;">'+expHTML+'</div>'+
        '<button class="gx-btn" onclick="GX.ex8.next()" style="margin-top:4px;">'+(currentQ<QUESTIONS.length-1?'Question suivante &rarr;':'Voir mon bilan &rarr;')+'</button>';
    }
    function next(){ currentQ++; renderQuestion(); }
    function showSummary(wrap){
      const medal=score===3?'🏆':score===2?'🎯':'📚';
      const msg=score===3
        ?'Parfait 3/3. Vous posez les bons diagnostics et séquencez les décisions tech comme un consultant expérimenté.'
        :score===2
        ?'Bon niveau. Deux bons réflexes sur trois — relisez l&apos;explication de la question manquée.'
        :'À retravailler. Relisez les modules Stockage et IA avant de retenter ce cas.';
      wrap.innerHTML='<div style="text-align:center;padding:32px;background:#fff;border-radius:14px;border:1.5px solid var(--gray-bdr);">'+
        '<div style="font-size:48px;margin-bottom:12px;">'+medal+'</div>'+
        '<div style="font-family:var(--font-head);font-size:36px;font-weight:900;color:var(--navy);margin-bottom:8px;">'+score+' / 3</div>'+
        '<p style="font-size:14px;color:var(--gray);max-width:420px;margin:0 auto 20px;">'+msg+'</p>'+
        '<button class="gx-btn gx-btn-ghost" onclick="GX.ex8.reset()">Recommencer le cas</button>'+
      '</div>';
      if(score>=2){
        fb('gx-ex8-fb','good','<p><b>Recommandation consultant :</b> CDP pour unifier les données → sécuriser RGPD et qualité → puis RAG/LLM en deuxième phase. C&apos;est le bon séquençage tech-aware.</p><p><b>Risques à surveiller :</b> qualité des données sources (Garbage In/Out), gouvernance du consentement, et adoption par les conseillers.</p>');
        complete('business','&#x1F3C6; Consultant Tech-Aware');
      } else {
        fb('gx-ex8-fb','bad','<p>Score '+score+'/3 — insuffisant pour débloquer le badge. Relisez les modules Stockage, ETL et IA, puis revenez tenter ce cas.</p>');
      }
    }
    return { init, check:function(){}, reset:init, next };
  })();

  /* ---------- Boot ---------- */
  function init(){
    renderHud();
    ex1.init(); ex2.init(); ex3.init(); ex4.init();
    ex5.init(); ex6.init(); ex7.init(); ex8.init();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();

  return { ex1, ex2, ex3, ex4, ex5, ex6, ex7, ex8 };
})();
