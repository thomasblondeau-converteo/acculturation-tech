/* =============================================================================
   COMPORTEMENT GLOBAL DE LA PAGE
   Animations reveal, observers de sections, barre de progression de lecture,
   et boot du quiz au chargement.
   ============================================================================= */
const revObs=new IntersectionObserver(entries=>{
  entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible');});
},{threshold:0.08,rootMargin:'0px 0px -40px 0px'});
document.querySelectorAll('.reveal').forEach(el=>revObs.observe(el));

const navLinks=document.querySelectorAll('.nav-link:not(.cta)');
const secObs=new IntersectionObserver(entries=>{
  entries.forEach(e=>{
    if(e.isIntersecting)navLinks.forEach(l=>l.classList.toggle('active',l.getAttribute('href')==='#'+e.target.id));
  });
},{threshold:0.3});
document.querySelectorAll('section[id]').forEach(s=>secObs.observe(s));

window.addEventListener('scroll',()=>{
  const pct=Math.round(window.scrollY/(document.documentElement.scrollHeight-window.innerHeight)*100);
  document.getElementById('progress-bar').style.width=pct+'%';
  document.getElementById('reading-pct').textContent=pct+'%';
});

document.addEventListener('DOMContentLoaded',()=>renderQ(0));

/* =============================================================================
   ARCHITECTURES (schémas SVG, style infographie)
   - RAG & MCP : bouton « Voir l'architecture » sous l'exercice du Module 07.
   - Agent IA  : bouton « Voir l'architecture » sous l'exercice du Module 06.
   Schémas dessinés à la main en SVG (aucune dépendance), révélés au clic.
   ============================================================================= */
