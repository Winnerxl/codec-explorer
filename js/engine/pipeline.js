/**
 * Pipeline Runner — executes a chain of processing blocks and collects results
 */
(function(B) {
    var registry = B.registry;

    function PipelineRunner() {
        this.steps = [];
        this.results = [];
        this.error = null;
    }

    PipelineRunner.prototype.addStep = function(blockId, params) {
        params = params || {};
        var instanceId = blockId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        this.steps.push({ blockId: blockId, params: params, instanceId: instanceId });
        return instanceId;
    };

    PipelineRunner.prototype.removeStep = function(index) {
        this.steps.splice(index, 1);
    };

    PipelineRunner.prototype.moveStep = function(from, to) {
        var item = this.steps.splice(from, 1)[0];
        this.steps.splice(to, 0, item);
    };

    PipelineRunner.prototype.updateParams = function(index, params) {
        if (this.steps[index]) {
            this.steps[index].params = Object.assign({}, this.steps[index].params, params);
        }
    };

    PipelineRunner.prototype.getSteps = function() {
        return this.steps.map(function(s, i) {
            return {
                blockId: s.blockId,
                params: s.params,
                instanceId: s.instanceId,
                blockDef: registry.get(s.blockId),
                index: i
            };
        });
    };

    PipelineRunner.prototype.validate = function() {
        var errors = [];
        if (this.steps.length === 0) {
            errors.push('Pipeline is empty. Add at least an Input block.');
            return { valid: false, errors: errors };
        }
        var firstBlock = registry.get(this.steps[0].blockId);
        if (!firstBlock || firstBlock.category !== 'input') {
            errors.push('Pipeline must start with an Input block.');
        }
        return { valid: errors.length === 0, errors: errors };
    };

    PipelineRunner.prototype.execute = function() {
        this.results = [];
        this.error = null;
        var totalStart = performance.now();

        if (this.steps.length === 0) {
            this.error = 'Pipeline is empty';
            return { results: [], totalTime: 0, error: this.error };
        }

        var currentData = null;
        for (var i = 0; i < this.steps.length; i++) {
            var step = this.steps[i];
            var blockDef = registry.get(step.blockId);
            if (!blockDef) {
                this.error = 'Unknown block: ' + step.blockId;
                return { results: this.results, totalTime: performance.now() - totalStart, error: this.error };
            }
            var stepStart = performance.now();
            try {
                var output = blockDef.process(currentData, step.params);
                var stepTime = performance.now() - stepStart;
                this.results.push({
                    index: i,
                    blockId: step.blockId,
                    blockDef: blockDef,
                    instanceId: step.instanceId,
                    params: step.params,
                    input: currentData,
                    output: output,
                    timing: stepTime
                });
                currentData = output;
            } catch (err) {
                this.error = 'Error in "' + blockDef.name + '" (step ' + (i + 1) + '): ' + err.message;
                return { results: this.results, totalTime: performance.now() - totalStart, error: this.error };
            }
        }
        var totalTime = performance.now() - totalStart;
        return { results: this.results, totalTime: totalTime, error: null };
    };

    PipelineRunner.prototype.clear = function() {
        this.steps = [];
        this.results = [];
        this.error = null;
    };

    PipelineRunner.prototype.toJSON = function() {
        return this.steps.map(function(s) { return { blockId: s.blockId, params: s.params }; });
    };

    PipelineRunner.prototype.fromJSON = function(data) {
        this.clear();
        for (var i = 0; i < data.length; i++) {
            this.addStep(data[i].blockId, data[i].params);
        }
    };

    B.PipelineRunner = PipelineRunner;
})(window.BYOC);
