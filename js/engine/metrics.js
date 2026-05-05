/**
 * Metrics Calculator — MSE, PSNR, SNR, Entropy, Compression Ratio
 */
(function(B) {
    var calculateEntropy = B.calculateEntropy, flatten2D = B.flatten2D;

    function get1DData(pipelineData) {
        if (!pipelineData) return null;
        if (pipelineData.type === 'signal_1d' || pipelineData.type === 'coefficients_1d') {
            return pipelineData.data;
        }
        if (pipelineData.type === 'image_2d' || pipelineData.type === 'coefficients_2d') {
            return flatten2D(pipelineData.data);
        }
        return pipelineData.data instanceof Float32Array ? pipelineData.data : null;
    }

    B.computeMetrics = function(pipelineResults) {
        var metrics = {
            entropy: null,
            avgBitsPerSample: null,
            compressionRatio: null,
            mse: null,
            psnr: null,
            snr: null,
            runtime: null,
            nonZeroRatio: null
        };

        if (!pipelineResults || pipelineResults.length === 0) return metrics;

        var firstResult = pipelineResults[0];
        var lastResult = pipelineResults[pipelineResults.length - 1];
        var originalData = firstResult.output;
        var finalData = lastResult.output;

        // Runtime
        var totalRuntime = 0;
        for (var i = 0; i < pipelineResults.length; i++) totalRuntime += pipelineResults[i].timing;
        metrics.runtime = totalRuntime;

        // Find entropy coding step
        var entropyCodingStep = null;
        for (var i = 0; i < pipelineResults.length; i++) {
            if (pipelineResults[i].output.entropyMeta) { entropyCodingStep = pipelineResults[i]; break; }
        }
        if (entropyCodingStep) {
            var em = entropyCodingStep.output.entropyMeta;
            metrics.avgBitsPerSample = em.avgBitsPerSymbol;
            metrics.compressionRatio = em.compressionRatio;
        }

        // Find quantization step
        var quantStep = null;
        for (var i = 0; i < pipelineResults.length; i++) {
            if (pipelineResults[i].output.quantMeta) { quantStep = pipelineResults[i]; break; }
        }
        if (quantStep && quantStep.output.quantMeta.nonZeroRatio != null) {
            metrics.nonZeroRatio = quantStep.output.quantMeta.nonZeroRatio;
        }

        // Entropy of input
        var inputData = get1DData(originalData);
        if (inputData) {
            metrics.entropy = calculateEntropy(inputData);
        }

        // MSE / PSNR / SNR
        var origRef = finalData.original || originalData;
        var orig1D = get1DData(origRef);
        var recon1D = get1DData(finalData);

        if (orig1D && recon1D && orig1D.length === recon1D.length) {
            var N = orig1D.length;
            var mse = 0, signalEnergy = 0, errorEnergy = 0;
            for (var i = 0; i < N; i++) {
                var diff = orig1D[i] - recon1D[i];
                mse += diff * diff;
                signalEnergy += orig1D[i] * orig1D[i];
                errorEnergy += diff * diff;
            }
            mse /= N;
            metrics.mse = mse;

            var maxVal = 255;
            if (origRef.type === 'signal_1d') {
                maxVal = 0;
                for (var i = 0; i < N; i++) maxVal = Math.max(maxVal, Math.abs(orig1D[i]));
                maxVal = maxVal || 1;
            }
            metrics.psnr = mse === 0 ? Infinity : 10 * Math.log10((maxVal * maxVal) / mse);
            metrics.snr = errorEnergy === 0 ? Infinity : 10 * Math.log10(signalEnergy / errorEnergy);
        } else if (orig1D && !recon1D) {
            metrics.entropy = calculateEntropy(orig1D);
        }

        // Compression ratio fallbacks
        if (!metrics.compressionRatio && entropyCodingStep) {
            var encoded = entropyCodingStep.output.encodedBits;
            var original = entropyCodingStep.output.originalBits;
            if (encoded && original) {
                metrics.compressionRatio = original / encoded;
            }
        }
        if (!metrics.compressionRatio && quantStep) {
            var bits = quantStep.output.quantMeta.bits;
            if (bits) {
                metrics.compressionRatio = 16 / bits;
            }
        }

        return metrics;
    };
})(window.BYOC);
