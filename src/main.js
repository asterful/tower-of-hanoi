import * as monaco from 'monaco-editor';
import './style.css';

// DOM Elements
const editorContainer = document.getElementById('editor-container');
const towersContainer = document.getElementById('towers-container');
const consoleOutput = document.getElementById('console-output');
const btnRun = document.getElementById('btn-run');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnReset = document.getElementById('btn-reset');
const btnClearConsole = document.getElementById('btn-clear-console');

// Custom Inputs
const speedSelect = document.getElementById('speed-select');
const diskCountDisplay = document.getElementById('disk-count-display');
const btnDecDisks = document.getElementById('btn-dec-disks');
const btnIncDisks = document.getElementById('btn-inc-disks');

// State Variables
let pyodide = null;
let editor = null;
let NUM_DISKS = 5;
let state = [[], [], []];
let moveQueue = [];
let isPlaying = false;
let isAnimating = false;
let currentAnimation = null;

// Console Rendering
function printConsole(msg, type='log') {
    const div = document.createElement('div');
    if(type === 'error') div.className = 'console-error';
    else if(type === 'info') div.className = 'console-info';
    else div.className = 'console-log';
    div.innerText = msg;
    consoleOutput.appendChild(div);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}
function clearConsole() {
    consoleOutput.innerHTML = '';
}

// Monaco Init
const defaultCode = `def solve(n):
    print(f"\\nSolving Tower of Hanoi for {n} disks...")
    
    def hanoi(disks, source, target, auxiliary):
        if disks == 1:
            move(source, target)
        else:
            hanoi(disks - 1, source, auxiliary, target)
            move(source, target)
            hanoi(disks - 1, auxiliary, target, source)
            
    hanoi(n, 0, 2, 1)
    print("Execution complete! Click animate to view moves.")
`;

editor = monaco.editor.create(editorContainer, {
    value: defaultCode,
    language: 'python',
    theme: 'vs-dark',
    minimap: { enabled: false },
    fontSize: 16,
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    automaticLayout: true,
    padding: { top: 0, bottom: 0 },
    scrollBeyondLastLine: false,
    lineHeight: 26,
});

// Visualizer Math
const diskHeight = 26;
const baseOffset = 16;
const pegPositions = [16.6666, 50, 83.3333]; // percentages

// Dynamic Color Gradient Setup (Blue to Violet/Pink map)
function getDiskColor(diskId, total) {
    const ratio = (diskId - 1) / Math.max(1, (total - 1));
    // Interpolate roughly from deep blue to bright purple/pink
    const h = 220 - (ratio * 60); 
    const s = 90;
    const l = 60 + (ratio * 10);
    return `hsl(${h}, ${s}%, ${l}%)`;
}

function createDiskElement(diskId) {
    const el = document.createElement('div');
    el.className = 'disk';
    el.id = `disk-${diskId}`;
    el.innerText = diskId;
    
    // Scale disk width smoothly
    const minW = 12; 
    const maxW = 32; 
    const w = minW + ((diskId / 10) * maxW);
    el.style.width = `${w}%`;
    el.style.backgroundColor = getDiskColor(diskId, NUM_DISKS);
    
    return el;
}

// Controls Logic
function updateDiskCount(val) {
    let newVal = NUM_DISKS + val;
    if(newVal < 1) newVal = 1;
    if(newVal > 10) newVal = 10;
    if(NUM_DISKS !== newVal) {
        NUM_DISKS = newVal;
        diskCountDisplay.innerText = NUM_DISKS;
        initGame(); // Reset visually when changed
    }
}

btnDecDisks.addEventListener('click', () => updateDiskCount(-1));
btnIncDisks.addEventListener('click', () => updateDiskCount(1));
btnClearConsole.addEventListener('click', clearConsole);

// Game Setup
function initGame() {
    diskCountDisplay.innerText = NUM_DISKS;
    
    towersContainer.querySelectorAll('.disk').forEach(el => el.remove());
    
    state = [[], [], []];
    moveQueue = [];
    isPlaying = false;
    isAnimating = false;
    if(currentAnimation) {
        currentAnimation.cancel();
        currentAnimation = null;
    }
    updateUI();

    // Populate peg 0
    for (let i = NUM_DISKS; i >= 1; i--) {
        state[0].push(i);
        const el = createDiskElement(i);
        towersContainer.appendChild(el);
    }
    
    positionInstantly();
}

