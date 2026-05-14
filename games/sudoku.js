/* ============================================================
   ナンプレ — game logic（Premium テーマ専用）
   - generation, unique-solution, long-press multi-select,
     undo, memo auto-prune, audio
   - hint, settings, best time + stats (localStorage),
     polished entry/error animations
   ============================================================ */

// ---------- STORAGE ----------
const STORAGE_KEY = 'sudoku_v2';
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveStore(patch) {
  const cur = loadStore();
  const next = { ...cur, ...patch };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  return next;
}
function getSettings() {
  const s = loadStore().settings || {};
  return { sound: s.sound !== false, animations: s.animations !== false };
}
function setSettings(patch) {
  const cur = getSettings();
  return saveStore({ settings: { ...cur, ...patch } });
}
function getBest() { return loadStore().best || {}; }
function setBest(diff, time) {
  const best = getBest();
  if (best[diff] == null || time < best[diff]) {
    best[diff] = time;
    saveStore({ best });
    return true;
  }
  return false;
}
function getStats() { return loadStore().stats || { easy:{clears:0,total:0}, normal:{clears:0,total:0}, hard:{clears:0,total:0} }; }
function bumpStats(diff, cleared) {
  const s = getStats();
  if (!s[diff]) s[diff] = {clears:0,total:0};
  s[diff].total += 1;
  if (cleared) s[diff].clears += 1;
  saveStore({ stats: s });
}

