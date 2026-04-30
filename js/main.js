// --- State Variables ---
let currentModule = 'module-input';
let originalImage = null; // HTMLImageElement
let originalImageData = null; // ImageData

// --- DOM Elements ---
const navBtns = document.querySelectorAll('.nav-btn');
const controlGroups = document.querySelectorAll('.control-group');

const imageUpload = document.getElementById('image-upload');
const canvasOriginal = document.getElementById('canvas-original');
const canvasProcessed = document.getElementById('canvas-processed');
const ctxOriginal = canvasOriginal.getContext('2d');
const ctxProcessed = canvasProcessed.getContext('2d');

const bitSlider = document.getElementById('quantization-bits');
const bitValDisplay = document.getElementById('bit-val');
const btnApplyQuantization = document.getElementById('btn-apply-quantization');

// Stats Elements
const statMse = document.getElementById('stat-mse');
const statPsnr = document.getElementById('stat-psnr');
const statBpp = document.getElementById('stat-bpp');

// --- Initialization ---
function init() {
    setupEventListeners();
    drawPlaceholderText(canvasOriginal, "Görüntü Yüklenmedi");
    drawPlaceholderText(canvasProcessed, "İşlem Bekleniyor");
}

function drawPlaceholderText(canvas, text) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#94a3b8'; // text-muted
    ctx.font = '16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

// --- Event Listeners ---
function setupEventListeners() {
    // Navigation (Tab Switching)
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active class from all
            navBtns.forEach(b => b.classList.remove('active'));
            controlGroups.forEach(g => g.classList.add('hidden'));
            
            // Add active class to clicked
            const targetId = e.target.getAttribute('data-target');
            e.target.classList.add('active');
            document.getElementById(targetId).classList.remove('hidden');
            currentModule = targetId;
        });
    });

    // Image Upload
    imageUpload.addEventListener('change', handleImageUpload);

    // Quantization UI
    bitSlider.addEventListener('input', (e) => {
        bitValDisplay.textContent = e.target.value;
        // Real-time update if image exists
        if (originalImageData) {
            applyQuantization(parseInt(e.target.value));
        }
    });

    btnApplyQuantization.addEventListener('click', () => {
        if (originalImageData) {
            applyQuantization(parseInt(bitSlider.value));
        }
    });
}

// --- Core Logic (Placeholder for Phase 2) ---

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            
            // Resize canvas to fit image while maintaining aspect ratio (max 512x512)
            const maxSize = 512;
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > maxSize) {
                    height *= maxSize / width;
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width *= maxSize / height;
                    height = maxSize;
                }
            }

            canvasOriginal.width = width;
            canvasOriginal.height = height;
            canvasProcessed.width = width;
            canvasProcessed.height = height;

            // Draw original image
            ctxOriginal.drawImage(img, 0, 0, width, height);
            
            // Store original image data for processing
            originalImageData = ctxOriginal.getImageData(0, 0, width, height);
            
            // Reset processed canvas
            ctxProcessed.clearRect(0, 0, width, height);
            ctxProcessed.drawImage(img, 0, 0, width, height);
            
            // Initial reset of stats
            updateStats(0, Infinity, 8);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Basic Uniform Scalar Quantization
function applyQuantization(bits) {
    if (!originalImageData) return;

    const width = canvasOriginal.width;
    const height = canvasOriginal.height;
    
    // Create new ImageData
    const processedData = new ImageData(
        new Uint8ClampedArray(originalImageData.data),
        width,
        height
    );

    const levels = Math.pow(2, bits);
    const step = 256 / levels;

    // Quantize each pixel (RGB)
    for (let i = 0; i < processedData.data.length; i += 4) {
        // Red
        let r = originalImageData.data[i];
        processedData.data[i] = Math.floor(r / step) * step + (step / 2);
        
        // Green
        let g = originalImageData.data[i + 1];
        processedData.data[i + 1] = Math.floor(g / step) * step + (step / 2);
        
        // Blue
        let b = originalImageData.data[i + 2];
        processedData.data[i + 2] = Math.floor(b / step) * step + (step / 2);
        
        // Alpha (processedData.data[i+3]) remains unchanged
    }

    ctxProcessed.putImageData(processedData, 0, 0);
    
    // Calculate Stats
    calculateAndDisplayStats(originalImageData, processedData, bits);
}

// Calculate MSE and PSNR
function calculateAndDisplayStats(original, processed, bits) {
    let mse = 0;
    const totalPixels = original.width * original.height;
    
    for (let i = 0; i < original.data.length; i += 4) {
        // Calculate error for luminance or average of RGB
        const rErr = original.data[i] - processed.data[i];
        const gErr = original.data[i+1] - processed.data[i+1];
        const bErr = original.data[i+2] - processed.data[i+2];
        
        mse += (rErr*rErr + gErr*gErr + bErr*bErr) / 3;
    }
    
    mse = mse / totalPixels;
    
    let psnr = Infinity;
    if (mse > 0) {
        psnr = 10 * Math.log10((255 * 255) / mse);
    }

    updateStats(mse, psnr, bits);
}

function updateStats(mse, psnr, bpp) {
    statMse.textContent = mse.toFixed(2);
    statPsnr.textContent = psnr === Infinity ? '∞ dB' : psnr.toFixed(2) + ' dB';
    statBpp.textContent = parseFloat(bpp).toFixed(2);
}

// Run init
init();