(function(){
  const CODE='&lt;/&gt;'; // icône "code" échappée pour le SVG

  const STYLE='<style>'+
    '.bx{fill:#fff;stroke:#E5E7EB;stroke-width:1.5}'+
    '.bxg{fill:#d8f0e2;stroke:#7cc9a3}.bxp{fill:#fbe7ec;stroke:#e6a7b6}'+
    '.bxb{fill:#e6f1f8;stroke:#9cc4dd}.bxv{fill:#ece9fb;stroke:#b5add9}'+
    '.t{font:700 12.5px Inter,system-ui,sans-serif;fill:#1E1C52}'+
    '.s{font:500 10px "DM Mono",monospace;fill:#6B7280}'+
    '.gt{font:800 9.5px Inter,system-ui,sans-serif;fill:#fff;letter-spacing:.5px}'+
    '.lbl{font:600 10.5px Inter,system-ui,sans-serif;fill:#374151}'+
    '.num{font:800 11px Inter,system-ui,sans-serif;fill:#fff}'+
    '.plt{font:800 19px "Space Grotesk",Inter,sans-serif;fill:#fff}'+
    '.plc{font:500 10.5px Inter,system-ui,sans-serif;fill:rgba(255,255,255,.92)}'+
    '.edge{fill:none;stroke-width:2;stroke-dasharray:6 7;animation:aflow .9s linear infinite}'+
    '.edge.d{stroke-dasharray:6 7}'+
    '@keyframes aflow{to{stroke-dashoffset:-26}}'+
    '@media(prefers-reduced-motion:reduce){.edge{animation:none}}'+
    '</style>';
  const AC={g:'#2e9e6b',b:'#3f8fbf',p:'#6f63c9',n:'#5b5f86'};
  const AM={g:'arrG',b:'arrB',p:'arrP',n:'arrN'};
  const DEFS='<defs>'+Object.keys(AM).map(function(k){
    return '<marker id="'+AM[k]+'" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="'+AC[k]+'"/></marker>';
  }).join('')+'</defs>';

  function txt(cx,y,str,cls){
    return String(str).split('\n').map(function(p,i){
      return '<text class="'+(cls||'t')+'" x="'+cx+'" y="'+(y+i*13)+'" text-anchor="middle">'+p+'</text>';
    }).join('');
  }
  function box(x,y,w,h,icon,label,cls){
    cls=cls||'bx'; const cx=x+w/2; let ly;
    let s='<rect class="'+cls+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="11"/>';
    // Center the icon + name as a stacked pair within the box (relative to height),
    // so the label never drops onto the bottom edge of short boxes.
    if(icon){ s+='<text x="'+cx+'" y="'+(y+h/2-4)+'" text-anchor="middle" font-size="20">'+icon+'</text>'; ly=y+h/2+13; }
    else ly=y+h/2+4;
    return s+txt(cx,ly,label,'t');
  }
  function grp(x,y,w,h,title,col){
    col=col||'#9095B5'; const tw=Math.round(title.length*6+18);
    return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="14" fill="rgba(45,43,107,.02)" stroke="'+col+'" stroke-width="1.4" stroke-dasharray="5 4"/>'+
      '<rect x="'+(x+12)+'" y="'+(y-10)+'" width="'+tw+'" height="20" rx="10" fill="'+col+'"/>'+
      '<text class="gt" x="'+(x+12+tw/2)+'" y="'+(y+4)+'" text-anchor="middle">'+title+'</text>';
  }
  function arrow(x1,y1,x2,y2,c,dash){ c=c||'n'; return '<line class="edge'+(dash?' d':'')+'" x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+AC[c]+'" marker-end="url(#'+AM[c]+')"/>'; }
  function path(d,c,dash){ c=c||'n'; return '<path class="edge'+(dash?' d':'')+'" d="'+d+'" stroke="'+AC[c]+'" marker-end="url(#'+AM[c]+')"/>'; }
  function pill(x,y,text,col){ if(!text)return''; const w=Math.round(text.length*5.9+16); return '<rect x="'+(x-w/2)+'" y="'+(y-10)+'" width="'+w+'" height="19" rx="9" fill="#fff" stroke="'+(col||'#E5E7EB')+'"/><text class="lbl" x="'+x+'" y="'+(y+3.5)+'" text-anchor="middle">'+text+'</text>'; }
  function num(x,y,n,c){ return '<circle cx="'+x+'" cy="'+y+'" r="10" fill="'+AC[c||'b']+'"/><text class="num" x="'+x+'" y="'+(y+4)+'" text-anchor="middle">'+n+'</text>'; }
  function panel(h,color,icon,title,cap){
    let s='<rect x="0" y="0" width="150" height="'+h+'" rx="14" fill="'+color+'"/>';
    const ty=h*0.5-46;
    s+='<text x="75" y="'+ty+'" text-anchor="middle" font-size="34">'+icon+'</text>';
    s+='<text class="plt" x="75" y="'+(ty+38)+'" text-anchor="middle">'+title+'</text>';
    cap.forEach(function(l,i){ s+='<text class="plc" x="75" y="'+(ty+62+i*15)+'" text-anchor="middle">'+l+'</text>'; });
    return s;
  }
  function svg(w,h,inner){ return '<svg viewBox="0 0 '+w+' '+h+'" role="img">'+DEFS+STYLE+inner+'</svg>'; }

  /* -------------------------------- MCP -------------------------------- */
  function archMCP(){
    let g=panel(400,'#2e9e6b','🧩','MCP',['Une façon standard','pour les LLMs','d’utiliser des outils']);
    g+=grp(190,52,150,308,'MCP HOST','#2e9e6b');
    g+=box(205,76,120,60,'✴️','Claude\nDesktop');
    g+=box(205,158,120,60,'💻','IDE');
    g+=box(205,240,120,60,'🧩','AI Tools');
    g+=box(372,86,90,40,'','MCP Client','bxp');
    g+=box(372,168,90,40,'','MCP Client','bxp');
    g+=box(372,250,90,40,'','MCP Client','bxp');
    g+=arrow(325,106,372,106,'n')+arrow(325,188,372,188,'n')+arrow(325,270,372,270,'n');
    g+=arrow(462,106,612,112,'g',true)+pill(537,94,'Protocole MCP','#7cc9a3');
    g+=arrow(462,188,612,194,'g',true)+pill(537,178,'Protocole MCP','#7cc9a3');
    g+=arrow(462,270,612,278,'g',true)+pill(537,262,'Protocole MCP','#7cc9a3');
    g+=box(615,82,124,58,'🗄️','MCP Server A','bxg');
    g+=box(615,166,124,58,'🗄️','MCP Server B','bxg');
    g+=box(615,250,124,58,'🗄️','MCP Server C','bxg');
    g+=grp(848,64,196,80,'WEB APIs','#2e9e6b');
    g+=box(858,84,86,52,'🐙','Github');
    g+=box(950,84,84,52,'💬','Slack');
    g+=box(858,166,150,56,'🐘','Base de données');
    g+=box(858,250,150,56,'🗂️','Fichiers');
    g+=arrow(739,110,858,108,'g',true)+pill(800,92,'Invoque les Web APIs','#7cc9a3');
    g+=arrow(739,194,858,194,'g',true)+pill(800,178,'Exécute des requêtes','#7cc9a3');
    g+=arrow(739,278,858,278,'g',true)+pill(800,300,'Lit / écrit des fichiers','#7cc9a3');
    g+=pill(537,344,'Accès standardisé aux outils &amp; ressources pour les LLMs','#7cc9a3');
    return svg(1060,400,g);
  }

  /* -------------------------------- RAG -------------------------------- */
  function archRAG(){
    let g=panel(410,'#3f8fbf','🔎','RAG',['LLMs enrichis','par des','connaissances','récupérées']);
    g+=box(196,182,96,74,'👤','Utilisateur');
    g+=box(402,172,132,82,'🔎','Retriever','bxb');
    g+=grp(360,300,238,96,'BASE DE CONNAISSANCES','#3f8fbf');
    g+=box(372,320,62,62,'📄','PDF');
    g+=box(444,320,74,62,'🗄️','Vector DB');
    g+=box(528,320,58,62,CODE,'Code');
    g+=grp(842,112,202,196,'LLMs','#3f8fbf');
    g+=box(856,136,174,48,'🤖','GPT');
    g+=box(856,194,174,48,'✦','Gemini');
    g+=box(856,252,174,48,'🌀','Claude');
    g+=arrow(292,214,402,210,'b')+num(326,196,'1','b')+pill(372,196,'Requête utilisateur');
    g+=arrow(500,254,500,300,'b')+num(520,278,'2','b');
    g+=arrow(454,300,454,254,'b')+num(434,278,'3','b');
    g+=pill(566,270,'récupère / renvoie');
    g+=arrow(534,206,842,202,'b')+num(660,186,'4','b')+pill(712,186,'question + documents');
    g+=path('M 944 112 C 944 38 252 38 250 182','b',true)+num(520,36,'5','b')+pill(648,36,'le LLM génère la réponse');
    g+=pill(712,300,'Récupération au moment de la requête');
    return svg(1060,410,g);
  }

  /* ------------------------------ AI AGENT ----------------------------- */
  function archAGENT(){
    let g=panel(460,'#6f63c9','🤖','Agent IA',['Des LLMs qui','agissent et prennent','des décisions']);
    g+=box(470,232,140,86,'🤖','Agent IA','bxv');
    g+=box(206,92,150,62,'🧑','Contrôle humain');
    g+=box(206,300,150,62,'🔄','Action autonome');
    g+=arrow(281,154,281,300,'p')+pill(281,228,'Niveau d’autonomie','#b5add9');
    g+=arrow(470,300,360,332,'p',true);
    g+=box(452,64,170,58,'📋','Déléguer des tâches');
    g+=arrow(537,122,538,232,'p');
    g+=box(772,92,150,60,'🧠','Mémoire');
    g+=arrow(612,252,772,128,'p',true)+pill(696,178,'Accès','#b5add9');
    g+=grp(758,210,224,196,'OUTILS','#6f63c9');
    g+=box(772,234,196,44,'🔌','Appels API');
    g+=box(772,288,196,44,'🌐','Accès Internet');
    g+=box(772,342,196,44,CODE,'Exécuter du code');
    g+=arrow(610,286,758,300,'p',true)+pill(686,282,'Invocation d’outils','#b5add9');
    g+=box(612,386,150,58,'☁️','Environnement');
    g+=box(430,386,150,58,'⚙️','Réactivité');
    g+=arrow(612,415,582,415,'p',true)+pill(597,403,'Actions','#b5add9');
    g+=path('M 664 386 C 644 352 600 332 576 320','p',true)+pill(640,348,'Observations','#b5add9');
    g+=pill(300,448,'Raisonnement &amp; boucle d’action autonomes','#b5add9');
    return svg(1020,460,g);
  }

  /* ------------------------------ Boutons ------------------------------ */
  function mount(btnId,panelId,builder,onToggle){
    const btn=document.getElementById(btnId), pan=document.getElementById(panelId);
    if(!btn||!pan) return;
    let open=false;
    btn.addEventListener('click',function(){
      open=!open;
      pan.hidden=!open;
      btn.textContent = open ? '🗺 Masquer l’architecture' : '🗺 Voir l’architecture';
      if(open && !pan.dataset.built){ pan.innerHTML=builder(); pan.dataset.built='1'; }
      if(onToggle) onToggle(open);
    });
  }
  mount('arch-btn-rag','arch-rag',function(){
    return '<div class="arch-scroll">'+archRAG()+'</div>'+
           '<div class="arch-cap"><span><b>→</b> flux de données</span><span>① question → ⑤ réponse générée</span></div>';
  });
  mount('arch-btn-mcp','arch-mcp',function(){
    return '<div class="arch-scroll">'+archMCP()+'</div>'+
           '<div class="arch-cap"><span><b>→</b> protocole MCP</span><span>un client → plusieurs serveurs → outils réels</span></div>';
  });
  mount('arch-btn-agent','arch-agent',function(){
    return '<div class="arch-scroll">'+archAGENT()+'</div>'+
           '<div class="arch-cap"><span><b>→</b> perception → décision → action</span><span>boucle autonome agent ↔ environnement</span></div>';
  },function(open){
    // L'agent vit dans la colonne MCP (grille 2 colonnes) : on empile RAG/MCP
    // quand le schéma est ouvert pour lui donner toute la largeur, puis on rétablit.
    const grid=document.getElementById('ragmcp-grid');
    if(grid) grid.style.gridTemplateColumns = open ? '1fr' : '1fr 1fr';
  });
})();
