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
