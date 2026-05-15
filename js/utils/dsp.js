/**
 * DSP Core — DCT, DWT, Huffman, Shannon-Fano, RLE, Companding, Linear Prediction
 */
(function(B) {
    var clamp = B.clamp, create2DArray = B.create2DArray;

    // ═══ DCT / IDCT ═══
    var cosCache = {};
    function getCos(N) {
        if (cosCache[N]) return cosCache[N];
        var t = new Float32Array(N * N);
        for (var n = 0; n < N; n++)
            for (var k = 0; k < N; k++)
                t[n * N + k] = Math.cos(Math.PI * k * (2 * n + 1) / (2 * N));
        cosCache[N] = t;
        return t;
    }
    function alpha(k, N) { return k === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N); }

    B.dct1d = function(input) {
        var N = input.length, cos = getCos(N), out = new Float32Array(N);
        for (var k = 0; k < N; k++) {
            var sum = 0;
            for (var n = 0; n < N; n++) sum += input[n] * cos[n * N + k];
            out[k] = alpha(k, N) * sum;
        }
        return out;
    };

    B.idct1d = function(input) {
        var N = input.length, cos = getCos(N), out = new Float32Array(N);
        for (var n = 0; n < N; n++) {
            var sum = 0;
            for (var k = 0; k < N; k++) sum += alpha(k, N) * input[k] * cos[n * N + k];
            out[n] = sum;
        }
        return out;
    };

    B.dct2d = function(block, size) {
        var temp = create2DArray(size, size), result = create2DArray(size, size);
        for (var y = 0; y < size; y++) {
            var row = new Float32Array(size);
            for (var x = 0; x < size; x++) row[x] = block[y][x] - 128;
            var t = B.dct1d(row);
            for (var x = 0; x < size; x++) temp[y][x] = t[x];
        }
        for (var x = 0; x < size; x++) {
            var col = new Float32Array(size);
            for (var y = 0; y < size; y++) col[y] = temp[y][x];
            var t = B.dct1d(col);
            for (var y = 0; y < size; y++) result[y][x] = t[y];
        }
        return result;
    };

    B.idct2d = function(block, size) {
        var temp = create2DArray(size, size), result = create2DArray(size, size);
        for (var x = 0; x < size; x++) {
            var col = new Float32Array(size);
            for (var y = 0; y < size; y++) col[y] = block[y][x];
            var t = B.idct1d(col);
            for (var y = 0; y < size; y++) temp[y][x] = t[y];
        }
        for (var y = 0; y < size; y++) {
            var row = new Float32Array(size);
            for (var x = 0; x < size; x++) row[x] = temp[y][x];
            var t = B.idct1d(row);
            for (var x = 0; x < size; x++) result[y][x] = clamp(Math.round(t[x] + 128), 0, 255);
        }
        return result;
    };

    // ═══ DWT / IDWT ═══
    var WAVELETS = {
        haar: {
            lo: [1/Math.SQRT2, 1/Math.SQRT2],
            hi: [1/Math.SQRT2, -1/Math.SQRT2],
            rlo: [1/Math.SQRT2, 1/Math.SQRT2],
            rhi: [-1/Math.SQRT2, 1/Math.SQRT2]
        },
        db2: {
            lo: [(1+Math.sqrt(3))/(4*Math.SQRT2),(3+Math.sqrt(3))/(4*Math.SQRT2),(3-Math.sqrt(3))/(4*Math.SQRT2),(1-Math.sqrt(3))/(4*Math.SQRT2)],
            hi: [(1-Math.sqrt(3))/(4*Math.SQRT2),-(3-Math.sqrt(3))/(4*Math.SQRT2),(3+Math.sqrt(3))/(4*Math.SQRT2),-(1+Math.sqrt(3))/(4*Math.SQRT2)],
            rlo: [(1-Math.sqrt(3))/(4*Math.SQRT2),(3-Math.sqrt(3))/(4*Math.SQRT2),(3+Math.sqrt(3))/(4*Math.SQRT2),(1+Math.sqrt(3))/(4*Math.SQRT2)],
            rhi: [-(1+Math.sqrt(3))/(4*Math.SQRT2),(3+Math.sqrt(3))/(4*Math.SQRT2),-(3-Math.sqrt(3))/(4*Math.SQRT2),(1-Math.sqrt(3))/(4*Math.SQRT2)]
        }
    };

    B.dwtForward1d = function(signal, wname, level) {
        var w = WAVELETS[wname || 'haar'] || WAVELETS.haar;
        var current = new Float32Array(signal), details = [];
        for (var l = 0; l < (level || 1); l++) {
            var N = current.length, half = Math.floor(N / 2);
            var approx = new Float32Array(half), detail = new Float32Array(half);
            for (var i = 0; i < half; i++) {
                var a = 0, d = 0;
                for (var j = 0; j < w.lo.length; j++) {
                    var idx = (2 * i + j) % N;
                    a += w.lo[j] * current[idx];
                    d += w.hi[j] * current[idx];
                }
                approx[i] = a; detail[i] = d;
            }
            details.unshift(detail);
            current = approx;
        }
        return { approx: current, details: details };
    };

    B.dwtInverse1d = function(approx, details, wname) {
        var w = WAVELETS[wname || 'haar'] || WAVELETS.haar;
        var current = new Float32Array(approx);
        for (var l = 0; l < details.length; l++) {
            var detail = details[l], N = current.length * 2;
            var result = new Float32Array(N);
            for (var i = 0; i < current.length; i++) {
                for (var j = 0; j < w.rlo.length; j++) {
                    var idx = (2 * i + j) % N;
                    result[idx] += w.rlo[j] * current[i] + w.rhi[j] * detail[i];
                }
            }
            current = result;
        }
        return current;
    };

    B.dwtForward2d = function(image, wname, level) {
        var h = image.length, w2 = image[0].length;
        var current = image.map(function(r) { return new Float32Array(r); });
        for (var l = 0; l < (level || 1); l++) {
            var ch = current.length, cw = current[0].length;
            var halfH = Math.floor(ch / 2), halfW = Math.floor(cw / 2);
            var rowT = create2DArray(ch, cw);
            for (var y = 0; y < ch; y++) {
                var r = B.dwtForward1d(current[y], wname, 1);
                for (var x = 0; x < halfW; x++) { rowT[y][x] = r.approx[x]; rowT[y][halfW + x] = r.details[0][x]; }
            }
            var res = create2DArray(ch, cw);
            for (var x = 0; x < cw; x++) {
                var col = new Float32Array(ch);
                for (var y = 0; y < ch; y++) col[y] = rowT[y][x];
                var r = B.dwtForward1d(col, wname, 1);
                for (var y = 0; y < halfH; y++) { res[y][x] = r.approx[y]; res[halfH + y][x] = r.details[0][y]; }
            }
            current = res;
        }
        return current;
    };

    B.dwtInverse2d = function(coeffs, wname, level) {
        var current = coeffs.map(function(r) { return new Float32Array(r); });
        for (var l = 0; l < (level || 1); l++) {
            var ch = current.length, cw = current[0].length;
            var halfH = Math.floor(ch / 2), halfW = Math.floor(cw / 2);
            var colR = create2DArray(ch, cw);
            for (var x = 0; x < cw; x++) {
                var a = new Float32Array(halfH), d = new Float32Array(halfH);
                for (var y = 0; y < halfH; y++) { a[y] = current[y][x]; d[y] = current[halfH + y][x]; }
                var rec = B.dwtInverse1d(a, [d], wname);
                for (var y = 0; y < ch; y++) colR[y][x] = rec[y];
            }
            var res = create2DArray(ch, cw);
            for (var y = 0; y < ch; y++) {
                var a = new Float32Array(halfW), d = new Float32Array(halfW);
                for (var x = 0; x < halfW; x++) { a[x] = colR[y][x]; d[x] = colR[y][halfW + x]; }
                var rec = B.dwtInverse1d(a, [d], wname);
                for (var x = 0; x < cw; x++) res[y][x] = rec[x];
            }
            current = res;
        }
        return current;
    };

    // ═══ Huffman ═══
    function HNode(sym, freq) { this.symbol = sym; this.freq = freq; this.left = null; this.right = null; }

    B.buildHuffmanTree = function(data) {
        var freq = new Map();
        for (var i = 0; i < data.length; i++) freq.set(data[i], (freq.get(data[i]) || 0) + 1);
        if (freq.size === 0) return { tree: null, codes: new Map(), freq: freq };
        if (freq.size === 1) { var s = freq.keys().next().value; return { tree: new HNode(s, data.length), codes: new Map([[s, '0']]), freq: freq }; }
        var nodes = [];
        freq.forEach(function(c, s) { nodes.push(new HNode(s, c)); });
        while (nodes.length > 1) {
            nodes.sort(function(a, b) { return a.freq - b.freq; });
            var l = nodes.shift(), r = nodes.shift();
            var p = new HNode(null, l.freq + r.freq); p.left = l; p.right = r;
            nodes.push(p);
        }
        var codes = new Map();
        (function trav(n, c) {
            if (n.symbol !== null) { codes.set(n.symbol, c); return; }
            if (n.left) trav(n.left, c + '0');
            if (n.right) trav(n.right, c + '1');
        })(nodes[0], '');
        return { tree: nodes[0], codes: codes, freq: freq };
    };

    B.huffmanEncode = function(data, codes) {
        var bits = '';
        for (var i = 0; i < data.length; i++) bits += codes.get(data[i]);
        return { bitString: bits, totalBits: bits.length };
    };

    // ═══ Shannon-Fano ═══
    B.buildShannonFanoCodes = function(data) {
        var freq = new Map();
        for (var i = 0; i < data.length; i++) freq.set(data[i], (freq.get(data[i]) || 0) + 1);
        var sorted = Array.from(freq.entries()).sort(function(a, b) { return b[1] - a[1]; });
        var codes = new Map();
        (function divide(syms, prefix) {
            if (syms.length === 0) return;
            if (syms.length === 1) { codes.set(syms[0][0], prefix || '0'); return; }
            var total = syms.reduce(function(s, e) { return s + e[1]; }, 0);
            var sum = 0, splitIdx = 0, minDiff = Infinity;
            for (var i = 0; i < syms.length - 1; i++) {
                sum += syms[i][1];
                var diff = Math.abs(2 * sum - total);
                if (diff < minDiff) { minDiff = diff; splitIdx = i + 1; }
            }
            divide(syms.slice(0, splitIdx), prefix + '0');
            divide(syms.slice(splitIdx), prefix + '1');
        })(sorted, '');
        return { codes: codes, freq: freq };
    };

    // ═══ RLE ═══
    B.rleEncode = function(data) {
        if (data.length === 0) return { runs: [], totalSymbols: 0 };
        var runs = [], cur = data[0], cnt = 1;
        for (var i = 1; i < data.length; i++) {
            if (data[i] === cur) cnt++;
            else { runs.push([cur, cnt]); cur = data[i]; cnt = 1; }
        }
        runs.push([cur, cnt]);
        return { runs: runs, totalSymbols: runs.length * 2 };
    };

    // ═══ Companding ═══
    B.muLawCompress = function(x, mu) { mu = mu || 255; return Math.sign(x) * Math.log(1 + mu * Math.abs(x)) / Math.log(1 + mu); };
    B.muLawExpand = function(y, mu) { mu = mu || 255; return Math.sign(y) * (Math.pow(1 + mu, Math.abs(y)) - 1) / mu; };
    B.aLawCompress = function(x, A) { A = A || 87.6; var ax = Math.abs(x), lnA = Math.log(A); return ax < 1/A ? Math.sign(x)*(A*ax)/(1+lnA) : Math.sign(x)*(1+Math.log(A*ax))/(1+lnA); };
    B.aLawExpand = function(y, A) { A = A || 87.6; var ay = Math.abs(y), lnA = Math.log(A); return ay < 1/(1+lnA) ? Math.sign(y)*ay*(1+lnA)/A : Math.sign(y)*Math.exp(ay*(1+lnA)-1)/A; };

    // ═══ Linear Prediction ═══
    B.autocorrelation = function(sig, maxLag) {
        var N = sig.length, r = new Float32Array(maxLag + 1);
        for (var lag = 0; lag <= maxLag; lag++) { var s = 0; for (var i = 0; i < N - lag; i++) s += sig[i] * sig[i + lag]; r[lag] = s; }
        return r;
    };

    B.levinsonDurbin = function(r, order) {
        var a = new Float32Array(order), aT = new Float32Array(order), E = r[0];
        for (var i = 0; i < order; i++) {
            var lam = 0;
            for (var j = 0; j < i; j++) lam += a[j] * r[i - j];
            lam = (r[i + 1] - lam) / E;
            aT.set(a); a[i] = lam;
            for (var j = 0; j < i; j++) a[j] = aT[j] - lam * aT[i - 1 - j];
            E *= (1 - lam * lam);
        }
        return { coefficients: a, predictionError: E };
    };

    B.linearPredict = function(sig, coeffs) {
        var N = sig.length, order = coeffs.length;
        var pred = new Float32Array(N), err = new Float32Array(N);
        for (var i = 0; i < N; i++) {
            var p = 0;
            for (var j = 0; j < order; j++) if (i - j - 1 >= 0) p += coeffs[j] * sig[i - j - 1];
            pred[i] = p; err[i] = sig[i] - p;
        }
        return { predicted: pred, error: err };
    };

    B.linearPredictReconstruct = function(err, coeffs) {
        var N = err.length, order = coeffs.length, rec = new Float32Array(N);
        for (var i = 0; i < N; i++) {
            var p = 0;
            for (var j = 0; j < order; j++) if (i - j - 1 >= 0) p += coeffs[j] * rec[i - j - 1];
            rec[i] = p + err[i];
        }
        return rec;
    };

    // JPEG Q50 matrix
    B.JPEG_Q50 = [[16,11,10,16,24,40,51,61],[12,12,14,19,26,58,60,55],[14,13,16,24,40,57,69,56],[14,17,22,29,51,87,80,62],[18,22,37,56,68,109,103,77],[24,35,55,64,81,104,113,92],[49,64,78,87,103,121,120,101],[72,92,95,98,112,100,103,99]];

    B.scaleQuantMatrix = function(quality) {
        var S = quality < 50 ? 5000 / quality : 200 - 2 * quality;
        var qm = create2DArray(8, 8);
        for (var y = 0; y < 8; y++)
            for (var x = 0; x < 8; x++)
                qm[y][x] = clamp(Math.floor((B.JPEG_Q50[y][x] * S + 50) / 100), 1, 255);
        return qm;
    };

    // ═══ FFT (Radix-2 Cooley-Tukey) ═══
    // Returns magnitude spectrum (real-valued array of length N/2)
    B.fft = function(signal) {
        // Pad to next power of 2
        var N = 1;
        while (N < signal.length) N <<= 1;
        var real = new Float32Array(N);
        var imag = new Float32Array(N);
        for (var i = 0; i < signal.length; i++) real[i] = signal[i];

        // Bit-reversal permutation
        var bits = Math.log2(N);
        for (var i = 0; i < N; i++) {
            var j = 0;
            for (var b = 0; b < bits; b++) j = (j << 1) | ((i >> b) & 1);
            if (j > i) {
                var tmp = real[i]; real[i] = real[j]; real[j] = tmp;
                tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp;
            }
        }

        // Butterfly
        for (var size = 2; size <= N; size <<= 1) {
            var half = size >> 1;
            var angle = -2 * Math.PI / size;
            for (var i = 0; i < N; i += size) {
                for (var k = 0; k < half; k++) {
                    var wR = Math.cos(angle * k);
                    var wI = Math.sin(angle * k);
                    var tR = wR * real[i + k + half] - wI * imag[i + k + half];
                    var tI = wR * imag[i + k + half] + wI * real[i + k + half];
                    real[i + k + half] = real[i + k] - tR;
                    imag[i + k + half] = imag[i + k] - tI;
                    real[i + k] += tR;
                    imag[i + k] += tI;
                }
            }
        }

        return { real: real, imag: imag, N: N };
    };

    // Returns magnitude spectrum array (dB scale, length N/2)
    B.fftMagnitude = function(signal, dB) {
        var result = B.fft(signal);
        var N = result.N;
        var half = N >> 1;
        var mag = new Float32Array(half);
        for (var i = 0; i < half; i++) {
            mag[i] = Math.sqrt(result.real[i] * result.real[i] + result.imag[i] * result.imag[i]) / N;
        }
        if (dB) {
            for (var i = 0; i < half; i++) {
                mag[i] = 20 * Math.log10(Math.max(mag[i], 1e-10));
            }
        }
        return mag;
    };

    // 2D FFT magnitude for images — flatten rows, compute average row spectrum
    B.fft2DMagnitude = function(data2d) {
        var h = data2d.length, w = data2d[0].length;
        var half = 1;
        while (half < w) half <<= 1;
        half >>= 1;
        var avgMag = new Float32Array(half);

        for (var y = 0; y < h; y++) {
            var row = new Float32Array(w);
            for (var x = 0; x < w; x++) row[x] = data2d[y][x];
            var mag = B.fftMagnitude(row, true);
            for (var i = 0; i < Math.min(mag.length, half); i++) avgMag[i] += mag[i];
        }
        for (var i = 0; i < half; i++) avgMag[i] /= h;
        return avgMag;
    };

    // Helper: flatten 2D array to 1D
    B.flatten2D = function(data2d) {
        var h = data2d.length, w = data2d[0].length;
        var flat = new Float32Array(h * w);
        var idx = 0;
        for (var y = 0; y < h; y++)
            for (var x = 0; x < w; x++)
                flat[idx++] = data2d[y][x];
        return flat;
    };
})(window.BYOC);