function fmtTime(sec) {
  if (sec == null) return '--:--';
  const m = Math.floor(sec/60), s = sec%60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

// ---------- SUDOKU GENERATION ----------
function generateSolution() {
  const board = Array.from({length:9}, ()=>Array(9).fill(0));
  fillBoard(board);
  return board;
}
function fillBoard(board) {
  for(let r=0;r<9;r++) for(let c=0;c<9;c++) {
    if(board[r][c]===0) {
      const nums = shuffle([1,2,3,4,5,6,7,8,9]);
      for(let n of nums) {
        if(isValid(board,r,c,n)) {
          board[r][c]=n;
          if(fillBoard(board)) return true;
          board[r][c]=0;
        }
      }
      return false;
    }
  }
  return true;
}
function isValid(board,r,c,n) {
  for(let i=0;i<9;i++) {
    if(board[r][i]===n) return false;
    if(board[i][c]===n) return false;
  }
  const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3;
  for(let i=0;i<3;i++) for(let j=0;j<3;j++) if(board[br+i][bc+j]===n) return false;
  return true;
}
function shuffle(arr) {
  for(let i=arr.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}
const DIFFICULTY_CONFIG = {
  easy:   { remove: 36, label: 'EASY',   ja: '易しい' },
  normal: { remove: 46, label: 'NORMAL', ja: '普通' },
  hard:   { remove: 54, label: 'HARD',   ja: '難しい' },
};
function createPuzzle(solution, difficulty) {
  const puzzle = solution.map(r=>[...r]);
  const cells = shuffle([...Array(81).keys()]);
  let removed = 0;
  const target = DIFFICULTY_CONFIG[difficulty].remove;
  for(let idx of cells) {
    if(removed >= target) break;
    const r=Math.floor(idx/9), c=idx%9;
    const backup = puzzle[r][c];
    puzzle[r][c] = 0;
    if(countSolutions(puzzle.map(x=>[...x])) === 1) removed++;
    else puzzle[r][c] = backup;
  }
  return puzzle;
}
function countSolutions(board, count={v:0}) {
  for(let r=0;r<9;r++) for(let c=0;c<9;c++) {
    if(board[r][c]===0) {
      for(let n=1;n<=9;n++) {
        if(isValid(board,r,c,n)) {
          board[r][c]=n;
          countSolutions(board, count);
          board[r][c]=0;
          if(count.v>1) return count.v;
        }
      }
      return count.v;
    }
  }
  count.v++;
  return count.v;
}

// ---------- STATE ----------
let solution = [], puzzle = [], userBoard = [], memoBoard = [], givenMask = [];
let selectedCell = null;
let isMemoMode = false;
let mistakes = 0;
const maxMistakes = 3;
let timerInterval = null;
let elapsedSeconds = 0;
let history = [];
let currentDiff = 'easy';
let isGameOver = false;
let hintsUsed = 0;
let lastEntered = null; // {r,c} for entry animation
let hintBusy = false;   // ヒント演出中フラグ（多重起動防止）
let gameGen = 0;        // ゲーム世代カウンタ（演出途中でリセットされた時の保護）

let isMultiSelectMode = false;
let multiSelectedCells = new Set();
let longPressTimer = null;
let longPressTriggered = false;
const LONG_PRESS_MS = 450;

const completedRows = new Set();
const completedCols = new Set();
const completedBoxes = new Set();

// ---------- NAV ----------
const $ = (id) => document.getElementById(id);

function showScreen(name) {
  ['difficulty-screen','game-screen','result-screen'].forEach(s => {
    const el = $(s);
    if (s === name) el.style.display = (s === 'difficulty-screen' || s === 'result-screen') ? 'flex' : 'flex';
    else el.style.display = 'none';
  });
  $('brand-block').style.display = (name === 'game-screen') ? 'none' : 'flex';
}

async function startGame(diff) {
  currentDiff = diff;
  $('loader').classList.add('show');
  await new Promise(r => setTimeout(r, 50));

  // generate in next tick to let loader paint
  await new Promise(r => setTimeout(r, 30));
  solution = generateSolution();
  puzzle = createPuzzle(solution, diff);

  userBoard = puzzle.map(r=>[...r]);
  memoBoard = Array.from({length:9}, ()=>Array.from({length:9}, ()=>new Set()));
  givenMask = puzzle.map(r=>r.map(v=>v!==0));

  selectedCell = null;
  isMemoMode = false;
  mistakes = 0;
  hintsUsed = 0;
  isGameOver = false;
  history = [];
  isMultiSelectMode = false;
  multiSelectedCells = new Set();
  completedRows.clear();
  completedCols.clear();
  completedBoxes.clear();
  lastEntered = null;
  hintBusy = false;
  gameGen++;
  document.querySelectorAll('.hint-writer').forEach(el => el.remove());

  bumpStats(diff, false);

  $('diff-badge').textContent = DIFFICULTY_CONFIG[diff].label;
  updateBestStrip();
  updateMistakeUI();
  $('memo-btn').classList.remove('active');

  elapsedSeconds = 0;
  clearInterval(timerInterval);
  updateTimerUI();
  timerInterval = setInterval(()=>{ elapsedSeconds++; updateTimerUI(); }, 1000);

  showScreen('game-screen');
  renderBoard();
  updateNumpad();

  // close loader
  $('loader').classList.remove('show');
}

function updateBestStrip() {
  const best = getBest()[currentDiff];
  $('best-time').textContent = best != null ? fmtTime(best) : '--:--';
  $('best-trail').textContent = best != null ? '★' : '—';
}

function updateTimerUI() {
  $('timer').textContent = fmtTime(elapsedSeconds);
  $('timer').classList.toggle('warning', elapsedSeconds >= 600);
}

function updateMistakeUI() {
  for(let i=1;i<=3;i++) {
    $(`md${i}`).classList.toggle('used', i<=mistakes);
  }
  $('mc-count').textContent = `${mistakes}/${maxMistakes}`;
}

// ---------- BOARD RENDER ----------
function renderBoard() {
  const board = $('board');
  board.innerHTML = '';
  for(let r=0;r<9;r++) {
    for(let c=0;c<9;c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      if(givenMask[r][c]) cell.classList.add('given');

      if(isMultiSelectMode && multiSelectedCells.has(`${r},${c}`)) {
        cell.classList.add('multi-selected');
      }

      if(selectedCell) {
        const {r:sr, c:sc} = selectedCell;
        const selVal = userBoard[sr][sc];
        const sameValCells = [];
        if(selVal) {
          for(let rr=0;rr<9;rr++) for(let cc=0;cc<9;cc++) {
            if(userBoard[rr][cc]===selVal && !(rr===sr&&cc===sc)) sameValCells.push({r:rr,c:cc});
          }
        }
        if(r===sr && c===sc) {
          cell.classList.add('selected');
        } else {
          const inLine = r===sr || c===sc;
          if (inLine) cell.classList.add('highlight');
          const inSameValLine = sameValCells.some(({r:rr,c:cc}) => r===rr || c===cc);
          if (inSameValLine && !inLine) cell.classList.add('same-line');
          if(selVal && userBoard[r][c]===selVal) cell.classList.add('same-val');
          if(selVal && memoBoard[r][c].has(selVal)) {
            cell.classList.add('same-val-memo');
            cell.dataset.activeMemo = selVal;
          }
        }
      }

      const val = userBoard[r][c];
      const memo = memoBoard[r][c];

      if(val !== 0) {
        if(!givenMask[r][c] && val !== solution[r][c]) cell.classList.add('error');
        const span = document.createElement('span');
        span.className = 'cell-num';
        span.textContent = val;
        cell.appendChild(span);
        if (lastEntered && lastEntered.r === r && lastEntered.c === c) {
          cell.classList.add('entered');
        }
      } else if(memo.size > 0) {
        const memoGrid = document.createElement('div');
        memoGrid.className = 'cell-memo';
        const activeMemo = cell.dataset.activeMemo ? parseInt(cell.dataset.activeMemo) : 0;
        for(let n=1;n<=9;n++) {
          const mn = document.createElement('div');
          mn.className = 'memo-num' + (n === activeMemo ? ' active-memo' : '');
          mn.textContent = memo.has(n) ? n : '';
          memoGrid.appendChild(mn);
        }
        cell.appendChild(memoGrid);
      }

      cell.addEventListener('click', ()=>onCellClick(r, c));
      cell.addEventListener('touchstart', (e)=>onCellTouchStart(e, r, c), {passive:true});
      cell.addEventListener('touchend',   (e)=>onCellTouchEnd(e, r, c));
      cell.addEventListener('contextmenu',(e)=>e.preventDefault());
      cell.addEventListener('mousedown',  (e)=>onCellMouseDown(e, r, c));
      cell.addEventListener('mouseup',    (e)=>onCellMouseUp(e, r, c));
      cell.addEventListener('mouseleave', (e)=>onCellMouseLeave(e));
      board.appendChild(cell);
    }
  }
  lastEntered = null;
}

function selectCell(r, c) {
  if(isGameOver) return;
  selectedCell = {r, c};
  renderBoard();
}

// ---------- INPUT EVENTS ----------
function onCellClick(r, c) {
  if(isGameOver) return;
  if(longPressTriggered) { longPressTriggered = false; return; }
  if(isMultiSelectMode) { toggleMultiCell(r, c); return; }
  selectCell(r, c);
}
function onCellTouchStart(e, r, c) {
  if(isGameOver) return;
  if(isMultiSelectMode) { toggleMultiCell(r, c); return; }
  if(isMemoMode) {
    longPressTriggered = false;
    longPressTimer = setTimeout(()=>{
      longPressTriggered = true;
      enterMultiSelect(r, c);
    }, LONG_PRESS_MS);
  }
}
function onCellMouseDown(e, r, c) {
  if(e.button !== 0 || isGameOver || isMultiSelectMode || !isMemoMode) return;
  longPressTriggered = false;
  longPressTimer = setTimeout(()=>{
    longPressTriggered = true;
    enterMultiSelect(r, c);
  }, LONG_PRESS_MS);
}
function onCellMouseUp() { if(longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } }
function onCellMouseLeave() { if(longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } }
function onCellTouchEnd() { if(longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } }

function enterMultiSelect(r, c) {
  isMultiSelectMode = true;
  multiSelectedCells = new Set();
  if(!givenMask[r][c] && userBoard[r][c] === 0) multiSelectedCells.add(`${r},${c}`);
  updateMultiBar();
  renderBoard();
}
function toggleMultiCell(r, c) {
  if(givenMask[r][c] || userBoard[r][c] !== 0) return;
  const key = `${r},${c}`;
  if(multiSelectedCells.has(key)) multiSelectedCells.delete(key);
  else multiSelectedCells.add(key);
  updateMultiBar();
  renderBoard();
}
function exitMultiSelect() {
  isMultiSelectMode = false;
  multiSelectedCells = new Set();
  $('multi-select-bar').classList.remove('show');
  renderBoard();
}
function updateMultiBar() {
  const bar = $('multi-select-bar');
  if(isMultiSelectMode) {
    bar.classList.add('show');
    $('multi-count').textContent = multiSelectedCells.size;
  } else {
    bar.classList.remove('show');
  }
}

// ---------- INPUT NUM ----------
function inputNum(n) {
  if(isGameOver) return;

  if(isMultiSelectMode) {
    if(multiSelectedCells.size === 0) return;
    const anyHas = [...multiSelectedCells].some(key => {
      const [r, c] = key.split(',').map(Number);
      return !givenMask[r][c] && userBoard[r][c] === 0 && memoBoard[r][c].has(n);
    });
    multiSelectedCells.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      if(!givenMask[r][c] && userBoard[r][c] === 0) {
        if(anyHas) memoBoard[r][c].delete(n);
        else        memoBoard[r][c].add(n);
      }
    });
    renderBoard();
    return;
  }

  if(!selectedCell) return;
  const {r, c} = selectedCell;
  if(givenMask[r][c]) return;

  if(isMemoMode) {
    if(userBoard[r][c] !== 0) return;
    const memo = memoBoard[r][c];
    if(memo.has(n)) memo.delete(n); else memo.add(n);
    renderBoard();
    return;
  }

  const prev = { val: userBoard[r][c], memo: new Set(memoBoard[r][c]) };
  history.push({r, c, prev});

  userBoard[r][c] = n;
  memoBoard[r][c].clear();
  lastEntered = {r, c};

  if(n !== solution[r][c]) {
    mistakes++;
    updateMistakeUI();
    playSound('error');
    // shake
    setTimeout(()=>{
      const idx = r*9 + c;
      const cellEl = $('board').children[idx];
      if (cellEl) {
        cellEl.classList.add('shake');
        setTimeout(()=>cellEl.classList.remove('shake'), 500);
      }
    }, 0);
    if(mistakes >= maxMistakes) {
      clearInterval(timerInterval);
      isGameOver = true;
      renderBoard();
      setTimeout(()=>showResult(false), 800);
      return;
    }
  } else {
    autoRemoveMemo(r, c, n);
    playSound('place');
  }

  renderBoard();
  updateNumpad();

  if(n === solution[r][c]) {
    setTimeout(()=>checkCompletions(r, c), 50);
  }

  if(isBoardComplete()) {
    clearInterval(timerInterval);
    setTimeout(()=>showResult(true), 600);
  }
}

