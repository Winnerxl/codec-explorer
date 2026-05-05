/**
 * Transform Blocks — DCT, DWT (Haar, Daubechies)
 */
(function(B) {
    var dct1d = B.dct1d, dct2d = B.dct2d, dwtForward1d = B.dwtForward1d, dwtForward2d = B.dwtForward2d;
    var create2DArray = B.create2DArray;

    B.transformBlocks = [
        {
            id: 'dct',
            name: 'DCT',
            category: 'transform',
            icon: '🔄',
            description: 'Discrete Cosine Transform — converts to frequency domain (JPEG-style)',
            params: [
                { key: 'blockSize', label: 'Block Size', type: 'select', options: [
                    { v: 8, l: '8' }, { v: 16, l: '16' }, { v: 32, l: '32' }
                ], default: 8 }
            ],
            process: function(input, params) {
                var bs = params.blockSize;
                if (input.type === 'signal_1d') {
                    var data = input.data;
                    var N = data.length;
                    var padded = N % bs === 0 ? data : (function() {
                        var p = new Float32Array(Math.ceil(N / bs) * bs);
                        p.set(data);
                        return p;
                    })();
                    var coeffs = new Float32Array(padded.length);
                    for (var i = 0; i < padded.length; i += bs) {
                        var block = padded.slice(i, i + bs);
                        var shifted = new Float32Array(block.length);
                        for (var j = 0; j < block.length; j++) shifted[j] = block[j] * 128 + 128;
                        var t = dct1d(shifted);
                        coeffs.set(t, i);
                    }
                    return {
                        type: 'coefficients_1d', data: coeffs, sampleRate: input.sampleRate,
                        originalLength: N, blockSize: bs, original: input,
                        metadata: { transform: 'dct', blockSize: bs, inputType: '1d' }
                    };
                }
                if (input.type === 'image_2d') {
                    var h = input.height, w = input.width;
                    var coeffs2 = create2DArray(h, w);
                    for (var by = 0; by < h; by += bs) {
                        for (var bx = 0; bx < w; bx += bs) {
                            var bh = Math.min(bs, h - by), bw2 = Math.min(bs, w - bx);
                            var blk = create2DArray(bs, bs);
                            for (var y = 0; y < bh; y++)
                                for (var x = 0; x < bw2; x++)
                                    blk[y][x] = input.data[by + y][bx + x];
                            var dctBlk = dct2d(blk, bs);
                            for (var y2 = 0; y2 < bh; y2++)
                                for (var x2 = 0; x2 < bw2; x2++)
                                    coeffs2[by + y2][bx + x2] = dctBlk[y2][x2];
                        }
                    }
                    return {
                        type: 'coefficients_2d', data: coeffs2, width: w, height: h,
                        blockSize: bs, original: input,
                        metadata: { transform: 'dct', blockSize: bs, inputType: '2d' }
                    };
                }
                throw new Error('DCT: unsupported input type ' + input.type);
            },
            getInfo: function() {
                return 'DCT decomposes signal into cosine basis functions. Low-frequency components carry most energy; high-frequency ones can be quantized aggressively.';
            }
        },
        {
            id: 'dwt',
            name: 'DWT',
            category: 'transform',
            icon: '🌊',
            description: 'Discrete Wavelet Transform — multi-resolution decomposition',
            params: [
                { key: 'wavelet', label: 'Wavelet', type: 'select', options: [
                    { v: 'haar', l: 'Haar' }, { v: 'db2', l: 'Daubechies-4' }
                ], default: 'haar' },
                { key: 'level', label: 'Decomposition Level', type: 'select', options: [
                    { v: 1, l: '1' }, { v: 2, l: '2' }, { v: 3, l: '3' }
                ], default: 2 }
            ],
            process: function(input, params) {
                var wavelet = params.wavelet, level = params.level;
                if (input.type === 'signal_1d') {
                    var result = dwtForward1d(input.data, wavelet, level);
                    var parts = [result.approx].concat(result.details);
                    var totalLen = 0;
                    for (var i = 0; i < parts.length; i++) totalLen += parts[i].length;
                    var coeffs = new Float32Array(totalLen);
                    var offset = 0;
                    for (var j = 0; j < parts.length; j++) {
                        coeffs.set(parts[j], offset);
                        offset += parts[j].length;
                    }
                    return {
                        type: 'coefficients_1d', data: coeffs, sampleRate: input.sampleRate,
                        originalLength: input.data.length, original: input,
                        dwtMeta: { approxLen: result.approx.length, detailLens: result.details.map(function(d) { return d.length; }), level: level, wavelet: wavelet },
                        metadata: { transform: 'dwt', wavelet: wavelet, level: level, inputType: '1d' }
                    };
                }
                if (input.type === 'image_2d') {
                    var res = dwtForward2d(input.data, wavelet, level);
                    return {
                        type: 'coefficients_2d', data: res, width: input.width, height: input.height,
                        original: input, dwtMeta: { level: level, wavelet: wavelet },
                        metadata: { transform: 'dwt', wavelet: wavelet, level: level, inputType: '2d' }
                    };
                }
                throw new Error('DWT: unsupported input type ' + input.type);
            },
            getInfo: function() {
                return 'DWT provides multi-resolution analysis. Haar is simplest; Daubechies provides smoother analysis. Each level halves the resolution.';
            }
        }
    ];
})(window.BYOC);
