/**
 * Rate-Distortion Analysis Engine
 * Sweeps quantization parameters across the current pipeline and collects metrics.
 */
(function(B) {

    /**
     * Find the first quantization block in the pipeline and return its index + sweep config.
     */
    function findQuantBlock(steps) {
        for (var i = 0; i < steps.length; i++) {
            var step = steps[i];
            var id = step.blockDef.id;
            if (id === 'uniform_quantizer' || id === 'nonuniform_quantizer') {
                return { index: i, paramKey: 'bits', min: 1, max: 8, step: 1, label: 'Bits/sample', isRate: true };
            }
            if (id === 'jpeg_quantizer') {
                return { index: i, paramKey: 'quality', min: 1, max: 100, step: 5, label: 'JPEG Quality', isRate: false };
            }
        }
        return null;
    }

    /**
     * Run R-D sweep: execute the pipeline N times with different quantizer settings.
     * Returns an array of { paramValue, psnr, mse, snr, bitsPerSample, compressionRatio, entropy }
     */
    function runRDSweep(pipelineRunner, computeMetrics) {
        var steps = pipelineRunner.getSteps();
        var qInfo = findQuantBlock(steps);
        if (!qInfo) return { error: 'No quantization block found in pipeline. Add a Quantizer to see R-D curves.', data: [] };

        var results = [];
        var originalParams = {};
        // Save original param value
        var origStep = steps[qInfo.index];
        for (var k in origStep.params) originalParams[k] = origStep.params[k];

        // Generate sweep values
        var sweepValues = [];
        if (qInfo.paramKey === 'quality') {
            // JPEG quality: sweep from 1 to 100
            sweepValues = [1, 3, 5, 8, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 95, 100];
        } else {
            // Bits: 1 to 8
            for (var v = qInfo.min; v <= qInfo.max; v += qInfo.step) {
                sweepValues.push(v);
            }
        }

        for (var s = 0; s < sweepValues.length; s++) {
            var val = sweepValues[s];
            var paramUpdate = {};
            paramUpdate[qInfo.paramKey] = val;
            pipelineRunner.updateParams(qInfo.index, paramUpdate);

            var execResult = pipelineRunner.execute();
            var metrics = computeMetrics(execResult.results);

            var bitsPerSample;
            if (qInfo.paramKey === 'bits') {
                bitsPerSample = val;
            } else {
                // For JPEG quality, estimate bits from compression ratio
                bitsPerSample = metrics.avgBitsPerSample != null ? metrics.avgBitsPerSample : (8 / (metrics.compressionRatio || 1));
            }

            results.push({
                paramValue: val,
                paramLabel: qInfo.label,
                psnr: metrics.psnr != null ? metrics.psnr : 0,
                mse: metrics.mse != null ? metrics.mse : 0,
                snr: metrics.snr != null ? metrics.snr : 0,
                bitsPerSample: bitsPerSample,
                compressionRatio: metrics.compressionRatio != null ? metrics.compressionRatio : 1,
                entropy: metrics.entropy != null ? metrics.entropy : 0
            });
        }

        // Restore original params
        pipelineRunner.updateParams(qInfo.index, originalParams);
        pipelineRunner.execute(); // re-execute with original settings

        // Sort by bitsPerSample ascending
        results.sort(function(a, b) { return a.bitsPerSample - b.bitsPerSample; });

        return { error: null, data: results, sweepParam: qInfo.paramKey, sweepLabel: qInfo.label };
    }

    /**
     * Draw the R-D curve on a canvas element.
     */
    function drawRDCurve(canvas, rdData) {
        var ctx = canvas.getContext('2d');
        var W = canvas.width;
        var H = canvas.height;
        var pad = { top: 50, right: 40, bottom: 60, left: 70 };
        var plotW = W - pad.left - pad.right;
        var plotH = H - pad.top - pad.bottom;

        // Clear
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#0e0e16';
        ctx.fillRect(0, 0, W, H);

        if (!rdData || rdData.length === 0) {
            ctx.fillStyle = '#8888a0';
            ctx.font = '14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No data to display', W / 2, H / 2);
            return;
        }

        // Compute ranges
        var minRate = Infinity, maxRate = -Infinity;
        var minPsnr = Infinity, maxPsnr = -Infinity;
        for (var i = 0; i < rdData.length; i++) {
            var d = rdData[i];
            if (d.bitsPerSample < minRate) minRate = d.bitsPerSample;
            if (d.bitsPerSample > maxRate) maxRate = d.bitsPerSample;
            var psnr = d.psnr === Infinity ? 80 : d.psnr;
            if (psnr < minPsnr) minPsnr = psnr;
            if (psnr > maxPsnr) maxPsnr = psnr;
        }

        // Add padding to ranges
        var rateRange = maxRate - minRate || 1;
        var psnrRange = maxPsnr - minPsnr || 1;
        minRate -= rateRange * 0.05;
        maxRate += rateRange * 0.05;
        minPsnr -= psnrRange * 0.1;
        maxPsnr += psnrRange * 0.1;
        if (minPsnr < 0) minPsnr = 0;

        function mapX(rate) { return pad.left + ((rate - minRate) / (maxRate - minRate)) * plotW; }
        function mapY(psnr) { return pad.top + plotH - ((psnr - minPsnr) / (maxPsnr - minPsnr)) * plotH; }

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        var numGridX = 6, numGridY = 5;
        for (var gx = 0; gx <= numGridX; gx++) {
            var x = pad.left + (gx / numGridX) * plotW;
            ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotH); ctx.stroke();
        }
        for (var gy = 0; gy <= numGridY; gy++) {
            var y = pad.top + (gy / numGridY) * plotH;
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
        }

        // Axes border
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, pad.top);
        ctx.lineTo(pad.left, pad.top + plotH);
        ctx.lineTo(pad.left + plotW, pad.top + plotH);
        ctx.stroke();

        // Axis labels
        ctx.fillStyle = '#8888a0';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';

        // X-axis tick labels
        for (var gx2 = 0; gx2 <= numGridX; gx2++) {
            var xVal = minRate + (gx2 / numGridX) * (maxRate - minRate);
            var xPos = pad.left + (gx2 / numGridX) * plotW;
            ctx.fillText(xVal.toFixed(1), xPos, pad.top + plotH + 20);
        }

        // Y-axis tick labels
        ctx.textAlign = 'right';
        for (var gy2 = 0; gy2 <= numGridY; gy2++) {
            var yVal = maxPsnr - (gy2 / numGridY) * (maxPsnr - minPsnr);
            var yPos = pad.top + (gy2 / numGridY) * plotH;
            ctx.fillText(yVal.toFixed(1), pad.left - 10, yPos + 4);
        }

        // Axis titles
        ctx.fillStyle = '#a5b4fc';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Rate (bits/sample)', pad.left + plotW / 2, H - 12);

        ctx.save();
        ctx.translate(16, pad.top + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('PSNR (dB)', 0, 0);
        ctx.restore();

        // Title
        ctx.fillStyle = '#e8e8f0';
        ctx.font = '600 14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Rate–Distortion Curve', W / 2, 28);

        // Draw the curve — area fill
        ctx.beginPath();
        ctx.moveTo(mapX(rdData[0].bitsPerSample), mapY(0));
        for (var i2 = 0; i2 < rdData.length; i2++) {
            var p = rdData[i2].psnr === Infinity ? 80 : rdData[i2].psnr;
            ctx.lineTo(mapX(rdData[i2].bitsPerSample), mapY(p));
        }
        ctx.lineTo(mapX(rdData[rdData.length - 1].bitsPerSample), mapY(0));
        ctx.closePath();
        var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        grad.addColorStop(0, 'rgba(99, 102, 241, 0.15)');
        grad.addColorStop(1, 'rgba(99, 102, 241, 0.02)');
        ctx.fillStyle = grad;
        ctx.fill();

        // Draw the curve — line
        ctx.beginPath();
        for (var i3 = 0; i3 < rdData.length; i3++) {
            var psnr3 = rdData[i3].psnr === Infinity ? 80 : rdData[i3].psnr;
            var px = mapX(rdData[i3].bitsPerSample);
            var py = mapY(psnr3);
            if (i3 === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Draw data points
        for (var i4 = 0; i4 < rdData.length; i4++) {
            var psnr4 = rdData[i4].psnr === Infinity ? 80 : rdData[i4].psnr;
            var cx = mapX(rdData[i4].bitsPerSample);
            var cy = mapY(psnr4);

            // Outer glow
            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
            ctx.fill();

            // Inner dot
            ctx.beginPath();
            ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = '#6366f1';
            ctx.fill();
            ctx.strokeStyle = '#e8e8f0';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // Annotations: label a few key points
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillStyle = '#a5b4fc';
        ctx.textAlign = 'left';
        var labelIndices = [0, Math.floor(rdData.length / 2), rdData.length - 1];
        for (var li = 0; li < labelIndices.length; li++) {
            var idx = labelIndices[li];
            if (idx >= rdData.length) continue;
            var dp = rdData[idx];
            var dpPsnr = dp.psnr === Infinity ? 80 : dp.psnr;
            var lx = mapX(dp.bitsPerSample) + 8;
            var ly = mapY(dpPsnr) - 8;
            ctx.fillText(dp.paramLabel + '=' + dp.paramValue, lx, ly);
        }
    }

    /**
     * Draw a comparison R-D chart with multiple curves (for comparing codecs).
     */
    function drawMultiRDCurve(canvas, datasets) {
        var ctx = canvas.getContext('2d');
        var W = canvas.width;
        var H = canvas.height;
        var pad = { top: 50, right: 120, bottom: 60, left: 70 };
        var plotW = W - pad.left - pad.right;
        var plotH = H - pad.top - pad.bottom;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#0e0e16';
        ctx.fillRect(0, 0, W, H);

        if (!datasets || datasets.length === 0) return;

        var colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6'];

        // Global ranges
        var minRate = Infinity, maxRate = -Infinity, minPsnr = Infinity, maxPsnr = -Infinity;
        for (var ds = 0; ds < datasets.length; ds++) {
            var data = datasets[ds].data;
            for (var i = 0; i < data.length; i++) {
                if (data[i].bitsPerSample < minRate) minRate = data[i].bitsPerSample;
                if (data[i].bitsPerSample > maxRate) maxRate = data[i].bitsPerSample;
                var p = data[i].psnr === Infinity ? 80 : data[i].psnr;
                if (p < minPsnr) minPsnr = p;
                if (p > maxPsnr) maxPsnr = p;
            }
        }

        var rateRange = maxRate - minRate || 1;
        var psnrRange = maxPsnr - minPsnr || 1;
        minRate -= rateRange * 0.05; maxRate += rateRange * 0.05;
        minPsnr -= psnrRange * 0.1; maxPsnr += psnrRange * 0.1;
        if (minPsnr < 0) minPsnr = 0;

        function mapX(r) { return pad.left + ((r - minRate) / (maxRate - minRate)) * plotW; }
        function mapY(p) { return pad.top + plotH - ((p - minPsnr) / (maxPsnr - minPsnr)) * plotH; }

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (var gx = 0; gx <= 6; gx++) {
            var x = pad.left + (gx / 6) * plotW;
            ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotH); ctx.stroke();
        }
        for (var gy = 0; gy <= 5; gy++) {
            var y = pad.top + (gy / 5) * plotH;
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
        }

        // Axes
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, pad.top + plotH); ctx.lineTo(pad.left + plotW, pad.top + plotH);
        ctx.stroke();

        // Tick labels
        ctx.fillStyle = '#8888a0'; ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        for (var gx2 = 0; gx2 <= 6; gx2++) {
            var xV = minRate + (gx2 / 6) * (maxRate - minRate);
            ctx.fillText(xV.toFixed(1), pad.left + (gx2 / 6) * plotW, pad.top + plotH + 20);
        }
        ctx.textAlign = 'right';
        for (var gy2 = 0; gy2 <= 5; gy2++) {
            var yV = maxPsnr - (gy2 / 5) * (maxPsnr - minPsnr);
            ctx.fillText(yV.toFixed(1), pad.left - 10, pad.top + (gy2 / 5) * plotH + 4);
        }

        // Axis titles
        ctx.fillStyle = '#a5b4fc'; ctx.font = '12px Inter, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Rate (bits/sample)', pad.left + plotW / 2, H - 12);
        ctx.save(); ctx.translate(16, pad.top + plotH / 2); ctx.rotate(-Math.PI / 2);
        ctx.fillText('PSNR (dB)', 0, 0); ctx.restore();

        // Title
        ctx.fillStyle = '#e8e8f0'; ctx.font = '600 14px Inter, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Rate–Distortion Comparison', W / 2, 28);

        // Draw each dataset
        for (var ds2 = 0; ds2 < datasets.length; ds2++) {
            var color = colors[ds2 % colors.length];
            var ddata = datasets[ds2].data;

            // Line
            ctx.beginPath();
            for (var j = 0; j < ddata.length; j++) {
                var pp = ddata[j].psnr === Infinity ? 80 : ddata[j].psnr;
                var px2 = mapX(ddata[j].bitsPerSample);
                var py2 = mapY(pp);
                if (j === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Points
            for (var j2 = 0; j2 < ddata.length; j2++) {
                var pp2 = ddata[j2].psnr === Infinity ? 80 : ddata[j2].psnr;
                ctx.beginPath();
                ctx.arc(mapX(ddata[j2].bitsPerSample), mapY(pp2), 3, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
            }

            // Legend entry
            var legendY = pad.top + 10 + ds2 * 20;
            var legendX = pad.left + plotW + 15;
            ctx.beginPath();
            ctx.moveTo(legendX, legendY); ctx.lineTo(legendX + 18, legendY);
            ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
            ctx.beginPath();
            ctx.arc(legendX + 9, legendY, 3, 0, Math.PI * 2);
            ctx.fillStyle = color; ctx.fill();
            ctx.fillStyle = '#e8e8f0'; ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'left';
            ctx.fillText(datasets[ds2].name, legendX + 24, legendY + 4);
        }
    }

    // Export
    B.RDAnalysis = {
        findQuantBlock: findQuantBlock,
        runRDSweep: runRDSweep,
        drawRDCurve: drawRDCurve,
        drawMultiRDCurve: drawMultiRDCurve
    };

})(window.BYOC);
