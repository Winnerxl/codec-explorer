/**
 * Visualizer — Canvas-based rendering for pipeline step outputs
 */
(function(B) {
    var clamp = B.clamp, flatten2D = B.flatten2D;

    var VIZ_COLORS = {
        signal: '#6366f1',
        signalFill: 'rgba(99,102,241,0.15)',
        predicted: '#f59e0b',
        error: '#ef4444',
        errorFill: 'rgba(239,68,68,0.1)',
        reconstructed: '#10b981',
        grid: 'rgba(255,255,255,0.06)',
        gridText: 'rgba(255,255,255,0.3)',
        axis: 'rgba(255,255,255,0.15)',
        bg: '#12121a',
        positive: '#3b82f6',
        negative: '#ef4444',
        zero: '#1a1a2e'
    };

    function clearCanvas(canvas) {
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = VIZ_COLORS.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function drawGrid(ctx, w, h, xSteps, ySteps) {
        xSteps = xSteps || 5;
        ySteps = ySteps || 4;
        ctx.strokeStyle = VIZ_COLORS.grid;
        ctx.lineWidth = 0.5;
        for (var i = 0; i <= xSteps; i++) {
            var x = (i / xSteps) * w;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (var i = 0; i <= ySteps; i++) {
            var y = (i / ySteps) * h;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
    }

    function drawWaveform(canvas, data, options) {
        options = options || {};
        var ctx = canvas.getContext('2d');
        var w = canvas.width, h = canvas.height;
        var pad = { top: 10, right: 10, bottom: 10, left: 10 };
        var pw = w - pad.left - pad.right, ph = h - pad.top - pad.bottom;

        clearCanvas(canvas);
        drawGrid(ctx, w, h);
        if (!data || data.length === 0) return;

        var minVal = Infinity, maxVal = -Infinity;
        for (var i = 0; i < data.length; i++) {
            if (data[i] < minVal) minVal = data[i];
            if (data[i] > maxVal) maxVal = data[i];
        }
        var range = maxVal - minVal || 1;
        var color = options.color || VIZ_COLORS.signal;
        var fillColor = options.fillColor || VIZ_COLORS.signalFill;

        // Fill
        ctx.beginPath();
        var zeroY = pad.top + (1 - (0 - minVal) / range) * ph;
        ctx.moveTo(pad.left, clamp(zeroY, pad.top, pad.top + ph));
        for (var i = 0; i < data.length; i++) {
            var x = pad.left + (i / (data.length - 1)) * pw;
            var y = pad.top + (1 - (data[i] - minVal) / range) * ph;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(pad.left + pw, clamp(zeroY, pad.top, pad.top + ph));
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();

        // Line
        ctx.beginPath();
        for (var i = 0; i < data.length; i++) {
            var x = pad.left + (i / (data.length - 1)) * pw;
            var y = pad.top + (1 - (data[i] - minVal) / range) * ph;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Zero line
        if (minVal < 0 && maxVal > 0) {
            ctx.beginPath();
            ctx.moveTo(pad.left, zeroY);
            ctx.lineTo(pad.left + pw, zeroY);
            ctx.strokeStyle = VIZ_COLORS.axis;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    function drawBarChart(canvas, data) {
        var ctx = canvas.getContext('2d');
        var w = canvas.width, h = canvas.height;
        var pad = { top: 10, right: 10, bottom: 10, left: 10 };
        var pw = w - pad.left - pad.right, ph = h - pad.top - pad.bottom;

        clearCanvas(canvas);
        drawGrid(ctx, w, h);
        if (!data || data.length === 0) return;

        var maxAbs = 0;
        for (var i = 0; i < data.length; i++) maxAbs = Math.max(maxAbs, Math.abs(data[i]));
        maxAbs = maxAbs || 1;

        var barW = Math.max(1, pw / data.length - 0.5);
        var midY = pad.top + ph / 2;

        for (var i = 0; i < data.length; i++) {
            var x = pad.left + (i / data.length) * pw;
            var barH = (data[i] / maxAbs) * (ph / 2);
            ctx.fillStyle = data[i] >= 0 ? VIZ_COLORS.positive : VIZ_COLORS.negative;
            ctx.fillRect(x, midY - Math.max(0, barH), barW, Math.abs(barH));
        }
        ctx.beginPath();
        ctx.moveTo(pad.left, midY);
        ctx.lineTo(pad.left + pw, midY);
        ctx.strokeStyle = VIZ_COLORS.axis;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    function drawHeatmap(canvas, data2d, options) {
        options = options || {};
        var ctx = canvas.getContext('2d');
        var w = canvas.width, h = canvas.height;
        clearCanvas(canvas);
        if (!data2d || data2d.length === 0) return;

        var rows = data2d.length, cols = data2d[0].length;
        var cellW = w / cols, cellH = h / rows;
        var isGrayscale = options.grayscale;

        var minVal = Infinity, maxVal = -Infinity;
        for (var y = 0; y < rows; y++)
            for (var x = 0; x < cols; x++) {
                if (data2d[y][x] < minVal) minVal = data2d[y][x];
                if (data2d[y][x] > maxVal) maxVal = data2d[y][x];
            }

        for (var y = 0; y < rows; y++) {
            for (var x = 0; x < cols; x++) {
                var val = data2d[y][x];
                var color;
                if (isGrayscale) {
                    var v = clamp(Math.round(val), 0, 255);
                    color = 'rgb(' + v + ',' + v + ',' + v + ')';
                } else if (options.signed || minVal < 0) {
                    var maxAbs = Math.max(Math.abs(minVal), Math.abs(maxVal)) || 1;
                    if (val >= 0) {
                        var intensity = clamp(Math.round((val / maxAbs) * 200 + 55), 55, 255);
                        color = 'rgb(30,50,' + intensity + ')';
                    } else {
                        var intensity = clamp(Math.round((Math.abs(val) / maxAbs) * 200 + 55), 55, 255);
                        color = 'rgb(' + intensity + ',30,30)';
                    }
                } else {
                    var rng = maxVal - minVal || 1;
                    var norm = (val - minVal) / rng;
                    var v = clamp(Math.round(norm * 255), 0, 255);
                    color = 'rgb(' + v + ',' + v + ',' + v + ')';
                }
                ctx.fillStyle = color;
                ctx.fillRect(Math.floor(x * cellW), Math.floor(y * cellH), Math.ceil(cellW), Math.ceil(cellH));
            }
        }

        if (cols <= 32) {
            ctx.strokeStyle = 'rgba(255,255,255,0.03)';
            ctx.lineWidth = 0.5;
            for (var x = 0; x <= cols; x++) {
                ctx.beginPath(); ctx.moveTo(x * cellW, 0); ctx.lineTo(x * cellW, h); ctx.stroke();
            }
            for (var y = 0; y <= rows; y++) {
                ctx.beginPath(); ctx.moveTo(0, y * cellH); ctx.lineTo(w, y * cellH); ctx.stroke();
            }
        }
    }

    function drawComparisonWaveform(canvas, original, reconstructed) {
        var ctx = canvas.getContext('2d');
        var w = canvas.width, h = canvas.height;
        var pad = { top: 10, right: 10, bottom: 10, left: 10 };
        var pw = w - pad.left - pad.right, ph = h - pad.top - pad.bottom;

        clearCanvas(canvas);
        drawGrid(ctx, w, h);
        if (!original || !reconstructed) return;

        var minVal = Infinity, maxVal = -Infinity;
        for (var i = 0; i < original.length; i++) {
            minVal = Math.min(minVal, original[i], reconstructed[i] || 0);
            maxVal = Math.max(maxVal, original[i], reconstructed[i] || 0);
        }
        var range = maxVal - minVal || 1;

        function plotLine(data, color, lineWidth) {
            ctx.beginPath();
            for (var i = 0; i < data.length; i++) {
                var x = pad.left + (i / (data.length - 1)) * pw;
                var y = pad.top + (1 - (data[i] - minVal) / range) * ph;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth || 1.5;
            ctx.stroke();
        }

        plotLine(original, VIZ_COLORS.signal, 1.5);
        plotLine(reconstructed, VIZ_COLORS.reconstructed, 1.5);
    }

    function drawErrorMap(canvas, data2d) {
        var ctx = canvas.getContext('2d');
        var w = canvas.width, h = canvas.height;
        clearCanvas(canvas);
        if (!data2d || data2d.length === 0) return;

        var rows = data2d.length, cols = data2d[0].length;
        var cellW = w / cols, cellH = h / rows;

        var maxErr = 0;
        for (var y = 0; y < rows; y++)
            for (var x = 0; x < cols; x++)
                maxErr = Math.max(maxErr, Math.abs(data2d[y][x]));

        // Use absolute scale: floor at 1.0 so floating-point noise near zero
        // isn't amplified to full red. For images with pixel range 0-255,
        // an error < 1.0 is sub-pixel and visually meaningless.
        var scale = Math.max(maxErr, 1.0);

        for (var y = 0; y < rows; y++) {
            for (var x = 0; x < cols; x++) {
                var norm = Math.abs(data2d[y][x]) / scale;
                var r = clamp(Math.round(norm * 255), 0, 255);
                var g = clamp(Math.round(norm * 50), 0, 50);
                ctx.fillStyle = 'rgb(' + r + ',' + g + ',0)';
                ctx.fillRect(Math.floor(x * cellW), Math.floor(y * cellH), Math.ceil(cellW), Math.ceil(cellH));
            }
        }

        // Show max error label so user knows the actual magnitude
        var label = 'Max err: ' + (maxErr < 0.01 ? '≈0' : maxErr.toFixed(1));
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(w - ctx.measureText(label).width - 12, 2, ctx.measureText(label).width + 8, 16);
        ctx.fillStyle = '#e8e8f0';
        ctx.fillText(label, w - ctx.measureText(label).width - 8, 13);
    }

    function drawCodeTable(canvas, codeTable, maxEntries) {
        maxEntries = maxEntries || 12;
        var ctx = canvas.getContext('2d');
        var w = canvas.width, h = canvas.height;
        clearCanvas(canvas);
        if (!codeTable || codeTable.length === 0) return;

        var entries = codeTable.slice(0, maxEntries);
        var rowH = Math.min(20, (h - 30) / entries.length);
        var startY = 10;

        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillStyle = VIZ_COLORS.gridText;
        ctx.fillText('Symbol', 10, startY);
        ctx.fillText('Code', w * 0.35, startY);
        ctx.fillText('Prob', w * 0.7, startY);

        ctx.strokeStyle = VIZ_COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(5, startY + 6);
        ctx.lineTo(w - 5, startY + 6);
        ctx.stroke();

        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var y = startY + (i + 1) * rowH + 4;
            ctx.fillStyle = '#e8e8f0';
            ctx.fillText(String(e.symbol), 10, y);
            ctx.fillStyle = '#6366f1';
            ctx.fillText(e.code, w * 0.35, y);
            ctx.fillStyle = '#8888a0';
            ctx.fillText((e.prob * 100).toFixed(1) + '%', w * 0.7, y);
        }

        if (codeTable.length > maxEntries) {
            ctx.fillStyle = VIZ_COLORS.gridText;
            ctx.fillText('... +' + (codeTable.length - maxEntries) + ' more', 10, startY + (maxEntries + 1) * rowH + 4);
        }
    }

    function visualizeStep(canvas, stepResult) {
        var output = stepResult.output, blockDef = stepResult.blockDef;
        var cat = blockDef.category;

        if (cat === 'input') {
            if (output.type === 'signal_1d') drawWaveform(canvas, output.data);
            else if (output.type === 'image_2d') drawHeatmap(canvas, output.data, { grayscale: true });
        } else if (cat === 'transform') {
            if (output.type === 'coefficients_1d') drawBarChart(canvas, output.data);
            else if (output.type === 'coefficients_2d') drawHeatmap(canvas, output.data, { signed: true });
        } else if (cat === 'prediction') {
            if (output.predictionMeta) drawWaveform(canvas, output.data, { color: VIZ_COLORS.error, fillColor: VIZ_COLORS.errorFill });
            else drawWaveform(canvas, output.data);
        } else if (cat === 'quantization') {
            if (output.type === 'coefficients_2d' || output.type === 'image_2d') drawHeatmap(canvas, output.data, { signed: true });
            else drawBarChart(canvas, output.data);
        } else if (cat === 'entropy') {
            if (output.entropyMeta && output.entropyMeta.codeTable) drawCodeTable(canvas, output.entropyMeta.codeTable);
            else drawBarChart(canvas, output.data);
        } else if (cat === 'reconstruction') {
            if (output.type === 'image_2d') drawHeatmap(canvas, output.data, { grayscale: true });
            else if (output.type === 'signal_1d' && output.original) drawComparisonWaveform(canvas, output.original.data, output.data);
            else drawWaveform(canvas, output.data, { color: VIZ_COLORS.reconstructed });
        }
    }

    function drawSpectrum(canvas, magData, sampleRate, options) {
        options = options || {};
        var ctx = canvas.getContext('2d');
        var w = canvas.width, h = canvas.height;
        var pad = { top: 22, right: 12, bottom: 26, left: 44 };
        var pw = w - pad.left - pad.right;
        var ph = h - pad.top - pad.bottom;

        clearCanvas(canvas);
        if (!magData || magData.length === 0) return;

        // Title
        ctx.font = '600 10px Inter, sans-serif';
        ctx.fillStyle = '#f59e0b';
        ctx.textAlign = 'left';
        ctx.fillText('FREQUENCY SPECTRUM', pad.left, 14);

        var N = magData.length;
        var maxFreq = sampleRate ? sampleRate / 2 : N;

        // Find range
        var minDb = Infinity, maxDb = -Infinity;
        for (var i = 1; i < N; i++) { // skip DC
            if (magData[i] < minDb) minDb = magData[i];
            if (magData[i] > maxDb) maxDb = magData[i];
        }
        var dbRange = maxDb - minDb || 1;
        // Add some headroom
        minDb -= dbRange * 0.05;
        maxDb += dbRange * 0.05;

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 0.5;
        for (var gx = 0; gx <= 5; gx++) {
            var x = pad.left + (gx / 5) * pw;
            ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + ph); ctx.stroke();
        }
        for (var gy = 0; gy <= 4; gy++) {
            var y = pad.top + (gy / 4) * ph;
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke();
        }

        // Gradient fill under curve
        var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph);
        grad.addColorStop(0, options.fillTop || 'rgba(245, 158, 11, 0.25)');
        grad.addColorStop(1, options.fillBottom || 'rgba(245, 158, 11, 0.02)');

        ctx.beginPath();
        ctx.moveTo(pad.left, pad.top + ph);
        for (var i = 1; i < N; i++) {
            var x = pad.left + ((i - 1) / (N - 2)) * pw;
            var y = pad.top + ph - ((magData[i] - minDb) / (maxDb - minDb)) * ph;
            ctx.lineTo(x, clamp(y, pad.top, pad.top + ph));
        }
        ctx.lineTo(pad.left + pw, pad.top + ph);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        for (var i = 1; i < N; i++) {
            var x = pad.left + ((i - 1) / (N - 2)) * pw;
            var y = pad.top + ph - ((magData[i] - minDb) / (maxDb - minDb)) * ph;
            y = clamp(y, pad.top, pad.top + ph);
            i === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = options.lineColor || '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Axis labels
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.textAlign = 'center';

        // X axis — frequency
        for (var gx2 = 0; gx2 <= 5; gx2++) {
            var fVal = (gx2 / 5) * maxFreq;
            var label;
            if (fVal >= 1000) label = (fVal / 1000).toFixed(1) + 'k';
            else label = Math.round(fVal).toString();
            ctx.fillText(label, pad.left + (gx2 / 5) * pw, pad.top + ph + 14);
        }
        ctx.fillText('Hz', pad.left + pw + 2, pad.top + ph + 14);

        // Y axis — dB
        ctx.textAlign = 'right';
        for (var gy2 = 0; gy2 <= 4; gy2++) {
            var dbVal = maxDb - (gy2 / 4) * (maxDb - minDb);
            ctx.fillText(dbVal.toFixed(0), pad.left - 4, pad.top + (gy2 / 4) * ph + 3);
        }
        ctx.save();
        ctx.translate(10, pad.top + ph / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('dB', 0, 0);
        ctx.restore();
    }

    /**
     * Get spectrum data from a step's output. Returns { magData, sampleRate } or null.
     */
    function getSpectrumData(output) {
        if (!output) return null;
        try {
            if (output.type === 'signal_1d' && output.data && output.data.length > 4) {
                var sr = output.sampleRate || 8000;
                var mag = B.fftMagnitude(output.data, true);
                return { magData: mag, sampleRate: sr };
            }
            if (output.type === 'coefficients_1d' && output.data && output.data.length > 4) {
                var sr = output.sampleRate || 8000;
                var mag = B.fftMagnitude(output.data, true);
                return { magData: mag, sampleRate: sr };
            }
            if ((output.type === 'image_2d' || output.type === 'coefficients_2d') && output.data && output.data.length > 0) {
                var mag = B.fft2DMagnitude(output.data);
                return { magData: mag, sampleRate: output.width || output.data[0].length };
            }
        } catch (e) {
            return null;
        }
        return null;
    }

    B.clearCanvas = clearCanvas;
    B.drawWaveform = drawWaveform;
    B.drawBarChart = drawBarChart;
    B.drawHeatmap = drawHeatmap;
    B.drawComparisonWaveform = drawComparisonWaveform;
    B.drawErrorMap = drawErrorMap;
    B.drawCodeTable = drawCodeTable;
    B.drawSpectrum = drawSpectrum;
    B.getSpectrumData = getSpectrumData;
    B.visualizeStep = visualizeStep;
    B.VIZ_COLORS = VIZ_COLORS;
})(window.BYOC);
