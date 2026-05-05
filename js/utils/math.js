/**
 * Math utility functions — attaches to window.BYOC
 */
(function(B) {
    B.clamp = function(val, min, max) { return Math.max(min, Math.min(max, val)); };

    B.create2DArray = function(rows, cols, fill) {
        var arr = [];
        for (var i = 0; i < rows; i++) {
            arr[i] = new Float32Array(cols);
            if (fill) arr[i].fill(fill);
        }
        return arr;
    };

    B.linspace = function(start, end, n) {
        var arr = new Float32Array(n);
        var step = (end - start) / (n - 1);
        for (var i = 0; i < n; i++) arr[i] = start + i * step;
        return arr;
    };

    B.mean = function(arr) {
        var sum = 0;
        for (var i = 0; i < arr.length; i++) sum += arr[i];
        return sum / arr.length;
    };

    B.flatten2D = function(img) {
        var h = img.length, w = img[0].length;
        var flat = new Float32Array(h * w);
        for (var y = 0; y < h; y++)
            for (var x = 0; x < w; x++)
                flat[y * w + x] = img[y][x];
        return flat;
    };

    B.calculateEntropy = function(data) {
        var freq = new Map(), len = data.length;
        for (var i = 0; i < len; i++) {
            var v = Math.round(data[i]);
            freq.set(v, (freq.get(v) || 0) + 1);
        }
        var entropy = 0;
        for (var count of freq.values()) {
            var p = count / len;
            if (p > 0) entropy -= p * Math.log2(p);
        }
        return entropy;
    };
})(window.BYOC = window.BYOC || {});
