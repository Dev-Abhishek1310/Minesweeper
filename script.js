(() => {
  const AudioKit = () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = (freq=600, dur=0.05, type='square', gain=0.08) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type=type; o.frequency.value=freq; 
      g.gain.value=gain;
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime+dur);
    };

    const click = () => beep(750,0.03,'square',0.05);
    const flag = () => { 
      beep(620,0.045,'triangle',0.06); 
      setTimeout(()=>beep(420,0.05,'triangle',0.05),55); 
    };

    const noiseBurst = (dur=0.18,gain=0.18) => {
      const bufferSize = 2*ctx.sampleRate*dur;
      const buffer = ctx.createBuffer(1,bufferSize,ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for(let i=0;i<buffer.length;i++) data[i] = (Math.random()*2-1)*(1 - i/buffer.length);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain(); 
      g.gain.value = gain;
      const bp = ctx.createBiquadFilter(); 
      bp.type='bandpass'; 
      bp.frequency.value=2000; 
      bp.Q.value=0.8;
      src.connect(bp).connect(g).connect(ctx.destination);
      src.start();
    };
    
    const explode = () => { 
      noiseBurst(0.22,0.22); setTimeout(()=>beep(200,0.12,'sawtooth',0.08),30); 
    };
    const win = () => { 
      [660,880,990,1320].forEach((f,i)=>setTimeout(()=>beep(f,0.08,'triangle',0.06), i*120)); 
    };
    return { click, flag, explode, win };
  };

  const LEVELS = { 
    E:{rows:9,cols:9,mines:10}, 
    M:{rows:16,cols:16,mines:40}, 
    H:{rows:16,cols:30,mines:99} 
  };
  
  let state = { 
    rows:9,
    cols:9,
    mines:10,
    board:[],
    mineSet:new Set(),
    openCount:0,
    flags:0,
    started:false,
    gameOver:false,
    timerId:null,
    time:0,
    firstClickCell:null 
  };
  
  const els = { 
    board:document.getElementById('board'), 
    timer:document.getElementById('timer'), 
    minesLeft:document.getElementById('minesLeft'), 
    level:document.getElementById('level'), 
    newGame:document.getElementById('newGame'), 
    banner:document.getElementById('banner') 
  };

  const audio = AudioKit();
  const fmtTime = t => String(Math.min(999,t)).padStart(3,'0');
  const clamp999 = t => t>=999?999:t;
  const showBanner = msg => { 
    els.banner.textContent = msg; 
    els.banner.classList.add('show'); 
    setTimeout(()=>els.banner.classList.remove('show'),1800); 
  };

  const inBounds = (r,c) => r>=0 && r<state.rows && c>=0 && c<state.cols;
  const key = (r,c) => r+','+c;
  const neighbors = (r,c) => { 
    const arr=[]; 
    for(let dr=-1;dr<=1;dr++){ 
      for(let dc=-1;dc<=1;dc++){ 
        if(dr||dc){ 
          const nr=r+dr,nc=c+dc; 
          if(inBounds(nr,nc)) 
            arr.push([nr,nc]); 
          } 
        } 
      } 
      return arr; 
    };

  function startTimer(){ 
    if(state.timerId) 
      return;
    state.timerId = setInterval(()=>{ 
      state.time = clamp999(state.time + 1); 
      els.timer.textContent = fmtTime(state.time); 
      if(state.time >= 999){ 
        gameOver(false, '⏱️ Time limit reached (999). Game over.'); 
        } 
      },
      1000); 
    }

  function stopTimer(){ 
    if(state.timerId){ 
      clearInterval(state.timerId); state.timerId = null; 
      } 
    }

  function reset(levelKey){
    const lv = LEVELS[levelKey] || LEVELS.E;
    state.rows = lv.rows; state.cols = lv.cols; 
    state.mines = lv.mines;
    state.mineSet = new Set(); 
    state.board = []; 
    state.flags = 0; 
    state.openCount = 0;
    state.started = false; 
    state.gameOver = false; 
    state.time = 0; 
    state.firstClickCell = null;
    stopTimer(); 
    els.timer.textContent = fmtTime(0); 
    els.minesLeft.textContent = state.mines - state.flags;
    els.board.style.gridTemplateColumns = `repeat(${state.cols}, var(--cell-size))`;
    els.board.style.gridTemplateRows = `repeat(${state.rows}, var(--cell-size))`;
    els.board.innerHTML = '';
    for(let r=0;r<state.rows;r++){ 
      state.board[r] = []; 
      for(let c=0;c<state.cols;c++){ 
        const div = document.createElement('div'); 
        div.className = 'cell'; 
        div.setAttribute('role','gridcell'); 
        div.dataset.r = r; 
        div.dataset.c = c; 
        div.tabIndex = 0; 
        div.addEventListener('click', onLeftClick); 
        div.addEventListener('contextmenu', onRightClick); 
        div.addEventListener('auxclick', e=>{ if(e.button===1) onRightClick(e); }); 
        state.board[r][c] = { r, c, el: div, open:false, mine:false, flag:false, n:0 }; 
        els.board.appendChild(div); 
      } 
    }
  }

  function plantMines(safeR,safeC){
    const forbidden = new Set([key(safeR,safeC), ...neighbors(safeR,safeC).map(([r,c])=>key(r,c))]);
    while(state.mineSet.size < state.mines) { 
      const r = Math.floor(Math.random()*state.rows); 
      const c = Math.floor(Math.random()*state.cols); 
      const k = key(r,c); 
      if(!state.mineSet.has(k) && !forbidden.has(k)) 
        state.mineSet.add(k); 
    }

    for(const k of state.mineSet) { 
      const [r,c] = k.split(',').map(Number); 
      state.board[r][c].mine = true; 
    }

    for(let r=0;r<state.rows;r++) { 
      for(let c=0;c<state.cols;c++){ 
        if(state.board[r][c].mine) 
          continue; const n = neighbors(r,c).reduce((acc,[nr,nc])=> acc + (state.board[nr][nc].mine ? 1:0), 0); 
        state.board[r][c].n = n; } 
    }
  }

  function reveal(r,c) { 
    const cell = state.board[r][c]; 
    
    if(cell.open || cell.flag || state.gameOver) 
      return;
    cell.open = true; 
    cell.el.classList.add('open');
    state.openCount++;
    if(cell.mine) { 
      cell.el.classList.add('mine','revealed','boom'); 
      cell.el.textContent = ''; 
      audio.explode(); 
      gameOver(false, '💥 Boom! You hit a mine.'); 
      return; 
    }
    
    if(cell.n > 0) { 
      cell.el.textContent = cell.n; 
      cell.el.classList.add('n'+cell.n); 
      audio.click(); 
    }
    
    else { 
      cell.el.textContent = ''; 
      audio.click(); 
      neighbors(r,c).forEach(([nr,nc])=>{ 
        if(!state.board[nr][nc].open) 
          reveal(nr,nc); 
      }); 
    }
    checkWin();
  }

  function toggleFlag(r,c) { 
    const cell = state.board[r][c]; 
    if(cell.open || state.gameOver) 
      return; 
    cell.flag = !cell.flag; cell.el.classList.toggle('flag', cell.flag); 
    state.flags += cell.flag ? 1 : -1; 
    els.minesLeft.textContent = Math.max(0, state.mines - state.flags); audio.flag(); 
  }

  function revealAllMines(triggerR, triggerC) { 
    let delay = 0; for (let r=0;r<state.rows;r++){ 
      for (let c=0;c<state.cols;c++){ 
        const cell = state.board[r][c]; if(cell.mine){ setTimeout(()=>{ cell.el.classList.add('mine','revealed'); 
          if(r===triggerR && c===triggerC) cell.el.classList.add('boom'); }, delay); delay += 12; } 
      } 
    } 
  }

  function checkWin() { 
    const totalCells = state.rows * state.cols; 
    const safeCells = totalCells - state.mines; 
    if(state.openCount >= safeCells && !state.gameOver) { 
      gameOver(true, '🎉 You cleared the field!'); 
    } 
  }

  function gameOver(win,msg) { 
    if(state.gameOver) 
      return; 
    state.gameOver = true; 
    stopTimer(); 
    showBanner(msg); 
    if(!win){ 
      if(state.firstClickCell && state.board[state.firstClickCell[0]][state.firstClickCell[1]].mine) { 
        revealAllMines(state.firstClickCell[0], state.firstClickCell[1]); 
      } 
      else { 
        revealAllMines(-1,-1); 
      } 
    } 
    else { 
      audio.win(); 
    } 
  }

  function onLeftClick(e) { 
    e.preventDefault(); 
    const r = +this.dataset.r, c = +this.dataset.c; 
    if(state.gameOver) 
      return; 
    if(!state.started){ state.started = true; 
      state.firstClickCell = [r,c]; 
      plantMines(r,c); 
      startTimer(); } reveal(r,c); 
  }

  function onRightClick(e) { e.preventDefault(); 
    const r = +this.dataset.r, c = +this.dataset.c; 
    if(!state.started) 
      return; toggleFlag(r,c); 
  }
  
  document.addEventListener('keydown', (e)=>{ 
    if(!document.activeElement.classList.contains('cell')) 
      return; 
    const r = +document.activeElement.dataset.r, 
    c = +document.activeElement.dataset.c; 
    if(e.key === 'Enter' || e.key === ' ') { 
      onLeftClick.call(document.activeElement, new Event('click')); } 
      if(e.key.toLowerCase() === 'f') { 
        onRightClick.call(document.activeElement, new Event('contextmenu')); 
      } 
    });

  els.level.addEventListener('change', ()=> reset(els.level.value));
  els.newGame.addEventListener('click', ()=> reset(els.level.value));
  reset('E');
})();