function positionInstantly() {
    const rect = towersContainer.getBoundingClientRect();
    const pW = rect.width;
    const pH = rect.height;

    for (let peg = 0; peg < 3; peg++) {
        for (let slot = 0; slot < state[peg].length; slot++) {
            const diskId = state[peg][slot];
            const el = document.getElementById(`disk-${diskId}`);
            if(!el) break;
            
            const cx = (pegPositions[peg] / 100) * pW;
            const cy = pH - baseOffset - (slot * diskHeight) - diskHeight;
            
            el.style.left = '0px';
            el.style.top = '0px';
            el.style.transform = `translate(calc(-50% + ${cx}px), ${cy}px)`;
        }
    }
}

// -----------------------------------------------------
// Animation Engine
// -----------------------------------------------------
async function animateDiskMovement(diskId, start, end, slotDest) {
    const el = document.getElementById(`disk-${diskId}`);
    if(!el) return;
    
    const rect = towersContainer.getBoundingClientRect();
    const pW = rect.width;
    const pH = rect.height;
    
    const startSlot = state[start].length; 
    const startX = (pegPositions[start] / 100) * pW;
    const startY = pH - baseOffset - (startSlot * diskHeight) - diskHeight;
    
    const endX = (pegPositions[end] / 100) * pW;
    const endY = pH - baseOffset - (slotDest * diskHeight) - diskHeight;
    
    // Smooth high curve above pegs
    const arcMaxTop = Math.min(startY, endY) - (pH * 0.35); 
    
    const steps = 60;
    const keyframes = [];
    
    for(let i=0; i<=steps; i++) {
        const t = i/steps;
        
        // Easing interpolation X: Smooth ease-in-out cubic
        const easeT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const currX = startX + (endX - startX) * easeT;
        
        // Parabola interpolation Y
        const currY = startY * (1 - t) + endY * t;
        const peakDist = Math.max(startY, endY) - arcMaxTop;
        const parabola = 4 * peakDist * t * (1 - t);
        
        keyframes.push({
            transform: `translate(calc(-50% + ${currX}px), ${currY - parabola}px)`
        });
    }

    const duration = parseInt(speedSelect.value, 10);
    
    currentAnimation = el.animate(keyframes, {
        duration: duration,
        easing: 'linear',  // Use linear keyframes because bezier is calculated manually
        fill: 'forwards'
    });

    isAnimating = true;
    await currentAnimation.finished.catch(()=> {}); 
    isAnimating = false;
    currentAnimation = null;
    
    el.style.transform = `translate(calc(-50% + ${endX}px), ${endY}px)`;
}

function handleInvalidMove(pegIndex) {
    printConsole(`[ERROR] Invalid move attempted onto peg ${pegIndex}`, 'error');
    towersContainer.classList.add('error-shake', 'error-flash');
    setTimeout(() => {
        towersContainer.classList.remove('error-shake', 'error-flash');
    }, 500);
    isPlaying = false;
    updateUI();
}

async function runQueue() {
    isPlaying = true;
    updateUI();

    while (moveQueue.length > 0 && isPlaying) {
        const [start, end] = moveQueue.shift();
        
        if(state[start].length === 0) {
            handleInvalidMove(start); break;
        }
        
        const movingDisk = state[start][state[start].length - 1];
        if(state[end].length > 0 && movingDisk > state[end][state[end].length - 1]) {
            handleInvalidMove(end); break;
        }
        
        state[start].pop();
        const destSlot = state[end].length;
        state[end].push(movingDisk);
        
        await animateDiskMovement(movingDisk, start, end, destSlot);
    }
    
    isPlaying = false;
    updateUI();
}