function autoRemoveMemo(row, col, num) {
  const br = Math.floor(row/3)*3, bc = Math.floor(col/3)*3;
  for(let i=0;i<9;i++) { memoBoard[row][i].delete(num); memoBoard[i][col].delete(num); }
  for(let i=0;i<3;i++) for(let j=0;j<3;j++) memoBoard[br+i][bc+j].delete(num);
}

function clearCell() {
  if(!selectedCell || isGameOver) return;
  const {r, c} = selectedCell;
  if(givenMask[r][c]) return;
  const prev = { val: userBoard[r][c], memo: new Set(memoBoard[r][c]) };
  history.push({r, c, prev});
  userBoard[r][c] = 0;
  memoBoard[r][c].clear();
  renderBoard();
  updateNumpad();
}
function doUndo() {
  if(!history.length || isGameOver) return;
  const last = history.pop();
  userBoard[last.r][last.c] = last.prev.val;
  memoBoard[last.r][last.c] = new Set(last.prev.memo);
  renderBoard();
  updateNumpad();
}
function toggleMemo() {
  isMemoMode = !isMemoMode;
  $('memo-btn').classList.toggle('active', isMemoMode);
}

// ---------- HINT ----------
// 演出タイミング（調整しやすいよう定数化）
const HINT1_SHOW_MS       = 1000;  // ヒント1が表示されている時間(ms)
const HINT1_EXIT_MS       = 400;   // ヒント1が退場しきるまでの待ち(ms)
const HINT_WRITE_DURATION = 2800;  // 書き込みアニメ(ヒント2/3)の長さ(ms)
const HINT_SWAP_MS        = 150;   // ヒント2/3の切り替え間隔(ms)
const HINT_WRITER_W_CELLS = 2.8;   // 書き込みキャラの横幅(マス数)
const HINT_TIP_X          = 0.777; // 画像内のペン先X位置(0〜1) ヒント2/3のペン先実測平均
const HINT_TIP_Y          = 0.125; // 画像内のペン先Y位置(0〜1) ヒント2/3のペン先実測平均
const HINT_BOB_PX         = 3;     // 書き込み中の上下ゆれ幅(px)。0で無効
const HINT_SE_VOLUME      = 0.21;  // 鉛筆SE(油性マーカー)の音量(0〜1)。小さめ

