/**
 * @public
 */
'use strict';

define (
	[
		'kbwidget',
		'bootstrap',
		'jquery',
		'narrativeConfig',
		'kbaseAuthenticatedWidget',
		'jquery-dataTables',
		'knhx',
		'widgetMaxWidthCorrection',
		'kbase-generic-client-api'
	], function(
		KBWidget,
		bootstrap,
		$,
		Config,
		kbaseAuthenticatedWidget,
		jquery_dataTables,
		knhx,
		widgetMaxWidthCorrection,
		GenericClient
	) {
    return KBWidget({
        name: 'kbaseFeatureSet',
        parent : kbaseAuthenticatedWidget,
        version: '0.0.1',
        options: {
            featureset_name: null,
            workspaceName: null,
            wsURL: Config.url('workspace'),
            loadingImage: Config.get('loading_gif'),
        },

        init: function(options) {
            this._super(options);
console.log("INIT VIEW FEATURE SET : ", options);
            this.upa = this.options.upas.featureset_name;
            this.$messagePane = $("<div/>").addClass("kbwidget-message-pane kbwidget-hide-message");
            this.$elem.append(this.$messagePane);

            this.$mainPanel = $("<div>").addClass("").hide();
            this.$elem.append(this.$mainPanel);

            this.render();

            return this;
        },

        render: function() {
            this.ws = new Workspace(this.options.wsURL, {token: this.token});
            this.genomeSearchAPI = new GenomeSearchUtil(Config.url('service_wizard'), {token: this.token});
            this.loading(false);
            this.$mainPanel.hide();
            this.$mainPanel.empty();
            this.loadFeatureSet();
        },


        features: null, // genomeId : [{fid: x, data: x}]

        loadFeatureSet: function() {
            var self = this;
            self.features = {};
            console.log("LOADING UPA : ", self.upa);
            self.ws.get_objects([ { ref: self.upa } ],
                function(data) {
                console.log("LAODED DATA : ", data);
                    var fs = data[0].data;
                    if(fs.description) {
                        self.$mainPanel.append($('<div>')
                            .append("<i>Description</i> - ")
                            .append(fs.description));
                    }

                    for (var fid in fs.elements) {
                        if (fs.elements.hasOwnProperty(fid)) {

                            for (var k=0; k<fs.elements[fid].length; k++) {
                                var gid = fs.elements[fid][k];
                                if(self.features.hasOwnProperty(gid)) {
                                    self.features[gid].push(fid);
                                } else {
                                    self.features[gid] = [fid];
                                }
                            }
                        }
                    }
                    console.log("I AM : ", self);
                    self.getGenomeData();
                    self.$mainPanel.show();
                },
                function(error) {
                console.log("F1");
                    self.loading(true);
                    self.renderError(error);

                });
        },

        search: function(genome_ref, query, limit) {
            return this.genomeSearchAPI.search({
                    ref: genome_ref,
                    structured_query: query,
                    sort_by: [['contig_id',1]],
                    start: 0,
                    limit: limit
                })
        },


        genomeLookupTable: null, // genomeId: { featureId: indexInFeatureList }
        genomeObjectInfo: null, //{},
        featureTableData: null, // list for datatables

        getGenomeData: function() {
            var self = this;
            self.genomeLookupTable = {};
            self.genomeObjectInfo = {};
            self.featureTableData = [];
            for(var gid in self.features) {
                var query = {"feature_id": self.features[gid]}
                self.search(gid, {"feature_id": self.features[gid]}, self.features[gid].length)
                    .then(function(results) {
                        for (var f in results.features) {
                            var feature = results.features[f];
                            self.featureTableData.push(
                                {
                                    fid: '<a href="/#dataview/'+gid+
                                                '?sub=Feature&subid='+feature.feature_id + '" target="_blank">'+
                                                feature.feature_id+'</a>',
                                    gid: '<a href="/#dataview/'+gid+
                                            '" target="_blank">'+gid+"</a>",
                                    ali: Object.keys(feature.aliases).join(", "),
                                    type: feature.feature_type,
                                    func: feature.function
                                }
                            );

                        }
                        self.renderFeatureTable(); // just rerender each time
                        self.loading(true);
                    })
                    .fail(function(e) {
                        console.error(e);
                    });
            }
            if (Object.keys(self.features).length === 0){
                self.loading(true);
                self.showMessage("This feature set is empty.")
            }
        },

        $featureTableDiv : null,
        renderFeatureTable: function() {
            var self = this;

            if(!self.$featureTableDiv) {
                self.$featureTableDiv = $('<div>').css({'margin':'5px'});
                self.$mainPanel.append(self.$featureTableDiv);
            }

            self.$featureTableDiv.empty();

            var $tbl = $('<table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-left: 0px; margin-right: 0px;">')
                            .addClass("table table-bordered table-striped");
            self.$featureTableDiv.append($tbl);

            var sDom = "ft<ip>";
            if(self.featureTableData.length<=10) sDom = "ft<i>";

            var tblSettings = {
                "sPaginationType": "full_numbers",
                "iDisplayLength": 10,
                "sDom": sDom,
                "aaSorting": [[ 2, "asc" ], [0, "asc"]],
                "aoColumns": [
                                      {sTitle: "Feature ID", mData: "fid"},
                                      {sTitle: "Aliases", mData: "ali"},
                                      {sTitle: "Genome", mData: "gid"},
                                      {sTitle: "Type", mData: "type"},
                                      {sTitle: "Function", mData: "func"},
                                      ],
                                      "aaData": [],
                                      "oLanguage": {
                                          "sSearch": "Search features:",
                                          "sEmptyTable": "This FeatureSet is empty"
                                      }
                };
            var featuresTable = $tbl.dataTable(tblSettings);
            featuresTable.fnAddData(self.featureTableData);
        },

        renderError: function(error) {
            var errString = "Sorry, an unknown error occurred";
            if (typeof error === "string")
                errString = error;
            else if (error.error && error.error.message)
                errString = error.error.message;

            var $errorDiv = $("<div>")
                            .addClass("alert alert-danger")
                            .append("<b>Error:</b>")
                            .append("<br>" + errString);
            this.$elem.empty();
            this.$elem.append($errorDiv);
        },

        loading: function(doneLoading) {
            if (doneLoading)
                this.hideMessage();
            else
                this.showMessage("<img src='" + this.options.loadingImage + "'/>");
        },

        showMessage: function(message) {
            var span = $("<span/>").append(message);

            this.$messagePane.append(span);
            this.$messagePane.show();
        },

        hideMessage: function() {
            this.$messagePane.hide();
            this.$messagePane.empty();
        },

    });
});
