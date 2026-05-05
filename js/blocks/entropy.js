/**
 * Entropy Coding Blocks — Huffman, Shannon-Fano, RLE
 */
(function(B) {
    var buildHuffmanTree = B.buildHuffmanTree, huffmanEncode = B.huffmanEncode;
    var buildShannonFanoCodes = B.buildShannonFanoCodes, rleEncode = B.rleEncode;
    var flatten2D = B.flatten2D;

    function quantizeToIntegers(data) {
        var arr = new Array(data.length);
        for (var i = 0; i < data.length; i++) arr[i] = Math.round(data[i]);
        return arr;
    }

    function getData1D(input) {
        if (input.type === 'coefficients_2d' || input.type === 'image_2d') {
            return quantizeToIntegers(flatten2D(input.data));
        }
        return quantizeToIntegers(Array.from(input.data));
    }

    B.entropyBlocks = [
        {
            id: 'huffman',
            name: 'Huffman Coding',
            category: 'entropy',
            icon: '🌳',
            description: 'Optimal prefix-free code — assigns shorter codes to more frequent symbols',
            params: [],
            process: function(input) {
                var intData = getData1D(input);
                var huff = buildHuffmanTree(intData);
                var enc = huffmanEncode(intData, huff.codes);
                var originalBits = intData.length * 16;
                var avgBitsPerSymbol = enc.totalBits / intData.length;
                var codeTable = [];
                huff.codes.forEach(function(code, symbol) {
                    codeTable.push({ symbol: symbol, code: code, freq: huff.freq.get(symbol), prob: huff.freq.get(symbol) / intData.length });
                });
                codeTable.sort(function(a, b) { return b.freq - a.freq; });
                var out = {};
                for (var k in input) out[k] = input[k];
                out.encodedBits = enc.totalBits;
                out.originalBits = originalBits;
                out.entropyMeta = {
                    method: 'huffman', codes: huff.codes, tree: huff.tree, codeTable: codeTable,
                    avgBitsPerSymbol: avgBitsPerSymbol, compressionRatio: originalBits / enc.totalBits,
                    uniqueSymbols: huff.codes.size
                };
                out.metadata = Object.assign({}, input.metadata, { entropy: 'huffman' });
                return out;
            },
            getInfo: function() {
                return 'Huffman builds a binary tree from symbol frequencies. Most probable symbol gets shortest code. Achieves near-optimal compression.';
            }
        },
        {
            id: 'shannon_fano',
            name: 'Shannon-Fano',
            category: 'entropy',
            icon: '📊',
            description: 'Top-down divide-and-conquer coding — predecessor to Huffman',
            params: [],
            process: function(input) {
                var intData = getData1D(input);
                var sf = buildShannonFanoCodes(intData);
                var totalBits = 0;
                for (var i = 0; i < intData.length; i++) totalBits += sf.codes.get(intData[i]).length;
                var originalBits = intData.length * 16;
                var avgBitsPerSymbol = totalBits / intData.length;
                var codeTable = [];
                sf.codes.forEach(function(code, symbol) {
                    codeTable.push({ symbol: symbol, code: code, freq: sf.freq.get(symbol), prob: sf.freq.get(symbol) / intData.length });
                });
                codeTable.sort(function(a, b) { return b.freq - a.freq; });
                var out = {};
                for (var k in input) out[k] = input[k];
                out.encodedBits = totalBits;
                out.originalBits = originalBits;
                out.entropyMeta = {
                    method: 'shannon-fano', codes: sf.codes, codeTable: codeTable,
                    avgBitsPerSymbol: avgBitsPerSymbol, compressionRatio: originalBits / totalBits,
                    uniqueSymbols: sf.codes.size
                };
                out.metadata = Object.assign({}, input.metadata, { entropy: 'shannon-fano' });
                return out;
            },
            getInfo: function() {
                return 'Shannon-Fano divides symbols into two groups of roughly equal probability at each step. Simpler than Huffman but can be slightly suboptimal.';
            }
        },
        {
            id: 'rle',
            name: 'Run-Length Encoding',
            category: 'entropy',
            icon: '🔁',
            description: 'Encodes consecutive identical values — great for data with many zeros',
            params: [],
            process: function(input) {
                var intData = getData1D(input);
                var result = rleEncode(intData);
                var rleBits = result.runs.length * 24;
                var originalBits = intData.length * 16;
                var zeroRuns = result.runs.filter(function(r) { return r[0] === 0; });
                var totalZeros = 0;
                for (var i = 0; i < zeroRuns.length; i++) totalZeros += zeroRuns[i][1];
                var out = {};
                for (var k in input) out[k] = input[k];
                out.encodedBits = rleBits;
                out.originalBits = originalBits;
                out.entropyMeta = {
                    method: 'rle', runs: result.runs, totalRuns: result.runs.length,
                    avgBitsPerSymbol: rleBits / intData.length,
                    compressionRatio: originalBits / rleBits,
                    zeroPercentage: (totalZeros / intData.length * 100).toFixed(1)
                };
                out.metadata = Object.assign({}, input.metadata, { entropy: 'rle' });
                return out;
            },
            getInfo: function() {
                return 'RLE replaces runs of identical values with (value, count) pairs. Extremely effective after quantization when many coefficients are zero.';
            }
        }
    ];
})(window.BYOC);
