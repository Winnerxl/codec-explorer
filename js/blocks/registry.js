/**
 * Block Registry — defines all available processing blocks and manages registration
 */
(function(B) {
    var CATEGORIES = {
        input:          { label: 'Input',          icon: '📥', color: '#10b981', order: 0 },
        transform:      { label: 'Transform',      icon: '🔄', color: '#3b82f6', order: 1 },
        prediction:     { label: 'Prediction',     icon: '📐', color: '#8b5cf6', order: 2 },
        quantization:   { label: 'Quantization',   icon: '📊', color: '#f59e0b', order: 3 },
        entropy:        { label: 'Entropy Coding',  icon: '🗜️', color: '#ef4444', order: 4 },
        reconstruction: { label: 'Reconstruction', icon: '🔁', color: '#06b6d4', order: 5 }
    };

    function BlockRegistry() {
        this.blocks = new Map();
        this.categories = CATEGORIES;
    }

    BlockRegistry.prototype.register = function(blockDef) {
        if (!blockDef.id || !blockDef.category) throw new Error('Block must have id and category');
        this.blocks.set(blockDef.id, blockDef);
    };

    BlockRegistry.prototype.registerAll = function(blockDefs) {
        for (var i = 0; i < blockDefs.length; i++) this.register(blockDefs[i]);
    };

    BlockRegistry.prototype.get = function(id) {
        return this.blocks.get(id);
    };

    BlockRegistry.prototype.getByCategory = function(category) {
        var result = [];
        this.blocks.forEach(function(b) { if (b.category === category) result.push(b); });
        return result;
    };

    BlockRegistry.prototype.getAllCategories = function() {
        var cats = [];
        var self = this;
        Object.keys(this.categories).forEach(function(key) {
            var meta = self.categories[key];
            cats.push({ key: key, label: meta.label, icon: meta.icon, color: meta.color, order: meta.order, blocks: self.getByCategory(key) });
        });
        return cats.sort(function(a, b) { return a.order - b.order; });
    };

    B.registry = new BlockRegistry();
    B.CATEGORIES = CATEGORIES;
})(window.BYOC);