function useHint() {
  if (isGameOver || hintBusy) return;
  // pick selected cell if empty/wrong, else first empty/wrong
  let target = null;
  if (selectedCell) {
    const {r,c} = selectedCell;
    if (!givenMask[r][c] && userBoard[r][c] !== solution[r][c]) target = {r,c};
  }
  if (!target) {
    outer: for(let r=0;r<9;r++) for(let c=0;c<9;c++) {
      if (!givenMask[r][c] && userBoard[r][c] !== solution[r][c]) { target = {r,c}; break outer; }
    }
  }
  if (!target) return;
  const {r,c} = target;

  hintsUsed++;
  playSound('hint');
  showHintCharacter();   // ヒント1 が画面下から登場

  // 実際にヒントの数字を盤面に確定させる処理
  function commitHint() {
    const prev = { val: userBoard[r][c], memo: new Set(memoBoard[r][c]) };
    history.push({r, c, prev});
    userBoard[r][c] = solution[r][c];
    memoBoard[r][c].clear();
    givenMask[r][c] = true; // lock as known
    selectedCell = {r, c};
    lastEntered = {r,c};
    autoRemoveMemo(r,c,solution[r][c]);
    renderBoard();
    updateNumpad();
    // 書き込みが終わったら金色は残さない。即座に通常マス＋数字で確定させる
    setTimeout(()=>checkCompletions(r,c), 50);
    if (isBoardComplete()) {
      clearInterval(timerInterval);
      setTimeout(()=>showResult(true), 600);
    }
  }

  // アニメOFF時は即座に確定（従来どおり）
  if (!getSettings().animations) {
    commitHint();
    return;
  }

  // 対象マスを選択状態にして見せる（数字はまだ出さない）
  hintBusy = true;
  const myGen = gameGen;
  selectedCell = {r, c};
  renderBoard();

  // ② 約1秒後 → ヒント1を退場 → ③ 退場しきったら → ④ ヒント2/3 で書き込み
  setTimeout(()=>{
    if (myGen !== gameGen) { hintBusy = false; return; }
    hideHintCharacter();   // ヒント1 消える
    setTimeout(()=>{
      if (myGen !== gameGen) { hintBusy = false; return; }
      playWritingAnimation(r, c, ()=>{
        if (myGen === gameGen) commitHint();
        hintBusy = false;
      });
    }, HINT1_EXIT_MS);
  }, HINT1_SHOW_MS);
}

