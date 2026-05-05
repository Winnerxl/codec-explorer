/**
 * Quantization Blocks — Uniform, Non-uniform (μ-law/A-law), JPEG Matrix
 */
(function(B) {
    var clamp = B.clamp, create2DArray = B.create2DArray;
    var muLawCompress = B.muLawCompress, muLawExpand = B.muLawExpand;
    var aLawCompress = B.aLawCompress, aLawExpand = B.aLawExpand;
    var scaleQuantMatrix = B.scaleQuantMatrix;

    function uniformQuantize(value, bits) {
        var levels = Math.pow(2, bits);
        var step = 2.0 / levels;
        var idx = clamp(Math.floor((value + 1) / step), 0, levels - 1);
        return (idx + 0.5) * step - 1;
    }

    B.quantizationBlocks = [
        {
            id: 'uniform_quantizer',
            name: 'Uniform Quantizer',
            category: 'quantization',
            icon: '📊',
            description: 'Equal step-size quantization — simplest quantizer',
            params: [
                { key: 'bits', label: 'Bits', type: 'range', min: 1, max: 8, default: 4, step: 1 }
            ],
            process: function(input, params) {
                var bits = params.bits;
                var levels = Math.pow(2, bits);
                if (input.type === 'signal_1d' || input.type === 'coefficients_1d') {
                    var data = input.data;
                    var minVal = Infinity, maxVal = -Infinity;
                    for (var i = 0; i < data.length; i++) {
                        if (data[i] < minVal) minVal = data[i];
                        if (data[i] > maxVal) maxVal = data[i];
                    }
                    var quantized = new Float32Array(data.length);
                    var indices = new Int16Array(data.length);
                    var range = maxVal - minVal || 1;
                    var step = range / levels;
                    for (var i = 0; i < data.length; i++) {
                        var idx = clamp(Math.floor((data[i] - minVal) / step), 0, levels - 1);
                        indices[i] = idx;
                        quantized[i] = minVal + (idx + 0.5) * step;
                    }
                    var out = {};
                    for (var k in input) out[k] = input[k];
                    out.type = input.type === 'coefficients_1d' ? 'coefficients_1d' : 'signal_1d';
                    out.data = quantized;
                    out.quantIndices = indices;
                    out.quantMeta = { bits: bits, levels: levels, step: step, minVal: minVal, maxVal: maxVal };
                    out.metadata = Object.assign({}, input.metadata, { quantizer: 'uniform', bits: bits });
                    return out;
                }
                if (input.type === 'coefficients_2d' || input.type === 'image_2d') {
                    var h = input.data.length, w = input.data[0].length;
                    var minV = Infinity, maxV = -Infinity;
                    for (var y = 0; y < h; y++)
                        for (var x = 0; x < w; x++) {
                            if (input.data[y][x] < minV) minV = input.data[y][x];
                            if (input.data[y][x] > maxV) maxV = input.data[y][x];
                        }
                    var rng = maxV - minV || 1;
                    var stp = rng / levels;
                    var qd = create2DArray(h, w);
                    for (var y = 0; y < h; y++)
                        for (var x = 0; x < w; x++)
                            qd[y][x] = minV + (clamp(Math.floor((input.data[y][x] - minV) / stp), 0, levels - 1) + 0.5) * stp;
                    var out2 = {};
                    for (var k in input) out2[k] = input[k];
                    out2.data = qd;
                    out2.quantMeta = { bits: bits, levels: levels, step: stp, minVal: minV, maxVal: maxV };
                    out2.metadata = Object.assign({}, input.metadata, { quantizer: 'uniform', bits: bits });
                    return out2;
                }
                throw new Error('Uniform Quantizer: unsupported input type');
            },
            getInfo: function() {
                return 'Divides the value range into 2^bits equal intervals. Simple but not optimal for non-uniform distributions.';
            }
        },
        {
            id: 'nonuniform_quantizer',
            name: 'Non-uniform Quantizer',
            category: 'quantization',
            icon: '📈',
            description: 'μ-law or A-law companding — better for speech signals',
            params: [
                { key: 'law', label: 'Companding', type: 'select', options: [
                    { v: 'mu', l: 'μ-law (μ=255)' }, { v: 'a', l: 'A-law (A=87.6)' }
                ], default: 'mu' },
                { key: 'bits', label: 'Bits', type: 'range', min: 2, max: 8, default: 4, step: 1 }
            ],
            process: function(input, params) {
                if (input.type !== 'signal_1d' && input.type !== 'coefficients_1d')
                    throw new Error('Non-uniform quantizer works only on 1D data');
                var law = params.law, bits = params.bits;
                var compress = law === 'mu' ? muLawCompress : aLawCompress;
                var expand = law === 'mu' ? muLawExpand : aLawExpand;
                var data = input.data;
                var maxAbs = 0;
                for (var i = 0; i < data.length; i++) maxAbs = Math.max(maxAbs, Math.abs(data[i]));
                maxAbs = maxAbs || 1;
                var levels = Math.pow(2, bits);
                var quantized = new Float32Array(data.length);
                for (var i = 0; i < data.length; i++) {
                    var normalized = data[i] / maxAbs;
                    var compressed = compress(normalized);
                    var q = uniformQuantize(compressed, bits);
                    var expanded = expand(q);
                    quantized[i] = expanded * maxAbs;
                }
                var out = {};
                for (var k in input) out[k] = input[k];
                out.data = quantized;
                out.quantMeta = { bits: bits, levels: levels, law: law, maxAbs: maxAbs };
                out.metadata = Object.assign({}, input.metadata, { quantizer: law + '-law', bits: bits });
                return out;
            },
            getInfo: function() {
                return 'Companding allocates finer quantization steps near zero where speech signals spend most time. μ-law is used in North America/Japan; A-law in Europe.';
            }
        },
        {
            id: 'jpeg_quantizer',
            name: 'JPEG Quantizer',
            category: 'quantization',
            icon: '🖼️',
            description: 'JPEG-standard quantization matrix — quality-aware for 2D DCT coefficients',
            params: [
                { key: 'quality', label: 'Quality (1–100)', type: 'range', min: 1, max: 100, default: 50, step: 1 }
            ],
            process: function(input, params) {
                if (input.type !== 'coefficients_2d') throw new Error('JPEG Quantizer requires 2D DCT coefficients');
                var quality = params.quality;
                var bs = input.blockSize || 8;
                if (bs !== 8) throw new Error('JPEG Quantizer requires block size 8');
                var qMatrix = scaleQuantMatrix(quality);
                var h = input.height, w = input.width;
                var quantized = create2DArray(h, w);
                var nonZeroCount = 0, totalCount = 0;
                for (var by = 0; by < h; by += 8) {
                    for (var bx = 0; bx < w; bx += 8) {
                        for (var y = 0; y < 8 && by + y < h; y++) {
                            for (var x = 0; x < 8 && bx + x < w; x++) {
                                var q = Math.round(input.data[by + y][bx + x] / qMatrix[y][x]);
                                quantized[by + y][bx + x] = q * qMatrix[y][x];
                                totalCount++;
                                if (q !== 0) nonZeroCount++;
                            }
                        }
                    }
                }
                var out = {};
                for (var k in input) out[k] = input[k];
                out.data = quantized;
                out.quantMeta = { quality: quality, qMatrix: qMatrix, nonZeroCount: nonZeroCount, totalCount: totalCount, nonZeroRatio: nonZeroCount / totalCount };
                out.metadata = Object.assign({}, input.metadata, { quantizer: 'jpeg', quality: quality });
                return out;
            },
            getInfo: function() {
                return 'Uses the standard JPEG luminance quantization matrix, scaled by quality factor. Higher quality = less quantization = more bits.';
            }
        }
    ];
})(window.BYOC);
