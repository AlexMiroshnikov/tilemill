view = Backbone.View.extend();

view.prototype.events = {
    'click input[type=submit]': 'save',
    'change select[name=layer]': 'attach',
    'click a[href=#settingsTooltips]': 'refresh',
    'keyup input[name=template_location]': 'preview',
    'focus input[name=template_location]': 'preview',
};

view.prototype.initialize = function(options) {
    _(this).bindAll('render', 'save', 'attach', 'zoom', 'preview', 'refresh');
    this.render().attach();
};

view.prototype.preview = function(ev) {
    var target = $(ev.currentTarget);
    var format = target.attr('name').split('template_').pop();
    var feature = this.datasource.get('features')[0];
    try {
        target.siblings('.preview').html(
            wax.template(target.val()).format(false, feature));
    } catch(err) {
        target.siblings('.preview').html(err.toString());
    }
};

view.prototype.refresh = function() {
    this.mirror_teaser.refresh();
    this.mirror_full.refresh();
};

view.prototype.render = function() {
    this.$('.content').html(templates.Settings(this.model));
    this.$('.slider').slider({
        range: true,
        min:0,
        max:22,
        values:[this.model.get('minzoom'), this.model.get('maxzoom')],
        step:1,
        slide: this.zoom
    });

    // Focus name field for unnamed projects.
    if (!this.model.get('name')) this.$('input[type=text]:first').focus();

    return this;
};

view.prototype.zoom = function(ev, ui) {
    this.$('.minzoom').text(ui.values[0]);
    this.$('.maxzoom').text(ui.values[1]);
};

view.prototype.save = function() {
    var attr = _({
        'name':          this.$('input[name=name]').val(),
        'description':   this.$('input[name=description]').val(),
        'attribution':   this.$('input[name=attribution]').val(),
        'version':       this.$('input[name=version]').val(),
        'format':        this.$('select[name=format]').val(),
        'minzoom':       parseInt(this.$('.slider').slider('values', 0)),
        'maxzoom':       parseInt(this.$('.slider').slider('values', 1)),
        'interactivity': this.$('select[name=layer]').val() ? {
                'layer': this.$('select[name=layer]').val(),
                'template_teaser': this.mirror_teaser.getVal(),
                'template_full': this.mirror_full.getVal(),
                'template_location': this.$('input[name=template_location]').val(),
            } :
            false,
        'legend':        this.$('textarea[name=legend]').val(),
        'bounds': [
            parseFloat(this.$('input[name=bounds_0]').val()),
            parseFloat(this.$('input[name=bounds_1]').val()),
            parseFloat(this.$('input[name=bounds_2]').val()),
            parseFloat(this.$('input[name=bounds_3]').val())
        ],
        'center': [
            parseFloat(this.$('input[name=center_0]').val()),
            parseFloat(this.$('input[name=center_1]').val()),
            parseInt(this.$('input[name=center_2]').val())
        ]
    }).reduce(function(memo, val, key) {
        var allowEmpty = ['description', 'attribution', 'legend']
        if (val !== '' || _(allowEmpty).include(key)) memo[key] = val;
        return memo;
    }, {});

    var error = function(m, e) { new views.Modal(e); };
    if (!this.model.set(attr, {error:error})) return false;

    this.model.save({}, {
        success: _(function(model) {
            this.model.trigger('save');
            this.$('.close').click();
        }).bind(this),
        error:error
    });
    return false;
};

view.prototype.attach = function() {
    var id = this.$('select[name=layer]').val();
    var layer = this.model.get('Layer').get(id);

    // If no layer is selected hide dependents and back out.
    if (!layer) {
        this.$('.dependent').hide();
        return;
    }

    var update = _(function(model) {
        var fields = _(model.get('fields')).keys();

        this.$('.tokens').html(_(fields).map(function(f) {
            return '<code>{{{' + f + '}}}</code>';
        }).join(' '));

        this.$('.dependent').show();

        this.mirrorChange = _(function(ed) {
            var val = ed.getValue(),
                feature = this.datasource.get('features')[0];
            try {
                $(ed.getWrapperElement()).parent().siblings('.preview').html(
                    wax.template(val).format(false, feature));
            } catch(err) {
                $(ed.getWrapperElement()).parent().siblings('.preview').html(err.toString());
            }
        }).bind(this);

        $('#popup').removeClass('loading');

        if (this.mirror_teaser) {
            this.mirror_teaser.refresh();
        } else {
            this.mirror_teaser = CodeMirror.fromTextArea(
                this.$('textarea[name=template_teaser]').get(0), {
                onChange: this.mirrorChange,
                onFocus: this.mirrorChange,
                mode: 'mustache'
            });
        }

        if (this.mirror_full) {
            this.mirror_full.refresh();
        } else {
            this.mirror_full = CodeMirror.fromTextArea(
                this.$('textarea[name=template_full]').get(0), {
                onChange: this.mirrorChange,
                onFocus: this.mirrorChange,
                mode: 'mustache'
            });
        }
    }).bind(this);

    // Cache the datasource model to `this.datasource` so it can
    // be used to live render/preview the formatters.
    if (!this.datasource || this.datasource.id !== layer.get('id')) {
        $('#popup').addClass('loading');
        var attr = _(layer.get('Datasource')).chain()
            .clone()
            .extend({
                id: layer.get('id'),
                project: this.model.get('id'),
                // millstone will not allow `srs` be undefined for inspection so we set
                // it to null. We could use the layer's SRS, but this likely has fewer
                // side effects.
                srs: null
            })
            .value();
        this.datasource = new models.Datasource(attr);
        this.datasource.fetchFeatures({
            success: update,
            error: function(model, err) { new views.Modal(err); }
        });
    } else {
        update(this.datasource);
    }
    if (!layer) return;
};