// ヒント2/3 を対象マス上で交互表示して「書き込み中」に見せる
function playWritingAnimation(r, c, onDone) {
  const wrap = document.querySelector('.board-wrap');
  const boardEl = $('board');
  const cellEl = boardEl && boardEl.children[r*9 + c];
  if (!wrap || !cellEl) { onDone(); return; }

  // 既存の書き込みキャラが残っていたら掃除
  const old = wrap.querySelector('.hint-writer');
  if (old) old.remove();

  // 対象マスの位置を board-wrap 基準で算出
  const wrapRect = wrap.getBoundingClientRect();
  const cellRect = cellEl.getBoundingClientRect();
  const cellCx = cellRect.left - wrapRect.left + cellRect.width / 2;
  const cellCy = cellRect.top  - wrapRect.top  + cellRect.height / 2;

  const writerW = HINT_WRITER_W_CELLS * cellRect.width;
  const writerH = writerW * (1536 / 1024); // 画像比率
  // ペン先が対象マスの中心に来るよう配置
  const left = cellCx - HINT_TIP_X * writerW;
  const top  = cellCy - HINT_TIP_Y * writerH;

  const writer = document.createElement('div');
  writer.className = 'hint-writer';
  writer.style.left   = left + 'px';
  writer.style.top    = top + 'px';
  writer.style.width  = writerW + 'px';
  writer.style.height = writerH + 'px';

  const img2 = document.createElement('img'); img2.src = 'ヒント2.png'; img2.alt = '';
  const img3 = document.createElement('img'); img3.src = 'ヒント3.png'; img3.alt = '';
  img3.style.opacity = '0';
  writer.appendChild(img2);
  writer.appendChild(img3);
  wrap.appendChild(writer);
  cellEl.classList.add('hint-writing'); // 書き込み中はマスを金色に（数字は終わりに出る）

  // 鉛筆SE（油性マーカー）を書き込み中だけ鳴らす・音量小さめ
  let writeSE = null;
  if (getSettings().sound) {
    try {
      writeSE = new Audio('油性マーカーで字を書く.mp3');
      writeSE.volume = HINT_SE_VOLUME;
      writeSE.play().catch(()=>{});
    } catch (e) {}
  }

  // ヒント2/3 を交互に切り替え（＋微妙な上下ゆれ）
  let frame = 0;
  const swap = setInterval(()=>{
    frame++;
    const showThree = frame % 2 === 1;
    img2.style.opacity = showThree ? '0' : '1';
    img3.style.opacity = showThree ? '1' : '0';
    writer.style.transform = `translateY(${showThree ? -HINT_BOB_PX : 0}px)`;
  }, HINT_SWAP_MS);

  // 一定時間後：切り替え停止 → 数字確定 → キャラをフェードアウトして消去
  setTimeout(()=>{
    clearInterval(swap);
    if (writeSE) { writeSE.pause(); writeSE.currentTime = 0; }
    writer.style.transform = 'translateY(0)';
    onDone();                       // ここで数字が出る
    writer.classList.add('done');   // フェードアウト（素早く）
    setTimeout(()=>{ if (writer.parentNode) writer.remove(); }, 150);
  }, HINT_WRITE_DURATION);
}

