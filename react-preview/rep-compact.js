(() => {
  const titleOf = card => card?.querySelector(':scope > .card-head h3')?.textContent.trim() || '';
  const findCard = (root, title) => [...root.querySelectorAll('.card')].find(card => titleOf(card) === title);
  const cleanup = node => { let p=node?.parentElement; while(p && (p.classList.contains('grid')||p.classList.contains('three')) && !p.children.length){const next=p.parentElement;p.remove();p=next;} };

  function buildDeals(root){
    if(root.querySelector('.deals-workspace')) return;
    const titles=['Open Deals','Won MTD','Lost MTD','Cold Deals','Stuck Deals','No Future Task'];
    const cards=titles.map(t=>findCard(root,t)).filter(Boolean);
    if(!cards.length) return;
    const host=document.createElement('section');host.className='card deals-workspace compact-generated';
    host.innerHTML='<div class="card-head"><div><i>⇄</i><h3>Deals Workspace</h3></div><div class="workspace-tabs"></div></div><div class="workspace-body"></div>';
    cards[0].parentElement.insertBefore(host,cards[0]);
    const tabs=host.querySelector('.workspace-tabs'),body=host.querySelector('.workspace-body');
    cards.forEach((card,i)=>{
      const panel=document.createElement('div');panel.className='workspace-panel';panel.dataset.index=i;panel.hidden=i!==0;
      const oldParent=card.parentElement;panel.appendChild(card);body.appendChild(panel);cleanup(card);
      const btn=document.createElement('button');btn.textContent=titles[i];btn.className=i===0?'active':'';
      btn.onclick=()=>{[...body.children].forEach((p,n)=>p.hidden=n!==i);[...tabs.children].forEach((b,n)=>b.classList.toggle('active',n===i));};
      tabs.appendChild(btn);if(oldParent && !oldParent.children.length) oldParent.remove();
    });
  }

  function buildRanks(root){
    const outer=findCard(root,'Rank A/B Coverage');if(!outer||outer.dataset.compactRank) return;
    const cards=[...outer.querySelectorAll('.grid.ranks > .card')];if(cards.length<2) return;
    outer.dataset.compactRank='1';
    const toolbar=document.createElement('div');toolbar.className='rank-compact-tabs';
    cards.forEach((card,i)=>{card.hidden=i!==0;const btn=document.createElement('button');btn.textContent=i===0?'Rank A Untouched':'Rank B Untouched';btn.className=i===0?'active':'';btn.onclick=()=>{cards.forEach((c,n)=>c.hidden=n!==i);[...toolbar.children].forEach((b,n)=>b.classList.toggle('active',n===i));};toolbar.appendChild(btn);});
    outer.querySelector('.rank-grid')?.after(toolbar);
  }

  function compact(){
    const hero=document.querySelector('.rep-hero');if(!hero) return;
    const root=hero.closest('.stack');if(!root||root.dataset.compactRep) return;
    root.dataset.compactRep='1';root.classList.add('rep-compact-root');
    [...root.querySelectorAll('.card')].forEach(card=>{const t=titleOf(card);if(t.includes('Online & Offline')) card.classList.add('compact-leads');if(t.includes('Coaching')) card.classList.add('compact-coaching');});
    buildDeals(root);buildRanks(root);
  }
  new MutationObserver(compact).observe(document.documentElement,{childList:true,subtree:true});
  compact();setTimeout(compact,300);setTimeout(compact,1000);
})();