// -----------------------------------------------------
// Pyodide Runner
// -----------------------------------------------------
async function bootPyodide() {
    btnRun.innerHTML = `<span class="spinner"></span> Loading...`;
    btnRun.disabled = true;
    printConsole("Initializing Pyodide (WebAssembly Engine)...", 'info');
    
    try {
        pyodide = await loadPyodide({
            stdout: (msg) => printConsole(msg, 'log'),
            stderr: (msg) => printConsole(msg, 'error')
        });
        
        pyodide.globals.set('move', (s, e) => {
            if(!Number.isInteger(s) || !Number.isInteger(e)) return;
            if(s < 0 || s > 2 || e < 0 || e > 2) return;
            moveQueue.push([s, e]);
        });
        
        printConsole(">> Ready. Python runtime environment loaded.", 'info');
        btnRun.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Run Script`;
        btnRun.disabled = false;
    } catch(err) {
        printConsole("FATAL: " + err, 'error');
    }
}

async function runPython() {
    if(!pyodide) return;
    initGame();
    
    const code = editor.getValue();
    const wrappedCode = `
__cleanup_keys = [k for k in list(globals().keys()) if k not in ('__builtins__', '__name__', '__doc__', '__package__', 'move', 'pyodide')]
for __k in __cleanup_keys:
    del globals()[__k]
del __cleanup_keys

${code}

if 'solve' in globals():
    solve(${NUM_DISKS})
else:
    print("Warning: Missing 'solve()' entrypoint function.")
`;

    try {
        btnRun.disabled = true;
        await pyodide.runPythonAsync(wrappedCode);
        
        if (moveQueue.length > 0) {
            printConsole(`>> Valid simulation generated ${moveQueue.length} moves.`, 'info');
            updateUI(); 
        } else {
            printConsole(">> Finished executing, but no move() calls recorded.", 'error');
        }
    } catch(err) {
        printConsole(err.toString(), 'error');
    } finally {
        btnRun.disabled = false;
    }
}

function updateUI() {
    if (moveQueue.length > 0 && !isPlaying && !isAnimating) {
        btnPlayPause.disabled = false;
        btnPlayPause.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a2 2 0 0 1-4 0v-4M14 15v4a2 2 0 0 0 4 0v-4M10 9V5a2 2 0 0 1 4 0v4"></path><path d="M6 9h12a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z"></path></svg> Animate`;
    } else if (isPlaying) {
        btnPlayPause.disabled = false;
        btnPlayPause.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Pause`;
    } else {
        btnPlayPause.disabled = true;
        btnPlayPause.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Animate`;
    }
}

// Handlers
btnRun.addEventListener('click', runPython);

btnPlayPause.addEventListener('click', () => {
    if (isPlaying) {
        isPlaying = false;
        if(currentAnimation) currentAnimation.pause();
    } else {
        isPlaying = true;
        if(currentAnimation && currentAnimation.playState === 'paused') {
            currentAnimation.play();
            currentAnimation.finished.then(() => { if(isPlaying) runQueue(); });
        } else {
            runQueue();
        }
    }
    updateUI();
});

btnReset.addEventListener('click', initGame);

window.addEventListener('resize', positionInstantly);
window.addEventListener('load', () => {
    // wait a tick for fonts/layout
    setTimeout(() => {
        initGame();
        resizeCanvas();
    }, 100); 
});

// -----------------------------------------------------
// Teacher Telestrator (Disappearing Draw Tool)
// -----------------------------------------------------
const drawCanvas = document.getElementById('draw-layer');
const dCtx = drawCanvas.getContext('2d');
let isDrawing = false;
let drawLines = [];
let lastDrawPos = { x: 0, y: 0 };

function resizeCanvas() {
    const parentRect = drawCanvas.parentElement.getBoundingClientRect();
    drawCanvas.width = parentRect.width;
    drawCanvas.height = parentRect.height;
}

function getMousePos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

function startDrawing(e) {
    isDrawing = true;
    lastDrawPos = getMousePos(e);
}

function draw(e) {
    if (!isDrawing) return;
    const currentPos = getMousePos(e);
    drawLines.push({
        x1: lastDrawPos.x, y1: lastDrawPos.y,
        x2: currentPos.x, y2: currentPos.y,
        time: Date.now()
    });
    lastDrawPos = currentPos;
}

function stopDrawing() {
    isDrawing = false;
}

drawCanvas.addEventListener('mousedown', startDrawing);
drawCanvas.addEventListener('mousemove', draw);
window.addEventListener('mouseup', stopDrawing);

drawCanvas.addEventListener('touchstart', startDrawing, {passive: false});
drawCanvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e); }, {passive: false});
window.addEventListener('touchend', stopDrawing);
window.addEventListener('resize', resizeCanvas);

function renderDrawLoop() {
    dCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    const now = Date.now();
    const FADE_DUR = 1200; // 1.2s to fade 
    
    dCtx.lineWidth = 5;
    dCtx.lineCap = 'round';
    dCtx.lineJoin = 'round';
    
    drawLines = drawLines.filter(line => {
        const age = now - line.time;
        if (age > FADE_DUR) return false;
        
        const alpha = Math.max(0, 1 - (age / FADE_DUR));
        dCtx.strokeStyle = `rgba(239, 68, 68, ${alpha})`; // Bright red marker
        
        // Slight glow
        dCtx.shadowColor = `rgba(239, 68, 68, ${alpha})`;
        dCtx.shadowBlur = 8;
        
        dCtx.beginPath();
        dCtx.moveTo(line.x1, line.y1);
        dCtx.lineTo(line.x2, line.y2);
        dCtx.stroke();
        return true;
    });

    requestAnimationFrame(renderDrawLoop);
}
renderDrawLoop();

// Boot Wasm
bootPyodide();
