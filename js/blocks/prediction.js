/**
 * Prediction Blocks — Linear Predictor, DPCM
 */
(function(B) {
    var autocorrelation = B.autocorrelation, levinsonDurbin = B.levinsonDurbin, linearPredict = B.linearPredict;

    B.predictionBlocks = [
        {
            id: 'linear_predictor',
            name: 'Linear Predictor',
            category: 'prediction',
            icon: '📐',
            description: 'Predicts next sample from previous samples — produces prediction error signal',
            params: [
                { key: 'order', label: 'Predictor Order', type: 'select', options: [
                    { v: 1, l: '1st' }, { v: 2, l: '2nd' }, { v: 3, l: '3rd' }, { v: 4, l: '4th' }
                ], default: 2 }
            ],
            process: function(input, params) {
                if (input.type !== 'signal_1d') throw new Error('Linear Predictor requires 1D signal input');
                var order = params.order;
                var signal = input.data;
                var r = autocorrelation(signal, order);
                var ld = levinsonDurbin(r, order);
                var lp = linearPredict(signal, ld.coefficients);
                return {
                    type: 'signal_1d', data: lp.error, sampleRate: input.sampleRate,
                    original: input.original || input,
                    predictionMeta: { coefficients: Array.from(ld.coefficients), predicted: lp.predicted, originalSignal: signal, order: order },
                    metadata: { block: 'linear_predictor', order: order }
                };
            },
            getInfo: function() {
                return 'Exploits sample-to-sample correlation. Higher order captures more complex patterns but needs more side information. The error signal typically has lower entropy.';
            }
        },
        {
            id: 'dpcm',
            name: 'DPCM',
            category: 'prediction',
            icon: '📉',
            description: 'Differential PCM — 1st-order prediction, encodes differences',
            params: [
                { key: 'predictor', label: 'Predictor', type: 'select', options: [
                    { v: 'previous', l: 'Previous Sample' }, { v: 'average', l: 'Average of 2' }
                ], default: 'previous' }
            ],
            process: function(input, params) {
                if (input.type !== 'signal_1d') throw new Error('DPCM requires 1D signal input');
                var signal = input.data;
                var N = signal.length;
                var error = new Float32Array(N);
                var predicted = new Float32Array(N);
                if (params.predictor === 'previous') {
                    error[0] = signal[0];
                    for (var i = 1; i < N; i++) {
                        predicted[i] = signal[i - 1];
                        error[i] = signal[i] - predicted[i];
                    }
                } else {
                    error[0] = signal[0];
                    if (N > 1) { predicted[1] = signal[0]; error[1] = signal[1] - predicted[1]; }
                    for (var i = 2; i < N; i++) {
                        predicted[i] = (signal[i - 1] + signal[i - 2]) / 2;
                        error[i] = signal[i] - predicted[i];
                    }
                }
                return {
                    type: 'signal_1d', data: error, sampleRate: input.sampleRate,
                    original: input.original || input,
                    predictionMeta: { predicted: predicted, originalSignal: signal, type: params.predictor },
                    metadata: { block: 'dpcm', predictor: params.predictor }
                };
            },
            getInfo: function() {
                return 'DPCM subtracts a prediction of each sample, transmitting only the difference. For correlated signals, the error has much smaller dynamic range.';
            }
        }
    ];
})(window.BYOC);
