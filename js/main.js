// --- Navigation ---
const navBtns = document.querySelectorAll('.top-nav .nav-btn');
const moduleViews = document.querySelectorAll('.module-view');

navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        navBtns.forEach(b => b.classList.remove('active'));
        moduleViews.forEach(m => m.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.getAttribute('data-target')).classList.add('active');
    });
});

// --- Constants & Precomputed ---
const Q50 = [
    [16, 11, 10, 16, 24, 40, 51, 61],
    [12, 12, 14, 19, 26, 58, 60, 55],
    [14, 13, 16, 24, 40, 57, 69, 56],
    [14, 17, 22, 29, 51, 87, 80, 62],
    [18, 22, 37, 56, 68, 109, 103, 77],
    [24, 35, 55, 64, 81, 104, 113, 92],
    [49, 64, 78, 87, 103, 121, 120, 101],
    [72, 92, 95, 98, 112, 100, 103, 99]
];

// Precompute Cosine values for DCT
const cosTable = new Float32Array(8 * 8);
for (let x = 0; x < 8; x++) {
    for (let u = 0; u < 8; u++) {
        cosTable[x * 8 + u] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}
function C(val) { return val === 0 ? 1 / Math.SQRT2 : 1; }

// --- State ---
let currentPattern = 'gradient';
let currentQuality = 50;
let originalBlock = create2DArray(8, 8);
let dctBlock = create2DArray(8, 8);
let quantizedBlock = create2DArray(8, 8);
let dequantizedBlock = create2DArray(8, 8);
let reconstructedBlock = create2DArray(8, 8);
let qMatrix = create2DArray(8, 8);

// --- DOM Elements ---
const patternBtns = document.querySelectorAll('.pattern-btn');
const qSlider = document.getElementById('dct-q-slider');
const qValDisplay = document.getElementById('dct-q-val');
const matrixContainer = document.getElementById('quant-matrix-display');

const canvasOriginal = document.getElementById('canvas-dct-original');
const canvasDCT = document.getElementById('canvas-dct-transform');
const canvasQuantized = document.getElementById('canvas-dct-quantized');
const canvasReconstructed = document.getElementById('canvas-dct-reconstructed');
const canvasError = document.getElementById('canvas-dct-error');

const metricNonZero = document.getElementById('dct-metric-nonzero');
const metricPsnr = document.getElementById('dct-metric-psnr');
const metricMse = document.getElementById('dct-metric-mse');
const metricComp = document.getElementById('dct-metric-comp');
const titleNonZero = document.getElementById('dct-title-nonzero');
const titlePsnr = document.getElementById('dct-title-psnr');

// --- Helper Functions ---
function create2DArray(rows, cols) {
    let arr = new Array(rows);
    for(let i=0; i<rows; i++) arr[i] = new Float32Array(cols);
    return arr;
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

// --- DCT Logic ---

function generatePattern(type) {
    for(let y=0; y<8; y++) {
        for(let x=0; x<8; x++) {
            let val = 0;
            if (type === 'gradient') {
                val = ((x + y) / 14) * 255;
            } else if (type === 'edge') {
                val = x < 4 ? 200 : 50;
            } else if (type === 'hi-freq') {
                val = ((x + y) % 2 === 0) ? 255 : 0;
            } else if (type === 'smooth') {
                const cx = x - 3.5, cy = y - 3.5;
                const dist = Math.sqrt(cx*cx + cy*cy);
                val = 255 * Math.exp(-dist * dist / 10);
            }
            originalBlock[y][x] = clamp(val, 0, 255);
        }
    }
}

function updateQuantizationMatrix(q) {
    let S;
    if (q < 50) S = 5000 / q;
    else S = 200 - 2 * q;
    
    for(let y=0; y<8; y++) {
        for(let x=0; x<8; x++) {
            let val = Math.floor((Q50[y][x] * S + 50) / 100);
            val = clamp(val, 1, 255);
            qMatrix[y][x] = val;
        }
    }
}

function performDCT() {
    // Forward DCT
    for (let v = 0; v < 8; v++) {
        for (let u = 0; u < 8; u++) {
            let sum = 0;
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    // Shift pixels by -128
                    sum += (originalBlock[y][x] - 128) * cosTable[x * 8 + u] * cosTable[y * 8 + v];
                }
            }
            dctBlock[v][u] = 0.25 * C(u) * C(v) * sum;
        }
    }
}

function performQuantization() {
    let nonZeroCount = 0;
    for (let v = 0; v < 8; v++) {
        for (let u = 0; u < 8; u++) {
            quantizedBlock[v][u] = Math.round(dctBlock[v][u] / qMatrix[v][u]);
            if (quantizedBlock[v][u] !== 0) nonZeroCount++;
            // Dequantize immediately
            dequantizedBlock[v][u] = quantizedBlock[v][u] * qMatrix[v][u];
        }
    }
    return nonZeroCount;
}

