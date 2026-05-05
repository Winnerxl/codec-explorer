/**
 * Input Blocks — Signal generators, image loaders, audio loaders, sample data
 */
(function(B) {
    var clamp = B.clamp, linspace = B.linspace;

    // ── Sample image patterns (generated programmatically) ──
    function generateGradientImage(size) {
        var img = [];
        for (var y = 0; y < size; y++) {
            img[y] = new Float32Array(size);
            for (var x = 0; x < size; x++) {
                img[y][x] = clamp(((x + y) / (2 * size - 2)) * 255, 0, 255);
            }
        }
        return img;
    }

    function generateEdgeImage(size) {
        var img = [];
        for (var y = 0; y < size; y++) {
            img[y] = new Float32Array(size);
            for (var x = 0; x < size; x++) {
                img[y][x] = x < size / 2 ? 200 : 50;
            }
        }
        return img;
    }

    function generateCheckerImage(size) {
        var img = [];
        var bs = Math.max(2, Math.floor(size / 8));
        for (var y = 0; y < size; y++) {
            img[y] = new Float32Array(size);
            for (var x = 0; x < size; x++) {
                img[y][x] = ((Math.floor(x / bs) + Math.floor(y / bs)) % 2 === 0) ? 230 : 25;
            }
        }
        return img;
    }

    function generateGaussianImage(size) {
        var img = [];
        var cx = size / 2, cy = size / 2;
        var sigma = size / 4;
        for (var y = 0; y < size; y++) {
            img[y] = new Float32Array(size);
            for (var x = 0; x < size; x++) {
                var d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
                img[y][x] = clamp(255 * Math.exp(-(d * d) / (2 * sigma * sigma)), 0, 255);
            }
        }
        return img;
    }

    function generateTextureImage(size) {
        var img = [];
        for (var y = 0; y < size; y++) {
            img[y] = new Float32Array(size);
            for (var x = 0; x < size; x++) {
                var v = Math.sin(x * 0.3) * 40 + Math.cos(y * 0.5) * 40 +
                        Math.sin((x + y) * 0.2) * 30 + Math.cos((x - y) * 0.15) * 25 + 128;
                img[y][x] = clamp(v, 0, 255);
            }
        }
        return img;
    }

    B.inputBlocks = [
        {
            id: 'signal_sine',
            name: 'Sine Wave',
            category: 'input',
            icon: '〰️',
            description: 'Pure sinusoidal signal — single frequency component',
            params: [
                { key: 'frequency', label: 'Frequency (Hz)', type: 'range', min: 10, max: 2000, default: 440, step: 10 },
                { key: 'amplitude', label: 'Amplitude', type: 'range', min: 0.1, max: 1.0, default: 0.8, step: 0.05 },
                { key: 'sampleRate', label: 'Sample Rate', type: 'select', options: [
                    { v: 4000, l: '4 kHz' }, { v: 8000, l: '8 kHz' }, { v: 16000, l: '16 kHz' }
                ], default: 8000 },
                { key: 'duration', label: 'Duration (ms)', type: 'range', min: 10, max: 200, default: 50, step: 5 }
            ],
            process: function(_, params) {
                var frequency = params.frequency, amplitude = params.amplitude, sampleRate = params.sampleRate, duration = params.duration;
                var N = Math.floor(sampleRate * duration / 1000);
                var data = new Float32Array(N);
                for (var i = 0; i < N; i++) {
                    data[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
                }
                return { type: 'signal_1d', data: data, sampleRate: sampleRate, metadata: { generator: 'sine', frequency: frequency, amplitude: amplitude } };
            },
            getInfo: function() { return 'Generates a pure tone at the specified frequency. Useful for testing frequency-domain transforms like DCT and DWT.'; }
        },
        {
            id: 'signal_chirp',
            name: 'Chirp Signal',
            category: 'input',
            icon: '📈',
            description: 'Frequency sweep from f₀ to f₁ — tests wideband response',
            params: [
                { key: 'f0', label: 'Start Freq (Hz)', type: 'range', min: 50, max: 1000, default: 100, step: 50 },
                { key: 'f1', label: 'End Freq (Hz)', type: 'range', min: 200, max: 3000, default: 2000, step: 50 },
                { key: 'sampleRate', label: 'Sample Rate', type: 'select', options: [
                    { v: 8000, l: '8 kHz' }, { v: 16000, l: '16 kHz' }
                ], default: 8000 },
                { key: 'duration', label: 'Duration (ms)', type: 'range', min: 20, max: 200, default: 100, step: 10 }
            ],
            process: function(_, params) {
                var f0 = params.f0, f1 = params.f1, sampleRate = params.sampleRate, duration = params.duration;
                var N = Math.floor(sampleRate * duration / 1000);
                var data = new Float32Array(N);
                for (var i = 0; i < N; i++) {
                    var t = i / sampleRate;
                    var T = duration / 1000;
                    data[i] = 0.8 * Math.sin(2 * Math.PI * (f0 * t + (f1 - f0) * t * t / (2 * T)));
                }
                return { type: 'signal_1d', data: data, sampleRate: sampleRate, metadata: { generator: 'chirp', f0: f0, f1: f1 } };
            },
            getInfo: function() { return 'Linear frequency sweep — reveals how transform handles varying frequency content over time.'; }
        },
        {
            id: 'signal_composite',
            name: 'Composite Signal',
            category: 'input',
            icon: '🎵',
            description: 'Multi-frequency signal with harmonics — simulates real audio',
            params: [
                { key: 'fundamental', label: 'Fundamental (Hz)', type: 'range', min: 100, max: 1000, default: 300, step: 50 },
                { key: 'harmonics', label: 'Harmonics', type: 'select', options: [
                    { v: 2, l: '2' }, { v: 3, l: '3' }, { v: 5, l: '5' }
                ], default: 3 },
                { key: 'sampleRate', label: 'Sample Rate', type: 'select', options: [
                    { v: 8000, l: '8 kHz' }, { v: 16000, l: '16 kHz' }
                ], default: 8000 },
                { key: 'duration', label: 'Duration (ms)', type: 'range', min: 20, max: 200, default: 80, step: 10 }
            ],
            process: function(_, params) {
                var fundamental = params.fundamental, harmonics = params.harmonics, sampleRate = params.sampleRate, duration = params.duration;
                var N = Math.floor(sampleRate * duration / 1000);
                var data = new Float32Array(N);
                for (var i = 0; i < N; i++) {
                    var v = 0;
                    for (var h = 1; h <= harmonics; h++) {
                        v += (1 / h) * Math.sin(2 * Math.PI * fundamental * h * i / sampleRate);
                    }
                    data[i] = v * 0.6;
                }
                return { type: 'signal_1d', data: data, sampleRate: sampleRate, metadata: { generator: 'composite', fundamental: fundamental, harmonics: harmonics } };
            },
            getInfo: function() { return 'Sum of harmonics simulating a realistic audio signal. Higher harmonics add detail that gets removed by quantization.'; }
        },
        {
            id: 'signal_square',
            name: 'Square Wave',
            category: 'input',
            icon: '⬜',
            description: 'Square wave — rich in odd harmonics, tests compression of sharp transitions',
            params: [
                { key: 'frequency', label: 'Frequency (Hz)', type: 'range', min: 50, max: 1000, default: 200, step: 50 },
                { key: 'sampleRate', label: 'Sample Rate', type: 'select', options: [
                    { v: 8000, l: '8 kHz' }, { v: 16000, l: '16 kHz' }
                ], default: 8000 },
                { key: 'duration', label: 'Duration (ms)', type: 'range', min: 20, max: 200, default: 80, step: 10 }
            ],
            process: function(_, params) {
                var frequency = params.frequency, sampleRate = params.sampleRate, duration = params.duration;
                var N = Math.floor(sampleRate * duration / 1000);
                var data = new Float32Array(N);
                for (var i = 0; i < N; i++) {
                    data[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) >= 0 ? 0.8 : -0.8;
                }
                return { type: 'signal_1d', data: data, sampleRate: sampleRate, metadata: { generator: 'square', frequency: frequency } };
            },
            getInfo: function() { return 'Sharp transitions create significant high-frequency content. Watch how many DCT/DWT coefficients are needed to represent edges.'; }
        },
        {
            id: 'image_sample',
            name: 'Sample Image',
            category: 'input',
            icon: '🖼️',
            description: 'Predefined grayscale test patterns',
            params: [
                { key: 'pattern', label: 'Pattern', type: 'select', options: [
                    { v: 'gradient', l: 'Gradient' }, { v: 'edge', l: 'Edge' },
                    { v: 'checker', l: 'Checkerboard' }, { v: 'gaussian', l: 'Gaussian' },
                    { v: 'texture', l: 'Texture' }
                ], default: 'gradient' },
                { key: 'size', label: 'Size', type: 'select', options: [
                    { v: 32, l: '32×32' }, { v: 64, l: '64×64' }, { v: 128, l: '128×128' }
                ], default: 64 }
            ],
            process: function(_, params) {
                var pattern = params.pattern, size = params.size;
                var generators = {
                    gradient: generateGradientImage,
                    edge: generateEdgeImage,
                    checker: generateCheckerImage,
                    gaussian: generateGaussianImage,
                    texture: generateTextureImage
                };
                var data = (generators[pattern] || generateGradientImage)(size);
                return { type: 'image_2d', data: data, width: size, height: size, metadata: { pattern: pattern } };
            },
            getInfo: function() { return 'Choose from test patterns: gradient tests smooth compression, edges test sharp transitions, checkerboard is a worst-case for block transforms.'; }
        },
        {
            id: 'image_upload',
            name: 'Upload Image',
            category: 'input',
            icon: '📤',
            description: 'Load your own image — will be converted to grayscale',
            params: [
                { key: 'file', label: 'Image File', type: 'file', accept: 'image/*' },
                { key: 'size', label: 'Resize To', type: 'select', options: [
                    { v: 32, l: '32×32' }, { v: 64, l: '64×64' }, { v: 128, l: '128×128' }
                ], default: 64 }
            ],
            process: function(_, params) {
                if (params._imageData) {
                    return { type: 'image_2d', data: params._imageData, width: params.size, height: params.size, metadata: { source: 'upload' } };
                }
                var data = generateGradientImage(params.size);
                return { type: 'image_2d', data: data, width: params.size, height: params.size, metadata: { pattern: 'gradient' } };
            },
            getInfo: function() { return 'Upload any image — it will be resized and converted to grayscale for processing.'; }
        },
        {
            id: 'audio_upload',
            name: 'Upload Audio',
            category: 'input',
            icon: '🎤',
            description: 'Load a WAV/MP3 file — extracted as mono 1D signal',
            params: [
                { key: 'file', label: 'Audio File', type: 'file', accept: 'audio/*' },
                { key: 'maxSamples', label: 'Max Samples', type: 'select', options: [
                    { v: 512, l: '512' }, { v: 1024, l: '1024' }, { v: 2048, l: '2048' }, { v: 4096, l: '4096' }
                ], default: 1024 }
            ],
            process: function(_, params) {
                if (params._audioData) {
                    var data = params._audioData.length > params.maxSamples
                        ? params._audioData.slice(0, params.maxSamples)
                        : params._audioData;
                    return { type: 'signal_1d', data: data, sampleRate: params._sampleRate || 8000, metadata: { source: 'upload' }, isAudio: true };
                }
                var N = params.maxSamples;
                var data = new Float32Array(N);
                for (var i = 0; i < N; i++) data[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / 8000);
                return { type: 'signal_1d', data: data, sampleRate: 8000, metadata: { generator: 'fallback' }, isAudio: true };
            },
            getInfo: function() { return 'Upload audio and explore how different codecs compress real speech or music signals.'; }
        }
    ];
})(window.BYOC);
