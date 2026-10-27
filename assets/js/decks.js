/* 강의안 PDF 보기 모달 + 증서 샘플 확대 (decks.js) */
(function(){
  var m=document.createElement('div');m.className='dkm';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');
  m.innerHTML='<div class="dkm-box"><div class="dkm-bar"><b id="dkT"></b><a id="dkO" target="_blank" rel="noopener">새 탭</a><button type="button" id="dkX" aria-label="닫기">닫기 ✕</button></div><div id="dkB" style="flex:1;display:flex;min-height:0"></div></div>';
  document.body.appendChild(m);
  var box=m.firstChild,body=m.querySelector('#dkB'),T=m.querySelector('#dkT'),O=m.querySelector('#dkO'),last=null;
  function close(){m.classList.remove('on');body.innerHTML='';document.body.style.overflow='';if(last)last.focus()}
  function open(kind,src,title){
    last=document.activeElement;T.textContent=title||'';O.href=src;
    if(kind==='pdf'){
      var ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
      if(window.innerWidth<700||ios){window.open(src,'_blank','noopener');return}
      box.classList.remove('imgbox');body.innerHTML='<iframe title="'+(title||'강의안')+'" src="'+src+'#view=FitH"></iframe>';
    }else{
      box.classList.add('imgbox');body.innerHTML='<img class="dkm-img" alt="'+(title||'')+'" src="'+src+'">';
    }
    m.classList.add('on');document.body.style.overflow='hidden';m.querySelector('#dkX').focus();
  }
  document.addEventListener('click',function(e){
    var p=e.target.closest('[data-pdf]');if(p){e.preventDefault();open('pdf',p.getAttribute('data-pdf'),p.getAttribute('data-title'));return}
    var g=e.target.closest('[data-img]');if(g){e.preventDefault();open('img',g.getAttribute('data-img'),g.getAttribute('data-title'));return}
    if(e.target===m||e.target.id==='dkX')close();
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&m.classList.contains('on'))close()});
})();