function performIDCT() {
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            let sum = 0;
            for (let v = 0; v < 8; v++) {
                for (let u = 0; u < 8; u++) {
                    sum += C(u) * C(v) * dequantizedBlock[v][u] * cosTable[x * 8 + u] * cosTable[y * 8 + v];
                }
            }
            // Add 128 back
            reconstructedBlock[y][x] = clamp(Math.round(0.25 * sum + 128), 0, 255);
        }
    }
}

// --- Rendering ---

function renderGrid(ctx) {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for(let i = 0; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 20, 0); ctx.lineTo(i * 20, 160);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * 20); ctx.lineTo(160, i * 20);
        ctx.stroke();
    }
}

function renderBlock(canvas, block, isHeatmap=false, isError=false) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 160, 160);
    
    for(let y=0; y<8; y++) {
        for(let x=0; x<8; x++) {
            const val = block[y][x];
            let color;
            
            if (isError) {
                // Error map: red intensity
                const err = Math.min(255, val * 5); // amplify for visibility
                color = `rgb(${err}, 0, 0)`;
            } else if (isHeatmap) {
                // DCT heatmap: blue for positive, red for negative
                if (val === 0) {
                    color = '#111';
                } else if (val > 0) {
                    const intensity = clamp(val * 2, 50, 255);
                    color = `rgb(0, 50, ${intensity})`;
                } else {
                    const intensity = clamp(Math.abs(val) * 2, 50, 255);
                    color = `rgb(${intensity}, 0, 0)`;
                }
            } else {
                // Grayscale
                color = `rgb(${val}, ${val}, ${val})`;
            }
            
            ctx.fillStyle = color;
            ctx.fillRect(x * 20, y * 20, 20, 20);
        }
    }
    renderGrid(ctx);
}

function renderMatrixTable() {
    matrixContainer.innerHTML = '';
    for(let y=0; y<8; y++) {
        for(let x=0; x<8; x++) {
            const val = qMatrix[y][x];
            const cell = document.createElement('div');
            cell.className = 'matrix-cell';
            cell.textContent = val;
            if (val < 20) cell.classList.add('cell-blue');
            else if (val > 80) cell.classList.add('cell-orange');
            matrixContainer.appendChild(cell);
        }
    }
}

// --- Main Pipeline Execution ---

function runPipeline() {
    generatePattern(currentPattern);
    updateQuantizationMatrix(currentQuality);
    performDCT();
    const nonZero = performQuantization();
    performIDCT();
    
    // Calculate Error and Metrics
    let mse = 0;
    let errorBlock = create2DArray(8,8);
    for(let y=0; y<8; y++) {
        for(let x=0; x<8; x++) {
            const diff = originalBlock[y][x] - reconstructedBlock[y][x];
            errorBlock[y][x] = Math.abs(diff);
            mse += diff * diff;
        }
    }
    mse /= 64;
    const psnr = mse === 0 ? Infinity : 10 * Math.log10((255*255)/mse);
    
    // Render Canvases
    renderBlock(canvasOriginal, originalBlock);
    renderBlock(canvasDCT, dctBlock, true);
    renderBlock(canvasQuantized, quantizedBlock, true);
    renderBlock(canvasReconstructed, reconstructedBlock);
    renderBlock(canvasError, errorBlock, false, true);
    renderMatrixTable();
    
    // Update Metrics UI
    metricNonZero.textContent = `${nonZero}/64`;
    titleNonZero.textContent = `${nonZero} non-zero`;
    
    metricMse.textContent = mse.toFixed(2);
    
    const psnrText = psnr === Infinity ? '∞' : psnr.toFixed(1);
    metricPsnr.textContent = `${psnrText} dB`;
    titlePsnr.textContent = psnrText;
    
    // Naive empirical compression estimation for 8x8 block
    const estComp = nonZero === 0 ? 64 : 64 / nonZero;
    metricComp.textContent = `~${estComp.toFixed(1)}×`;
}

// --- Event Listeners ---

patternBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        patternBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentPattern = e.target.getAttribute('data-pattern');
        runPipeline();
    });
});

qSlider.addEventListener('input', (e) => {
    currentQuality = parseInt(e.target.value);
    qValDisplay.textContent = `Q=${currentQuality}`;
    runPipeline();
});

const imageUpload = document.getElementById('dct-image-upload');
if (imageUpload) {
    imageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 8;
                canvas.height = 8;
                const ctx = canvas.getContext('2d');
                
                // Crop from center
                const sx = Math.max(0, Math.floor(img.width / 2) - 4);
                const sy = Math.max(0, Math.floor(img.height / 2) - 4);
                ctx.drawImage(img, sx, sy, 8, 8, 0, 0, 8, 8);
                
                const imgData = ctx.getImageData(0, 0, 8, 8);
                for(let y = 0; y < 8; y++) {
                    for(let x = 0; x < 8; x++) {
                        const i = (y * 8 + x) * 4;
                        const gray = 0.299 * imgData.data[i] + 0.587 * imgData.data[i+1] + 0.114 * imgData.data[i+2];
                        originalBlock[y][x] = clamp(gray, 0, 255);
                    }
                }
                
                patternBtns.forEach(b => b.classList.remove('active'));
                currentPattern = 'custom';
                runPipeline();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Initialize
runPipeline();
