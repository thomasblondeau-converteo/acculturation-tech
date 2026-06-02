/* =============================================================================
   LOGIQUE DU QUIZ FINAL  (rendu, scoring, complétion SCORM)
   Dépend de QUIZ (content/quiz-data.js) et de window.ConverteoSCORM (scorm/).
   ============================================================================= */
let curQ=0,score=0,answered=false;

function renderQ(idx){
  answered=false;
  const q=QUIZ[idx];
  document.getElementById('q-cur').textContent=idx+1;
  document.getElementById('q-fill').style.width=((idx+1)/QUIZ.length*100)+'%';
  const btn=document.getElementById('next-btn');
  btn.disabled=true;
  btn.textContent=idx<QUIZ.length-1?'Question suivante →':'Voir mon score →';
  document.getElementById('quiz-q').innerHTML=`
    <div class="quiz-card">
      <div class="quiz-q-label">Question ${idx+1}</div>
      <div class="quiz-q-text">${q.q}</div>
      <div class="quiz-options" id="opts">
        ${q.opts.map((o,i)=>`
          <div class="quiz-opt" id="opt-${i}" onclick="pick(${idx},${i})">
            <div class="quiz-opt-letter" id="dot-${i}">${String.fromCharCode(65+i)}</div>
            <span>${o}</span>
          </div>`).join('')}
      </div>
      <div class="quiz-explanation" id="expl">
        <div class="ql">Explication</div>
        <p>${q.exp}</p>
      </div>
    </div>`;
}

function pick(qIdx,ansIdx){
  if(answered)return;
  answered=true;
  const q=QUIZ[qIdx];
  const correct=ansIdx===q.ok;
  if(correct)score++;
  document.getElementById('q-live').textContent=score+' pts';
  q.opts.forEach((_,i)=>{
    const opt=document.getElementById('opt-'+i);
    const dot=document.getElementById('dot-'+i);
    opt.classList.add('disabled');
    if(i===q.ok){opt.classList.add('correct');dot.textContent='✓';}
    else if(i===ansIdx&&!correct){opt.classList.add('wrong');dot.textContent='✗';}
  });
  document.getElementById('expl').style.display='block';
  document.getElementById('next-btn').disabled=false;

  /* --- SCORM: light progress signal as the learner advances the quiz --- */
  try {
    if (window.ConverteoSCORM) {
      window.ConverteoSCORM.setProgress(Math.round((qIdx+1)/QUIZ.length*100));
    }
  } catch (e) {}
}

function nextQ(){
  if(!answered)return;
  curQ++;
  if(curQ>=QUIZ.length){showScore();return;}
  renderQ(curQ);
}

function showScore(){
  document.getElementById('quiz-q').style.display='none';
  document.getElementById('quiz-nav').style.display='none';
  document.getElementById('quiz-prog').style.display='none';
  const card=document.getElementById('score-card');
  card.style.display='block';
  const pct=Math.round(score/QUIZ.length*100);
  document.getElementById('score-num').textContent=score+' / '+QUIZ.length;
  let emoji,label;
  if(pct>=90){emoji='🏆';label='Excellent ! Vous êtes pleinement tech-aware. Certification Niveau 1 validée.';}
  else if(pct>=70){emoji='✅';label='Très bien ! Vous maîtrisez les fondamentaux. Relisez les sections manquées.';}
  else if(pct>=50){emoji='📚';label='En bonne voie ! Reprenez les modules correspondant à vos erreurs.';}
  else{emoji='🔄';label='Reprenez le parcours depuis le début — les fondations sont essentielles !';}
  document.getElementById('score-emoji').textContent=emoji;
  document.getElementById('score-label').textContent=label;

  /* --- SCORM: real final-quiz completion hook ---------------------------
     showScore() is the genuine end-of-quiz function (called by nextQ() once
     every question is answered). On a PASS we finalize immediately:
     score -> passed -> completed -> commit -> finish, so the LMS validates the
     activity WITHOUT waiting for the learner to close the window.
     On a fail we record the score/attempt but keep the session open for a retry.
     The beforeunload/pagehide finish() remains as an idempotent fallback. */
  try {
    if (window.ConverteoSCORM) {
      window.ConverteoSCORM.setProgress(100);
      if (pct >= window.ConverteoSCORM.PASS_THRESHOLD) {
        console.log('[SCORM] final quiz passed — score ' + pct + '%');
        window.ConverteoSCORM.finalizeQuiz(pct);   // passed + completed + commit + finish NOW
      } else {
        console.log('[SCORM] final quiz not passed — score ' + pct + '% (session kept open for retry)');
        window.ConverteoSCORM.setScore(pct);       // record the attempt; no finish
      }
      window.ConverteoSCORM.debug();
    }
  } catch (e) { console.warn('[SCORM] completion hook error:', e); }
}

function resetQuiz(){
  curQ=0;score=0;answered=false;
  document.getElementById('score-card').style.display='none';
  document.getElementById('quiz-q').style.display='block';
  document.getElementById('quiz-nav').style.display='flex';
  document.getElementById('quiz-prog').style.display='flex';
  document.getElementById('q-live').textContent='0 pts';
  renderQ(0);
}

function selectTab(type){
  document.querySelectorAll('.dt-tab').forEach((t,i)=>{
    t.classList.toggle('active',['structured','semi','unstructured'][i]===type);
  });
  document.querySelectorAll('.dt-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('tab-'+type).classList.add('active');
}

function selectStorage(type){
  ['lake','dw','cdp'].forEach(t=>document.getElementById('sc-'+t).classList.toggle('selected',t===type));
}
