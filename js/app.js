/**
 * Build Your Own Codec — Main Application
 */
(function(B) {
    var registry = B.registry;
    var visualizeStep = B.visualizeStep;
    var drawWaveform = B.drawWaveform;
    var drawErrorMap = B.drawErrorMap;
    var drawComparisonWaveform = B.drawComparisonWaveform;
    var drawSpectrum = B.drawSpectrum;
    var getSpectrumData = B.getSpectrumData;
    var create2DArray = B.create2DArray;
    var computeMetrics = B.computeMetrics;

    // ── Register all blocks ──
    registry.registerAll(B.inputBlocks);
    registry.registerAll(B.transformBlocks);
    registry.registerAll(B.predictionBlocks);
    registry.registerAll(B.quantizationBlocks);
    registry.registerAll(B.entropyBlocks);
    registry.registerAll(B.reconstructionBlocks);

    // ── State ──
    var pipeline = new B.PipelineRunner();
    var lastResults = null;
    var lastMetrics = null;
    var audioContext = null;

    // ── Step-by-Step Mode State ──
    var stepModeActive = false;
    var currentStepIndex = 0;

    // ── Preset Pipelines ──
    var PRESETS = {
        jpeg_basic: {
            name: 'JPEG Basic',
            desc: 'Image → DCT 8×8 → JPEG Quantization → Huffman → IDCT',
            steps: [
                { blockId: 'image_sample', params: { pattern: 'texture', size: 64 } },
                { blockId: 'dct', params: { blockSize: 8 } },
                { blockId: 'jpeg_quantizer', params: { quality: 50 } },
                { blockId: 'huffman', params: {} },
                { blockId: 'idct', params: {} }
            ]
        },
        audio_dwt: {
            name: 'Audio DWT',
            desc: 'Sine Wave → DWT Haar → Uniform Quant → Shannon-Fano → IDWT',
            steps: [
                { blockId: 'signal_composite', params: { fundamental: 300, harmonics: 3, sampleRate: 8000, duration: 80 } },
                { blockId: 'dwt', params: { wavelet: 'haar', level: 2 } },
                { blockId: 'uniform_quantizer', params: { bits: 4 } },
                { blockId: 'shannon_fano', params: {} },
                { blockId: 'idwt', params: {} }
            ]
        },
        dpcm_system: {
            name: 'DPCM System',
            desc: 'Signal → DPCM → Uniform Quant → Huffman → Decoder',
            steps: [
                { blockId: 'signal_sine', params: { frequency: 440, amplitude: 0.8, sampleRate: 8000, duration: 50 } },
                { blockId: 'dpcm', params: { predictor: 'previous' } },
                { blockId: 'uniform_quantizer', params: { bits: 4 } },
                { blockId: 'huffman', params: {} },
                { blockId: 'dpcm_decoder', params: {} }
            ]
        },
        minimal: {
            name: 'Minimal',
            desc: 'Chirp Signal → Uniform Quant 4-bit',
            steps: [
                { blockId: 'signal_chirp', params: { f0: 100, f1: 2000, sampleRate: 8000, duration: 100 } },
                { blockId: 'uniform_quantizer', params: { bits: 4 } }
            ]
        }
    };

    // ── DOM References ──
    function $(sel) { return document.querySelector(sel); }

    // ── Initialize UI ──
    function init() {
        renderBlockPalette();
        renderPresetMenu();
        // Set up pipeline container drag-drop ONCE (not in renderPipeline)
        var pipelineContainer = $('#pipeline-blocks');
        if (pipelineContainer) setupPipelineDragDrop(pipelineContainer);
        loadPreset('jpeg_basic');
        setupEventListeners();
    }

    // ── Block Palette ──
    function renderBlockPalette() {
        var container = $('#block-palette-list');
        if (!container) return;
        container.innerHTML = '';

        var categories = registry.getAllCategories();
        for (var c = 0; c < categories.length; c++) {
            var cat = categories[c];
            var section = document.createElement('div');
            section.className = 'palette-category';
            section.innerHTML =
                '<button class="palette-category-header" data-category="' + cat.key + '">' +
                    '<span class="cat-icon">' + cat.icon + '</span>' +
                    '<span class="cat-label">' + cat.label + '</span>' +
                    '<span class="cat-chevron">▾</span>' +
                '</button>' +
                '<div class="palette-category-items expanded" id="palette-' + cat.key + '"></div>';
            container.appendChild(section);

            var itemsContainer = section.querySelector('.palette-category-items');
            for (var b = 0; b < cat.blocks.length; b++) {
                var block = cat.blocks[b];
                var item = document.createElement('div');
                item.className = 'palette-block';
                item.setAttribute('draggable', 'true');
                item.setAttribute('data-block-id', block.id);
                item.style.setProperty('--block-color', cat.color);
                item.innerHTML =
                    '<span class="block-icon">' + block.icon + '</span>' +
                    '<span class="block-name">' + block.name + '</span>';
                (function(blockId, itemEl) {
                    itemEl.addEventListener('dragstart', function(e) {
                        e.dataTransfer.setData('text/plain', blockId);
                        e.dataTransfer.effectAllowed = 'copy';
                        itemEl.classList.add('dragging');
                    });
                    itemEl.addEventListener('dragend', function() { itemEl.classList.remove('dragging'); });
                    itemEl.addEventListener('click', function() { addBlockToPipeline(blockId); });
                })(block.id, item);
                itemsContainer.appendChild(item);
            }
        }

        // Toggle categories
        var headers = container.querySelectorAll('.palette-category-header');
        for (var i = 0; i < headers.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var items = btn.nextElementSibling;
                    var chevron = btn.querySelector('.cat-chevron');
                    items.classList.toggle('expanded');
                    chevron.textContent = items.classList.contains('expanded') ? '▾' : '▸';
                });
            })(headers[i]);
        }
    }

    // ── Preset Menu ──
    function renderPresetMenu() {
        var container = $('#preset-list');
        if (!container) return;
        container.innerHTML = '';
        var keys = Object.keys(PRESETS);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var preset = PRESETS[key];
            var btn = document.createElement('button');
            btn.className = 'preset-btn';
            btn.setAttribute('data-preset', key);
            btn.innerHTML = '<strong>' + preset.name + '</strong><span>' + preset.desc + '</span>';
            (function(k) {
                btn.addEventListener('click', function() {
                    loadPreset(k);
                    $('#preset-dropdown').classList.remove('open');
                });
            })(key);
            container.appendChild(btn);
        }
    }

    function loadPreset(key) {
        var preset = PRESETS[key];
        if (!preset) return;
        pipeline.clear();
        for (var i = 0; i < preset.steps.length; i++) {
            var step = preset.steps[i];
            pipeline.addStep(step.blockId, Object.assign({}, step.params));
        }
        renderPipeline();
        executePipeline();
    }

    // ── Pipeline Rendering ──
    function renderPipeline() {
        var container = $('#pipeline-blocks');
        if (!container) return;
        container.innerHTML = '';

        var steps = pipeline.getSteps();
        if (steps.length === 0) {
            container.innerHTML =
                '<div class="pipeline-empty">' +
                    '<div class="empty-icon">🔧</div>' +
                    '<p>Drag blocks here to build your codec</p>' +
                    '<p class="empty-hint">or choose a preset above</p>' +
                '</div>';
            return;
        }

        for (var idx = 0; idx < steps.length; idx++) {
            var step = steps[idx];
            if (idx > 0) {
                var arrow = document.createElement('div');
                arrow.className = 'pipeline-arrow';
                arrow.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-4-4 4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
                container.appendChild(arrow);
            }

            var card = document.createElement('div');
            card.className = 'pipeline-block';
            card.setAttribute('data-index', idx);
            var cat = registry.categories[step.blockDef.category];
            card.style.setProperty('--block-color', cat ? cat.color : '#666');

            var isActive = lastResults && lastResults.results[idx];
            var hasError = lastResults && lastResults.error && lastResults.results.length === idx;
            if (isActive) card.classList.add('has-result');
            if (hasError) card.classList.add('has-error');

            // Step mode visual highlighting
            if (stepModeActive) {
                if (idx === currentStepIndex) card.classList.add('step-current');
                else if (idx < currentStepIndex) card.classList.add('step-done');
                else card.classList.add('step-future');
            }

            // Drag handle in header only — not the whole card
            card.innerHTML =
                '<div class="pipeline-block-header drag-handle" draggable="true" data-index="' + idx + '">' +
                    '<span class="block-icon">' + step.blockDef.icon + '</span>' +
                    '<span class="block-title">' + step.blockDef.name + '</span>' +
                    '<button class="block-remove" data-index="' + idx + '" title="Remove">×</button>' +
                '</div>' +
                '<div class="pipeline-block-params" id="params-' + step.instanceId + '"></div>';

            // Attach drag to HEADER only so sliders/selects are not hijacked
            (function(index, cardEl) {
                var handle = cardEl.querySelector('.drag-handle');
                handle.addEventListener('dragstart', function(e) {
                    e.dataTransfer.setData('application/pipeline-index', String(index));
                    e.dataTransfer.effectAllowed = 'move';
                    cardEl.classList.add('dragging');
                });
                handle.addEventListener('dragend', function() {
                    cardEl.classList.remove('dragging');
                    clearDropIndicator(container);
                });
            })(idx, card);

            container.appendChild(card);
            renderBlockParams(step, idx, card.querySelector('.pipeline-block-params'));
        }

        // Remove buttons
        var removeBtns = container.querySelectorAll('.block-remove');
        for (var i = 0; i < removeBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var idx = parseInt(btn.getAttribute('data-index'));
                    pipeline.removeStep(idx);
                    renderPipeline();
                    executePipeline();
                });
            })(removeBtns[i]);
        }
    }

    function renderBlockParams(step, index, container) {
        var blockDef = step.blockDef;
        if (!blockDef.params || blockDef.params.length === 0) return;

        for (var p = 0; p < blockDef.params.length; p++) {
            var param = blockDef.params[p];
            if (param.type === 'file') continue;

            var wrapper = document.createElement('div');
            wrapper.className = 'param-row';

            if (param.type === 'range') {
                var currentVal = step.params[param.key] !== undefined ? step.params[param.key] : param.default;
                wrapper.innerHTML =
                    '<label class="param-label">' +
                        '<span>' + param.label + '</span>' +
                        '<span class="param-value" id="pv-' + step.instanceId + '-' + param.key + '">' + currentVal + '</span>' +
                    '</label>' +
                    '<input type="range" class="param-slider" min="' + param.min + '" max="' + param.max + '" value="' + currentVal + '" step="' + (param.step || 1) + '" data-key="' + param.key + '" data-index="' + index + '">';
                (function(paramKey, idx, wr) {
                    var slider = wr.querySelector('input[type="range"]');
                    slider.addEventListener('input', function(e) {
                        var val = parseFloat(e.target.value);
                        wr.querySelector('.param-value').textContent = val;
                        pipeline.updateParams(idx, (function() { var o = {}; o[paramKey] = val; return o; })());
                        executePipeline();
                    });
                })(param.key, index, wrapper);
            } else if (param.type === 'select') {
                var currentVal = step.params[param.key] !== undefined ? step.params[param.key] : param.default;
                var optionsHtml = '';
                for (var o = 0; o < param.options.length; o++) {
                    var opt = param.options[o];
                    optionsHtml += '<option value="' + opt.v + '"' + (opt.v == currentVal ? ' selected' : '') + '>' + opt.l + '</option>';
                }
                wrapper.innerHTML =
                    '<label class="param-label"><span>' + param.label + '</span></label>' +
                    '<select class="param-select" data-key="' + param.key + '" data-index="' + index + '">' + optionsHtml + '</select>';
                (function(paramKey, idx, wr) {
                    var select = wr.querySelector('select');
                    select.addEventListener('change', function(e) {
                        var val = e.target.value;
                        if (!isNaN(val) && val !== '') val = parseFloat(val);
                        pipeline.updateParams(idx, (function() { var o = {}; o[paramKey] = val; return o; })());
                        executePipeline();
                    });
                })(param.key, index, wrapper);
            }
            container.appendChild(wrapper);
        }

        // File input handling
        var fileParam = null;
        for (var p = 0; p < blockDef.params.length; p++) {
            if (blockDef.params[p].type === 'file') { fileParam = blockDef.params[p]; break; }
        }
        if (fileParam) {
            var wrapper = document.createElement('div');
            wrapper.className = 'param-row';
            wrapper.innerHTML =
                '<label class="file-upload-btn">' +
                    '<span>📁 Choose File</span>' +
                    '<input type="file" accept="' + (fileParam.accept || '*') + '" hidden data-key="' + fileParam.key + '" data-index="' + index + '">' +
                '</label>';
            var fileInput = wrapper.querySelector('input[type="file"]');
            (function(idx, bDef) {
                fileInput.addEventListener('change', function(e) { handleFileUpload(e, idx, bDef); });
            })(index, blockDef);
            container.appendChild(wrapper);
        }
    }

    function handleFileUpload(e, index, blockDef) {
        var file = e.target.files[0];
        if (!file) return;

        if (blockDef.id === 'image_upload') {
            var reader = new FileReader();
            reader.onload = function(event) {
                var img = new Image();
                img.onload = function() {
                    var size = (pipeline.steps[index] && pipeline.steps[index].params.size) || 64;
                    var canvas = document.createElement('canvas');
                    canvas.width = size; canvas.height = size;
                    var ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, size, size);
                    var imgData = ctx.getImageData(0, 0, size, size);
                    var data = create2DArray(size, size);
                    for (var y = 0; y < size; y++)
                        for (var x = 0; x < size; x++) {
                            var i = (y * size + x) * 4;
                            data[y][x] = 0.299 * imgData.data[i] + 0.587 * imgData.data[i+1] + 0.114 * imgData.data[i+2];
                        }
                    pipeline.updateParams(index, { _imageData: data });
                    executePipeline();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        } else if (blockDef.id === 'audio_upload') {
            if (!audioContext) audioContext = new AudioContext();
            file.arrayBuffer().then(function(arrayBuffer) {
                return audioContext.decodeAudioData(arrayBuffer);
            }).then(function(audioBuffer) {
                var channelData = audioBuffer.getChannelData(0);
                pipeline.updateParams(index, { _audioData: new Float32Array(channelData), _sampleRate: audioBuffer.sampleRate });
                executePipeline();
            });
        }
    }

    // ── Drop Indicator ──
    function clearDropIndicator(container) {
        var existing = container.querySelectorAll('.drop-indicator');
        for (var i = 0; i < existing.length; i++) existing[i].parentNode.removeChild(existing[i]);
        var cards = container.querySelectorAll('.pipeline-block');
        for (var i = 0; i < cards.length; i++) cards[i].classList.remove('drop-before', 'drop-after');
    }

    function getDropIndex(container, clientX) {
        var cards = container.querySelectorAll('.pipeline-block');
        if (cards.length === 0) return 0;
        for (var i = 0; i < cards.length; i++) {
            var rect = cards[i].getBoundingClientRect();
            var midX = rect.left + rect.width / 2;
            if (clientX < midX) return i;
        }
        return cards.length;
    }

    function showDropIndicator(container, dropIdx) {
        clearDropIndicator(container);
        var cards = container.querySelectorAll('.pipeline-block');
        if (cards.length === 0) return;
        if (dropIdx < cards.length) {
            cards[dropIdx].classList.add('drop-before');
        } else if (cards.length > 0) {
            cards[cards.length - 1].classList.add('drop-after');
        }
    }

    // ── Pipeline Drag & Drop ──
    function setupPipelineDragDrop(container) {
        container.addEventListener('dragover', function(e) {
            e.preventDefault();
            var isReorder = e.dataTransfer.types.indexOf('application/pipeline-index') >= 0;
            e.dataTransfer.dropEffect = isReorder ? 'move' : 'copy';
            container.classList.add('drag-over');
            // Show visual drop indicator
            var dropIdx = getDropIndex(container, e.clientX);
            showDropIndicator(container, dropIdx);
        });
        container.addEventListener('dragleave', function(e) {
            // Only remove if actually leaving the container
            if (!container.contains(e.relatedTarget)) {
                container.classList.remove('drag-over');
                clearDropIndicator(container);
            }
        });
        container.addEventListener('drop', function(e) {
            e.preventDefault();
            container.classList.remove('drag-over');
            clearDropIndicator(container);
            var pipelineIndex = e.dataTransfer.getData('application/pipeline-index');
            var blockId = e.dataTransfer.getData('text/plain');
            if (pipelineIndex) {
                var from = parseInt(pipelineIndex);
                var to = getDropIndex(container, e.clientX);
                // Adjust target if moving forward
                if (to > from) to--;
                if (to < 0) to = 0;
                if (from !== to) {
                    pipeline.moveStep(from, to);
                    renderPipeline();
                    executePipeline();
                }
            } else if (blockId) {
                var dropIdx = getDropIndex(container, e.clientX);
                addBlockToPipeline(blockId, dropIdx);
            }
        });
    }

    function addBlockToPipeline(blockId, atIndex) {
        var blockDef = registry.get(blockId);
        if (!blockDef) return;
        var defaultParams = {};
        if (blockDef.params) {
            for (var i = 0; i < blockDef.params.length; i++) {
                var p = blockDef.params[i];
                if (p.default !== undefined) defaultParams[p.key] = p.default;
            }
        }
        if (atIndex !== undefined && atIndex < pipeline.steps.length) {
            pipeline.insertStep(atIndex, blockId, defaultParams);
        } else {
            pipeline.addStep(blockId, defaultParams);
        }
        renderPipeline();
        executePipeline();
    }

    // ── Pipeline Execution ──
    function executePipeline() {
        lastResults = pipeline.execute();
        lastMetrics = computeMetrics(lastResults.results);
        renderVisualizations();
        renderMetrics();
        renderError();
    }

    // ── Visualizations ──
    function renderVisualizations() {
        var container = $('#viz-container');
        if (!container) return;
        container.innerHTML = '';

        if (!lastResults || lastResults.results.length === 0) {
            container.innerHTML = '<div class="viz-empty"><p>Run a pipeline to see visualizations</p></div>';
            return;
        }

        // Determine which steps to show
        var maxStep = stepModeActive ? Math.min(currentStepIndex + 1, lastResults.results.length) : lastResults.results.length;

        for (var s = 0; s < maxStep; s++) {
            var stepResult = lastResults.results[s];
            var card = document.createElement('div');
            card.className = 'viz-card';
            // Highlight the current step in step mode
            if (stepModeActive && s === currentStepIndex) card.classList.add('viz-card-active');
            var cat = registry.categories[stepResult.blockDef.category];
            card.innerHTML =
                '<div class="viz-header" style="--block-color: ' + (cat ? cat.color : '#666') + '">' +
                    '<span>' + stepResult.blockDef.icon + ' ' + stepResult.blockDef.name + '</span>' +
                    '<span class="viz-time">' + stepResult.timing.toFixed(1) + 'ms</span>' +
                '</div>' +
                '<canvas class="viz-canvas" width="360" height="180"></canvas>' +
                '<div class="viz-info">' + stepResult.blockDef.getInfo() + '</div>';
            container.appendChild(card);

            var canvas = card.querySelector('canvas');
            try {
                visualizeStep(canvas, stepResult);
            } catch (err) {
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ef4444';
                ctx.font = '12px Inter';
                ctx.fillText('Visualization error: ' + err.message, 10, 90);
            }

            // Add frequency spectrum canvas if data supports it
            var specData = getSpectrumData(stepResult.output);
            if (specData) {
                var specCanvas = document.createElement('canvas');
                specCanvas.className = 'viz-canvas viz-canvas-spectrum';
                specCanvas.width = 360;
                specCanvas.height = 120;
                card.insertBefore(specCanvas, card.querySelector('.viz-info'));
                try {
                    drawSpectrum(specCanvas, specData.magData, specData.sampleRate);
                } catch (e) {
                    // silently skip if FFT fails
                }
            }
        }

        // Error signal / comparison (only in non-step mode, or at the last step)
        if (!stepModeActive || currentStepIndex >= lastResults.results.length - 1) {
            var lastResult2 = lastResults.results[maxStep - 1];
            var reconData = lastResult2 ? lastResult2.output : null;

            if (reconData && reconData.original) {
                var errorCard = document.createElement('div');
                errorCard.className = 'viz-card viz-card-error';
                errorCard.innerHTML =
                    '<div class="viz-header" style="--block-color: #ef4444">' +
                        '<span>⚠️ Error Signal</span>' +
                    '</div>' +
                    '<canvas class="viz-canvas" width="360" height="180"></canvas>';
                container.appendChild(errorCard);

                var errorCanvas = errorCard.querySelector('canvas');
                if (reconData.type === 'image_2d' && reconData.original && reconData.original.type === 'image_2d') {
                    var orig = reconData.original.data;
                    var recon = reconData.data;
                    var h = orig.length, w = orig[0].length;
                    var errorImg = create2DArray(h, w);
                    for (var y = 0; y < h; y++)
                        for (var x = 0; x < w; x++)
                            errorImg[y][x] = orig[y][x] - recon[y][x];
                    drawErrorMap(errorCanvas, errorImg);
                } else if (reconData.type === 'signal_1d' && reconData.original && reconData.original.data) {
                    var orig2 = reconData.original.data;
                    var recon2 = reconData.data;
                    var N = Math.min(orig2.length, recon2.length);
                    var err2 = new Float32Array(N);
                    for (var i = 0; i < N; i++) err2[i] = orig2[i] - recon2[i];
                    drawWaveform(errorCanvas, err2, { color: '#ef4444', fillColor: 'rgba(239,68,68,0.1)' });
                }
            }
        }

        // Auto-scroll to the current step's viz card in step mode
        if (stepModeActive) {
            var activeCard = container.querySelector('.viz-card-active');
            if (activeCard) activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    // ── Metrics ──
    function renderMetrics() {
        var metricsData = [
            { id: 'metric-entropy', value: lastMetrics ? lastMetrics.entropy : null, format: function(v) { return v != null ? v.toFixed(3) + ' bits' : '—'; } },
            { id: 'metric-avgbits', value: lastMetrics ? lastMetrics.avgBitsPerSample : null, format: function(v) { return v != null ? v.toFixed(2) + ' bits/sym' : '—'; } },
            { id: 'metric-cr', value: lastMetrics ? lastMetrics.compressionRatio : null, format: function(v) { return v != null ? v.toFixed(2) + '×' : '—'; } },
            { id: 'metric-mse', value: lastMetrics ? lastMetrics.mse : null, format: function(v) { return v != null ? v.toFixed(4) : '—'; } },
            { id: 'metric-psnr', value: lastMetrics ? lastMetrics.psnr : null, format: function(v) { return v === Infinity ? '∞' : (v != null ? v.toFixed(2) + ' dB' : '—'); } },
            { id: 'metric-snr', value: lastMetrics ? lastMetrics.snr : null, format: function(v) { return v === Infinity ? '∞' : (v != null ? v.toFixed(2) + ' dB' : '—'); } },
            { id: 'metric-runtime', value: lastMetrics ? lastMetrics.runtime : null, format: function(v) { return v != null ? v.toFixed(2) + ' ms' : '—'; } }
        ];

        for (var i = 0; i < metricsData.length; i++) {
            var m = metricsData[i];
            var el = $('#' + m.id);
            if (el) {
                var val = m.format(m.value);
                el.classList.add('metric-update');
                el.textContent = val;
                (function(elem) {
                    setTimeout(function() { elem.classList.remove('metric-update'); }, 300);
                })(el);
            }
        }
    }

    function renderError() {
        var errorEl = $('#pipeline-error');
        if (!errorEl) return;
        if (lastResults && lastResults.error) {
            errorEl.textContent = lastResults.error;
            errorEl.style.display = 'block';
        } else {
            errorEl.style.display = 'none';
        }
    }

    // ── Audio Playback ──
    function playAudio(data, sampleRate) {
        if (!audioContext) audioContext = new AudioContext();
        var buffer = audioContext.createBuffer(1, data.length, sampleRate);
        buffer.getChannelData(0).set(data);
        var source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start();
        return source;
    }

    function setupAudioPlayback() {
        var playOrigBtn = $('#play-original');
        var playReconBtn = $('#play-reconstructed');

        if (playOrigBtn) {
            playOrigBtn.addEventListener('click', function() {
                if (!lastResults || !lastResults.results || !lastResults.results.length) return;
                var first = lastResults.results[0].output;
                if (first.type === 'signal_1d') playAudio(first.data, first.sampleRate || 8000);
            });
        }
        if (playReconBtn) {
            playReconBtn.addEventListener('click', function() {
                if (!lastResults || !lastResults.results || !lastResults.results.length) return;
                var last = lastResults.results[lastResults.results.length - 1].output;
                if (last.type === 'signal_1d') playAudio(last.data, last.sampleRate || 8000);
            });
        }
    }

    // ── Event Listeners ──
    function setupEventListeners() {
        var presetBtn = $('#preset-toggle');
        var presetDropdown = $('#preset-dropdown');
        if (presetBtn && presetDropdown) {
            presetBtn.addEventListener('click', function() { presetDropdown.classList.toggle('open'); });
            document.addEventListener('click', function(e) {
                if (!presetBtn.contains(e.target) && !presetDropdown.contains(e.target)) {
                    presetDropdown.classList.remove('open');
                }
            });
        }

        var clearBtn = $('#clear-pipeline');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                pipeline.clear();
                lastResults = null;
                lastMetrics = null;
                // Exit step mode on clear
                if (stepModeActive) toggleStepMode(false);
                renderPipeline();
                renderVisualizations();
                renderMetrics();
                renderError();
            });
        }

        var runBtn = $('#run-pipeline');
        if (runBtn) {
            runBtn.addEventListener('click', function() { executePipeline(); });
        }

        setupAudioPlayback();
        setupStepMode();
        setupRDAnalysis();
    }

    // ── Step-by-Step Mode ──
    function toggleStepMode(forceState) {
        stepModeActive = forceState !== undefined ? forceState : !stepModeActive;

        var stepBtn = $('#btn-step-mode');
        var stepNav = $('#step-nav');

        if (stepModeActive) {
            var steps = pipeline.getSteps();
            if (steps.length === 0) {
                stepModeActive = false;
                return;
            }
            currentStepIndex = 0;
            stepBtn.classList.add('step-active');
            stepNav.style.display = 'flex';
            updateStepUI();
            renderPipeline();
            renderVisualizations();
        } else {
            currentStepIndex = 0;
            stepBtn.classList.remove('step-active');
            stepNav.style.display = 'none';
            renderPipeline();
            renderVisualizations();
        }
    }

    function updateStepUI() {
        var steps = pipeline.getSteps();
        var total = steps.length;
        if (total === 0) return;

        var idx = Math.min(currentStepIndex, total - 1);
        var step = steps[idx];

        $('#step-counter').textContent = (idx + 1) + ' / ' + total;
        $('#step-name').textContent = step.blockDef.icon + ' ' + step.blockDef.name;

        // Progress bar
        var pct = total <= 1 ? 100 : ((idx / (total - 1)) * 100);
        $('#step-progress').style.width = pct + '%';

        // Disable buttons at bounds
        $('#step-prev').disabled = idx <= 0;
        $('#step-next').disabled = idx >= total - 1;
    }

    function goToStep(newIndex) {
        var steps = pipeline.getSteps();
        if (steps.length === 0) return;
        currentStepIndex = Math.max(0, Math.min(newIndex, steps.length - 1));
        updateStepUI();
        renderPipeline();
        renderVisualizations();
    }

    function setupStepMode() {
        var stepBtn = $('#btn-step-mode');
        var prevBtn = $('#step-prev');
        var nextBtn = $('#step-next');

        if (!stepBtn) return;

        stepBtn.addEventListener('click', function() { toggleStepMode(); });

        if (prevBtn) prevBtn.addEventListener('click', function() { goToStep(currentStepIndex - 1); });
        if (nextBtn) nextBtn.addEventListener('click', function() { goToStep(currentStepIndex + 1); });

        // Keyboard navigation
        document.addEventListener('keydown', function(e) {
            if (!stepModeActive) return;
            // Don't capture if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                goToStep(currentStepIndex - 1);
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                goToStep(currentStepIndex + 1);
            } else if (e.key === 'Escape') {
                toggleStepMode(false);
            }
        });
    }

    // ── R-D Analysis ──
    function setupRDAnalysis() {
        var rdBtn = $('#btn-rd-analysis');
        var rdModal = $('#rd-modal');
        var rdClose = $('#rd-modal-close');
        var rdRunBtn = $('#rd-run-sweep');
        var rdStatus = $('#rd-status');
        var rdCanvas = $('#rd-canvas');
        var rdTableWrapper = $('#rd-table-wrapper');

        if (!rdBtn || !rdModal) return;

        // Open modal
        rdBtn.addEventListener('click', function() {
            rdModal.style.display = 'flex';
        });

        // Close modal
        rdClose.addEventListener('click', function() {
            rdModal.style.display = 'none';
        });

        // Close on overlay click
        rdModal.addEventListener('click', function(e) {
            if (e.target === rdModal) rdModal.style.display = 'none';
        });

        // Close on Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && rdModal.style.display !== 'none') {
                rdModal.style.display = 'none';
            }
        });

        // Run sweep
        rdRunBtn.addEventListener('click', function() {
            var steps = pipeline.getSteps();
            if (steps.length === 0) {
                rdStatus.textContent = '⚠ Pipeline is empty — add blocks first.';
                return;
            }

            var qInfo = B.RDAnalysis.findQuantBlock(steps);
            if (!qInfo) {
                rdStatus.textContent = '⚠ No quantization block in pipeline. Add a Quantizer to sweep.';
                return;
            }

            rdStatus.textContent = '⏳ Running sweep...';
            rdRunBtn.disabled = true;

            // Use setTimeout to let the UI update before the blocking sweep
            setTimeout(function() {
                var t0 = performance.now();
                var result = B.RDAnalysis.runRDSweep(pipeline, computeMetrics);
                var elapsed = performance.now() - t0;

                if (result.error) {
                    rdStatus.textContent = '⚠ ' + result.error;
                    rdRunBtn.disabled = false;
                    return;
                }

                rdStatus.textContent = '✓ Swept ' + result.data.length + ' points in ' + elapsed.toFixed(0) + 'ms';
                rdRunBtn.disabled = false;

                // Draw chart
                B.RDAnalysis.drawRDCurve(rdCanvas, result.data);

                // Build data table
                buildRDTable(rdTableWrapper, result.data, result.sweepLabel);

                // Re-run the pipeline to restore the original state display
                renderPipeline();
                executePipeline();
            }, 50);
        });
    }

    function buildRDTable(container, data, sweepLabel) {
        if (!data || data.length === 0) {
            container.innerHTML = '';
            return;
        }

        var html = '<table class="rd-table"><thead><tr>' +
            '<th>' + sweepLabel + '</th>' +
            '<th>Bits/Sample</th>' +
            '<th>PSNR (dB)</th>' +
            '<th>MSE</th>' +
            '<th>SNR (dB)</th>' +
            '<th>Compression</th>' +
            '<th>Entropy</th>' +
            '</tr></thead><tbody>';

        for (var i = 0; i < data.length; i++) {
            var d = data[i];
            var psnrStr = d.psnr === Infinity ? '∞' : d.psnr.toFixed(2);
            var snrStr = d.snr === Infinity ? '∞' : d.snr.toFixed(2);
            html += '<tr>' +
                '<td>' + d.paramValue + '</td>' +
                '<td>' + d.bitsPerSample.toFixed(2) + '</td>' +
                '<td>' + psnrStr + '</td>' +
                '<td>' + d.mse.toFixed(4) + '</td>' +
                '<td>' + snrStr + '</td>' +
                '<td>' + d.compressionRatio.toFixed(2) + '×</td>' +
                '<td>' + d.entropy.toFixed(3) + '</td>' +
                '</tr>';
        }

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    // ── Boot ──
    document.addEventListener('DOMContentLoaded', init);
})(window.BYOC);