function updateNumpad() {
  const counts = Array(10).fill(0);
  for(let r=0;r<9;r++) for(let c=0;c<9;c++) {
    if(userBoard[r][c]) counts[userBoard[r][c]]++;
  }
  document.querySelectorAll('.num-btn').forEach((btn,i)=>{
    const n = i + 1;
    const remaining = 9 - counts[n];
    const completed = remaining <= 0;
    btn.classList.toggle('completed', completed);
    const span = $(`remain-${n}`);
    if(span) span.textContent = completed ? '' : `残${remaining}`;
  });
}

function exportBoard() {
  const memoArr = memoBoard.map(row => row.map(cell => [...cell]));
  const data = { difficulty: currentDiff, elapsed: elapsedSeconds, mistakes, solution, puzzle, userBoard, memo: memoArr, givenMask };
  const json = JSON.stringify(data, null, 2);
  navigator.clipboard.writeText(json).then(()=>{
    const btn = $('save-btn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="ci">✓</span>コピー済';
    setTimeout(()=>{ btn.innerHTML = orig; }, 1400);
  }).catch(()=>{
    const blob = new Blob([json], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sudoku_${currentDiff}_${Date.now()}.json`;
    a.click();
  });
}

function isBoardComplete() {
  for(let r=0;r<9;r++) for(let c=0;c<9;c++) {
    if(userBoard[r][c] !== solution[r][c]) return false;
  }
  return true;
}

// ---------- AUDIO ----------
let audioCtx = null;
function getAudio() {
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playSound(type) {
  if (!getSettings().sound) return;
  try {
    const ctx = getAudio();
    if (type === 'place') {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.06);
      g.gain.setValueAtTime(0.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(); osc.stop(ctx.currentTime + 0.13);
    } else if (type === 'error') {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.18);
      g.gain.setValueAtTime(0.10, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start(); osc.stop(ctx.currentTime + 0.23);
    } else if (type === 'hint') {
      const notes = [659, 880, 1175];
      notes.forEach((f,i)=>{
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = f;
        g.gain.setValueAtTime(0.10, ctx.currentTime + i*0.06);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i*0.06 + 0.18);
        o.start(ctx.currentTime + i*0.06); o.stop(ctx.currentTime + i*0.06 + 0.2);
      });
    } else if(type === 'line') {
      // bright triangle bell — chime cluster
      const fundamentals = [988, 1319, 1976]; // B5 E6 B6
      fundamentals.forEach((f,i)=>{
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        o.connect(g); g.connect(ctx.destination);
        const t0 = ctx.currentTime + i*0.025;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.13, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.55);
        o.start(t0); o.stop(t0 + 0.6);
      });
      // tiny noise sparkle
      const buf = ctx.createBuffer(1, ctx.sampleRate*0.15, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for(let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * Math.pow(1 - i/data.length, 3) * 0.3;
      const src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), ng = ctx.createGain();
      src.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 4000;
      ng.gain.value = 0.18;
      src.connect(hp); hp.connect(ng); ng.connect(ctx.destination);
      src.start();
    } else if(type === 'box') {
      // golden shimmer arpeggio — longer, richer
      const notes = [784, 1047, 1319, 1568, 2093]; // G5 C6 E6 G6 C7
      notes.forEach((f,i)=>{
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        o.connect(g); g.connect(ctx.destination);
        const t0 = ctx.currentTime + i*0.06;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.7);
        o.start(t0); o.stop(t0 + 0.75);
      });
      // shimmery noise tail
      const buf = ctx.createBuffer(1, ctx.sampleRate*0.4, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for(let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * Math.pow(1 - i/data.length, 2) * 0.35;
      const src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), ng = ctx.createGain();
      src.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 5000;
      ng.gain.value = 0.12;
      src.connect(hp); hp.connect(ng); ng.connect(ctx.destination);
      src.start(ctx.currentTime + 0.05);
    } else if(type === 'clear') {
      const notes = [523, 659, 784, 1047, 1319];
      notes.forEach((freq, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.22, ctx.currentTime + i*0.1);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i*0.1 + 0.55);
        o.start(ctx.currentTime + i*0.1); o.stop(ctx.currentTime + i*0.1 + 0.55);
      });
    }
  } catch(e) {}
}

// ---------- LINE/BOX FLASH ----------
function checkCompletions(r, c) {
  const flashCells = [];
  if(!completedRows.has(r)) {
    let ok = true;
    for(let cc=0;cc<9;cc++) if(userBoard[r][cc]!==solution[r][cc]) { ok=false; break; }
    if(ok) {
      completedRows.add(r);
      for(let cc=0;cc<9;cc++) flashCells.push({r, c:cc, type:'line'});
      playSound('line');
    }
  }
  if(!completedCols.has(c)) {
    let ok = true;
    for(let rr=0;rr<9;rr++) if(userBoard[rr][c]!==solution[rr][c]) { ok=false; break; }
    if(ok) {
      completedCols.add(c);
      for(let rr=0;rr<9;rr++) {
        if(!flashCells.find(f=>f.r===rr&&f.c===c)) flashCells.push({r:rr, c, type:'line'});
      }
      if(!completedRows.has(r)) playSound('line');
    }
  }
  const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
  const boxKey = `${br}-${bc}`;
  if(!completedBoxes.has(boxKey)) {
    let ok = true;
    for(let i=0;i<3;i++) for(let j=0;j<3;j++) {
      if(userBoard[br+i][bc+j]!==solution[br+i][bc+j]) { ok=false; break; }
    }
    if(ok) {
      completedBoxes.add(boxKey);
      for(let i=0;i<3;i++) for(let j=0;j<3;j++) {
        if(!flashCells.find(f=>f.r===br+i&&f.c===bc+j)) flashCells.push({r:br+i, c:bc+j, type:'box'});
      }
      setTimeout(()=>playSound('box'), 150);
    }
  }
  if(flashCells.length > 0) flashCellsEffect(flashCells);
}
function flashCellsEffect(cells) {
  const allCells = $('board').querySelectorAll('.cell');
  cells.forEach(({r, c, type}) => {
    const idx = r*9 + c;
    const el = allCells[idx];
    if(!el) return;
    el.classList.remove('flash-line','flash-box');
    void el.offsetWidth;
    el.classList.add(type==='line' ? 'flash-line' : 'flash-box');
    el.addEventListener('animationend', ()=>{
      el.classList.remove('flash-line','flash-box');
    }, {once:true});
  });
  spawnSparkles(cells);
}
function spawnSparkles(cells) {
  if (!getSettings().animations) return;
  const wrap = document.querySelector('.board-wrap');
  if (!wrap) return;
  const wrapRect = wrap.getBoundingClientRect();
  const allCells = $('board').querySelectorAll('.cell');
  cells.forEach(({r, c, type}) => {
    const idx = r*9 + c;
    const cellEl = allCells[idx];
    if(!cellEl) return;
    const rect = cellEl.getBoundingClientRect();
    const x0 = rect.left - wrapRect.left;
    const y0 = rect.top - wrapRect.top;
    const w = rect.width, h = rect.height;
    const N = type === 'box' ? 4 : 3;
    for(let i=0;i<N;i++){
      const s = document.createElement('div');
      s.className = 'sparkle' + (type==='box' ? ' gold' : '');
      const px = x0 + 4 + Math.random()*(w-8);
      const py = y0 + 4 + Math.random()*(h-8);
      s.style.left = px + 'px';
      s.style.top = py + 'px';
      s.style.animationDelay = (Math.random()*0.35) + 's';
      const sz = 8 + Math.random()*10;
      s.style.width = sz+'px'; s.style.height = sz+'px';
      wrap.appendChild(s);
      setTimeout(()=>s.remove(), 1500);
    }
  });
}

// ---------- HINT CHARACTER ----------
function showHintCharacter() {
  const el = $('hint-character');
  if (!el) return;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(showHintCharacter._t);
  showHintCharacter._t = setTimeout(()=>{
    el.classList.remove('show');
  }, 2200);
}
function hideHintCharacter() {
  const el = $('hint-character');
  if (!el) return;
  clearTimeout(showHintCharacter._t);
  el.classList.remove('show');
}

// ---------- CONFETTI ----------
function startConfetti() {
  const canvas = $('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  // theme palette via CSS vars
  const root = getComputedStyle(document.documentElement);
  const colors = ['celebrate-1','celebrate-2','celebrate-3','celebrate-4']
    .map(v => root.getPropertyValue('--'+v).trim() || '#1a6fd4');

  const pieces = Array.from({length: 160}, ()=>({
    x: Math.random()*canvas.width,
    y: Math.random()*canvas.height - canvas.height,
    w: Math.random()*10+5,
    h: Math.random()*6+3,
    color: colors[Math.floor(Math.random()*colors.length)],
    rot: Math.random()*360,
    vx: (Math.random()-0.5)*4,
    vy: Math.random()*4+2.5,
    vr: (Math.random()-0.5)*10,
    shape: Math.random() < 0.3 ? 'circle' : 'rect',
  }));
  let frame = 0;
  const maxFrames = 220;
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pieces.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI/180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - frame/maxFrames);
      if (p.shape === 'circle') {
        ctx.beginPath(); ctx.arc(0,0, p.w/2, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      }
      ctx.restore();
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      p.vy += 0.05;
    });
    frame++;
    if(frame < maxFrames) requestAnimationFrame(draw);
    else ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  draw();
}

// ---------- RESULT ----------
function showResult(success) {
  const timeStr = fmtTime(elapsedSeconds);

  if(success) {
    bumpStats(currentDiff, true);
    const isBest = setBest(currentDiff, elapsedSeconds);
    playSound('clear');
    startConfetti();
    let ov = $('clear-overlay');
    if(ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'clear-overlay';
    ov.classList.add('show');
    ov.innerHTML = `
      <div class="clear-title">COMPLETE</div>
      <div class="clear-sub">${DIFFICULTY_CONFIG[currentDiff].label} — PUZZLE SOLVED</div>
      <div class="clear-stats">
        <div class="cs-item">
          <div class="cs-num">${timeStr}</div>
          <div class="cs-label">タイム</div>
          ${isBest ? '<div class="cs-best">★ NEW BEST</div>' : ''}
        </div>
        <div class="cs-item">
          <div class="cs-num">${mistakes}</div>
          <div class="cs-label">ミス</div>
        </div>
        <div class="cs-item">
          <div class="cs-num">${hintsUsed}</div>
          <div class="cs-label">ヒント</div>
        </div>
      </div>
      <button class="clear-btn" onclick="closeClearOverlay()">PLAY AGAIN</button>
    `;
    document.body.appendChild(ov);
  } else {
    showScreen('result-screen');
    $('result-title').textContent = 'GAME OVER';
    $('r-time').textContent = timeStr;
    $('r-mistake').textContent = `${mistakes}回`;
  }
}
function closeClearOverlay() {
  const ov = $('clear-overlay');
  if(ov) ov.remove();
  showScreen('difficulty-screen');
  refreshDifficultyMeta();
}
function resetGame() {
  clearInterval(timerInterval);
  isMultiSelectMode = false;
  multiSelectedCells = new Set();
  $('multi-select-bar').classList.remove('show');
  showScreen('difficulty-screen');
  refreshDifficultyMeta();
}

// ---------- DIFFICULTY SCREEN META ----------
function refreshDifficultyMeta() {
  const best = getBest();
  const stats = getStats();
  ['easy','normal','hard'].forEach(d => {
    const b = best[d];
    const cl = (stats[d] && stats[d].clears) || 0;
    const meta = $(`diff-meta-${d}`);
    if (meta) {
      meta.innerHTML = b != null
        ? `<b>${fmtTime(b)}</b><span>${cl}回クリア</span>`
        : `<b>--:--</b><span>${cl}回クリア</span>`;
    }
  });
}

// ---------- SETTINGS MODAL ----------
function openSettings() {
  const s = getSettings();
  $('toggle-sound').classList.toggle('on', s.sound);
  $('toggle-anim').classList.toggle('on', s.animations);
  $('settings-modal').classList.add('show');
}
function closeSettings() { $('settings-modal').classList.remove('show'); }
function toggleSound() {
  const s = getSettings();
  setSettings({ sound: !s.sound });
  $('toggle-sound').classList.toggle('on', !s.sound);
}
function toggleAnim() {
  const s = getSettings();
  setSettings({ animations: !s.animations });
  $('toggle-anim').classList.toggle('on', !s.animations);
  document.documentElement.classList.toggle('no-anim', !(!s.animations));
}

// ---------- STATS MODAL ----------
function openStats() {
  const stats = getStats(), best = getBest();
  ['easy','normal','hard'].forEach(d => {
    const cell = $(`stat-${d}`);
    const cl = (stats[d] && stats[d].clears) || 0;
    const tot = (stats[d] && stats[d].total) || 0;
    cell.querySelector('.sc-num').textContent  = cl;
    cell.querySelector('.sc-time').textContent = best[d] != null ? fmtTime(best[d]) : '--:--';
    cell.querySelector('.sc-foot').textContent = tot > 0 ? `${tot}回挑戦` : '未挑戦';
  });
  $('stats-modal').classList.add('show');
}
function closeStats() { $('stats-modal').classList.remove('show'); }

// ---------- INIT ----------
window.addEventListener('DOMContentLoaded', () => {
  refreshDifficultyMeta();
});

// expose to inline handlers
Object.assign(window, {
  startGame, doUndo, toggleMemo, clearCell, exportBoard, resetGame,
  exitMultiSelect, inputNum, useHint, closeClearOverlay,
  openSettings, closeSettings, toggleSound, toggleAnim,
  openStats, closeStats,
});
