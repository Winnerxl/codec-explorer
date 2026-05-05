/**
 * Reconstruction Blocks — Inverse DCT, Inverse DWT, DPCM Decoder
 */
(function(B) {
    var idct1d = B.idct1d, idct2d = B.idct2d;
    var dwtInverse1d = B.dwtInverse1d, dwtInverse2d = B.dwtInverse2d;
    var clamp = B.clamp, create2DArray = B.create2DArray;
    var linearPredictReconstruct = B.linearPredictReconstruct;

    B.reconstructionBlocks = [
        {
            id: 'idct',
            name: 'Inverse DCT',
            category: 'reconstruction',
            icon: '🔄',
            description: 'Inverse DCT — reconstructs spatial domain from frequency coefficients',
            params: [],
            process: function(input) {
                var bs = input.blockSize || 8;
                if (input.type === 'coefficients_1d' || (input.type === 'signal_1d' && input.metadata && input.metadata.transform === 'dct')) {
                    var data = input.data;
                    var N = input.originalLength || data.length;
                    var reconstructed = new Float32Array(N);
                    for (var i = 0; i < data.length; i += bs) {
                        var block = data.slice(i, i + bs);
                        var t = idct1d(block);
                        for (var j = 0; j < bs && i + j < N; j++) {
                            reconstructed[i + j] = (t[j] - 128) / 128;
                        }
                    }
                    var finalData = reconstructed.slice(0, N);
                    return {
                        type: 'signal_1d', data: finalData, sampleRate: input.sampleRate,
                        original: input.original,
                        metadata: Object.assign({}, input.metadata, { stage: 'reconstructed' })
                    };
                }
                if (input.type === 'coefficients_2d') {
                    var h = input.height, w = input.width;
                    var result = create2DArray(h, w);
                    for (var by = 0; by < h; by += bs) {
                        for (var bx = 0; bx < w; bx += bs) {
                            var bh = Math.min(bs, h - by), bw = Math.min(bs, w - bx);
                            var blk = create2DArray(bs, bs);
                            for (var y = 0; y < bh; y++)
                                for (var x = 0; x < bw; x++)
                                    blk[y][x] = input.data[by + y][bx + x];
                            var rec = idct2d(blk, bs);
                            for (var y2 = 0; y2 < bh; y2++)
                                for (var x2 = 0; x2 < bw; x2++)
                                    result[by + y2][bx + x2] = rec[y2][x2];
                        }
                    }
                    return {
                        type: 'image_2d', data: result, width: w, height: h,
                        original: input.original,
                        metadata: Object.assign({}, input.metadata, { stage: 'reconstructed' })
                    };
                }
                throw new Error('IDCT: needs coefficient data');
            },
            getInfo: function() {
                return 'Converts frequency-domain coefficients back to spatial domain. Quantization loss becomes visible as block artifacts and blurring.';
            }
        },
        {
            id: 'idwt',
            name: 'Inverse DWT',
            category: 'reconstruction',
            icon: '🌊',
            description: 'Inverse Discrete Wavelet Transform — reconstructs from wavelet coefficients',
            params: [],
            process: function(input) {
                if (!input.dwtMeta) throw new Error('IDWT: missing DWT metadata — place after a DWT block');
                var level = input.dwtMeta.level, wavelet = input.dwtMeta.wavelet;
                if (input.type === 'coefficients_1d' || input.type === 'signal_1d') {
                    var approxLen = input.dwtMeta.approxLen;
                    var detailLens = input.dwtMeta.detailLens;
                    var data = input.data;
                    var approx = data.slice(0, approxLen);
                    var details = [];
                    var offset = approxLen;
                    for (var i = 0; i < detailLens.length; i++) {
                        details.push(data.slice(offset, offset + detailLens[i]));
                        offset += detailLens[i];
                    }
                    var reconstructed = dwtInverse1d(approx, details, wavelet);
                    var origLen = input.originalLength || reconstructed.length;
                    return {
                        type: 'signal_1d', data: reconstructed.slice(0, origLen), sampleRate: input.sampleRate,
                        original: input.original,
                        metadata: Object.assign({}, input.metadata, { stage: 'reconstructed' })
                    };
                }
                if (input.type === 'coefficients_2d') {
                    var result = dwtInverse2d(input.data, wavelet, level);
                    return {
                        type: 'image_2d', data: result, width: input.width, height: input.height,
                        original: input.original,
                        metadata: Object.assign({}, input.metadata, { stage: 'reconstructed' })
                    };
                }
                throw new Error('IDWT: unsupported input type');
            },
            getInfo: function() {
                return 'Reconstructs signal from wavelet coefficients. Quantization errors in detail coefficients cause smoothing.';
            }
        },
        {
            id: 'dpcm_decoder',
            name: 'DPCM Decoder',
            category: 'reconstruction',
            icon: '📈',
            description: 'Reconstructs signal from prediction error — reverses DPCM/predictor',
            params: [],
            process: function(input) {
                if (input.type !== 'signal_1d') throw new Error('DPCM Decoder requires 1D signal');
                var error = input.data;
                var N = error.length;
                var reconstructed;
                if (input.predictionMeta && input.predictionMeta.coefficients) {
                    var coeffs = new Float32Array(input.predictionMeta.coefficients);
                    reconstructed = linearPredictReconstruct(error, coeffs);
                } else {
                    reconstructed = new Float32Array(N);
                    var type = (input.predictionMeta && input.predictionMeta.type) || 'previous';
                    if (type === 'previous') {
                        reconstructed[0] = error[0];
                        for (var i = 1; i < N; i++) {
                            reconstructed[i] = reconstructed[i - 1] + error[i];
                        }
                    } else {
                        reconstructed[0] = error[0];
                        if (N > 1) reconstructed[1] = reconstructed[0] + error[1];
                        for (var i = 2; i < N; i++) {
                            reconstructed[i] = (reconstructed[i - 1] + reconstructed[i - 2]) / 2 + error[i];
                        }
                    }
                }
                return {
                    type: 'signal_1d', data: reconstructed, sampleRate: input.sampleRate,
                    original: input.original,
                    metadata: Object.assign({}, input.metadata, { stage: 'reconstructed' })
                };
            },
            getInfo: function() {
                return 'Accumulates prediction errors to reconstruct the original signal. Quantization noise propagates through reconstruction.';
            }
        }
    ];
})(window.BYOC);
