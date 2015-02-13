/**
 * Output widget to vizualize DomainAnnotation object.
 * Pavel Novichkov <psnovichkov@lbl.gov>, John-Marc Chandonia <jmchandonia@lbl.gov>
 * @public
 */

(function($, undefined) {
    $.KBWidget({
        name: 'kbaseDomainAnnotation',
        parent: 'kbaseAuthenticatedWidget',
        version: '1.0.2',
        options: {
            domainAnnotationID: null,
            workspaceID: null,
            domainAnnotationVer: null,
            kbCache: null,
            workspaceURL: window.kbconfig.urls.workspace,
            loadingImage: "static/kbase/images/ajax-loader.gif",
            height: null,
	    maxDescriptionLength: 100
        },

        // Data for vizualization
        domainAnnotationData: null,
        genomeRef: null,
        genomeId: null,
        genomeName: null,
        domainModelSetRef: null,
        domainModelSetName: null,
        domainAccessionToShortDescription: {},
        domainAccessionToLongDescription: {},
	domainAccessionToPrefix: {},
	prefixToUrl: {},
        annotatedGenesCount: 0,
        annotatedDomainsCount: 0,

        init: function(options) {
            this._super(options);

            // TEMPORARY
            if(this.options.domainAnnotationID == null){
                this.options.domainAnnotationID = 12;
                this.options.workspaceID = 2959;
                this.options.domainAnnotationVer = 8;
            }

            // Create a message pane
            this.$messagePane = $("<div/>").addClass("kbwidget-message-pane kbwidget-hide-message");
            this.$elem.append(this.$messagePane);

            return this;
        },

        loggedInCallback: function(event, auth) {
            // Create a new workspace client
            this.ws = new Workspace(this.options.workspaceURL, auth);
           
            // Let's go...
            this.render();           
           
            return this;
        },

        loggedOutCallback: function(event, auth) {
            this.ws = null;
            this.isLoggedIn = false;
            return this;
        },
  
        render: function(){
            var self = this;
            self.pref = this.uuid();
            self.loading(true);

            var container = this.$elem;
            var kbws = this.ws;

            //self.options.workspaceID + "/" + self.options.domainAnnotationID;
            //kbws.get_objects([{ref: domainAnnotationRef}], function(data) {

            var domainAnnotationRef = self.buildObjectIdentity(this.options.workspaceID, this.options.domainAnnotationID, this.options.domainAnnotationVer);
            kbws.get_objects([domainAnnotationRef], function(data) {

                self.domainAnnotationData = data[0].data;
                self.genomeRef = self.domainAnnotationData.genome_ref;
                self.domainModelSetRef = self.domainAnnotationData.used_dms_ref;

                // Job to get properties of AnnotationDomain object: name and id of the annotated genome
                var jobGetDomainAnnotationProperties = kbws.get_object_subset(
                    [
                        { 'ref':self.genomeRef, 'included':['/id'] },
                        { 'ref':self.genomeRef, 'included':['/scientific_name'] }
                    ], 
                    function(data){
                        self.genomeId = data[0].data.id;
                        self.genomeName = data[1].data.scientific_name;
                    }, 
                    function(error){
                        self.clientError(error);
                    }                    
                );

                var jobGetDomainModelSet =  kbws.get_objects(
                    [{ref: self.domainModelSetRef}], 
                    function(data) {
                        self.domainAccessionToShortDescription = data[0].data.domain_accession_to_description;
			// make regex for each prefix to map to external URLs
			$.each(data[0].data.domain_prefix_to_dbxref_url, function(prefix,url) {
			    self.prefixToUrl['^'+prefix] = url;
			});
			// make short & long descriptions for ones that are too long
			$.each(self.domainAccessionToShortDescription, function(domainId,description) {
			    if (description.length > self.options.maxDescriptionLength) {
				domainAccessionToLongDescription[domainId] = domainAccessionToShortDescription[domainId] + ' <a class="show-less' + self.pref  + '" data-id="' + domainId + '">(show less)</a>';
				domainAccessionToShortDescription[domainId] = domainAccessionToShortDescription[domainId].substring(0,self.options.maxDescriptionLength) + ' <a class="show-more' + self.pref  + '" data-id="' + domainId + '">(show more)</a>';
			    }
			});
                    },
                    function(error){
                        self.clientError(error);
                    }
                );

                // Launch jobs and vizualize data once they are done
                $.when.apply($, [jobGetDomainAnnotationProperties, jobGetDomainModelSet]).done( function(){
                    self.loading(false);
                    self.prepareVizData();

                    ///////////////////////////////////// Instantiating Tabs ////////////////////////////////////////////
                    container.empty();
                    var tabPane = $('<div id="'+self.pref+'tab-content">');
                    container.append(tabPane);
                    tabPane.kbaseTabs({canDelete : true, tabs : []});                    
                    ///////////////////////////////////// Overview table ////////////////////////////////////////////           
                    var tabOverview = $("<div/>");
                    tabPane.kbaseTabs('addTab', {tab: 'Overview', content: tabOverview, canDelete : false, show: true});
                    var tableOver = $('<table class="table table-striped table-bordered" '+
                        'style="width: 100%; margin-left: 0px; margin-right: 0px;" id="'+self.pref+'overview-table"/>');
                    tabOverview.append(tableOver);
                    tableOver
                        .append( self.makeRow( 
                            'Annotated genome', 
                            $('<span />').append(self.genomeName).css('font-style', 'italic') ) )
                        .append( self.makeRow( 
                            'Domain model set', 
                            self.domainSetName ) )
                        .append( self.makeRow( 
                            'Annotated genes', 
                            self.annotatedGenesCount ) )
                        .append( self.makeRow( 
                            'Annotated domains', 
                            self.annotatedDomainsCount) );

                    ///////////////////////////////////// Domains table ////////////////////////////////////////////          
                    var tabDomains = $("<div/>");
                    tabPane.kbaseTabs('addTab', {tab: 'Domains', content: tabDomains, canDelete : false, show: false});
                    var tableDomains = $('<table class="table table-striped table-bordered" '+
                        'style="width: 100%; margin-left: 0px; margin-right: 0px;" id="'+self.pref+'domain-table"/>');
                    tabDomains.append(tableDomains);
                    var domainTableSettings = {
                        "sPaginationType": "full_numbers",
                        "iDisplayLength": 10,
                        "aaData": [],
                        "aaSorting": [[ 2, "asc" ], [0, "asc"]],
                        "aoColumns": [
                                      { "sTitle": "Domain", 'mData': 'id'},
                                      { "sTitle": "Description", 'mData': 'description'},
                                      { "sTitle": "#Genes", 'mData': 'geneCount'},
                                      { "sTitle": "Genes", 'mData': 'geneRefs'},
                        ],
                        "oLanguage": {
                                    "sEmptyTable": "No domains found!",
                                    "sSearch": "Search: "
                        },
                        'fnDrawCallback': events
                    };

                    var domainsTableData = [];
                    var domains = self.domains;
                    for(var domainId in domains){
                        var domain = domains[domainId];

			// try to map each domain to a prefix,
			// for external crossrefs and to show only
			// the most relevant match per set
			var domainRef = domainId;
			$.each(self.prefixToUrl, function(prefix,url) {
			    if (domainId.match(prefix)) {
				self.domainToPrefix[domainId] = prefix;
				domainRef += ' <a href="'+url+domainId+'">(more info)</a>';
				return false;
			    }
			});

                        // Build concatenated list of gene references
                        var geneRefs = "";
                        for(var i = 0; i < domain.genes.length; i++){
                            gene = domain.genes[i];
                            if( i > 0 ) {
                                geneRefs += '<br />';
                            }                            
                            geneRefs += '<a class="show-gene' + self.pref  + '"'
                                + ' data-id="' + gene['geneId'] + '"'
                                + ' data-contigId="' + gene['contigId']  + '"'
                                + ' data-geneIndex="' + gene['geneIndex']  + '"'
                                + '>' + gene['geneId'] + '</a>';
                        }
 
                        // add table data row            
                        domainsTableData.push(
                            {
                                id: domainRef, 
                                description: domain.description,
                                geneCount: domain.genes.length,
                                geneRefs: geneRefs
                            }
                        );
                    };
                    domainTableSettings.aaData = domainsTableData;
                    tableDomains = tableDomains.dataTable(domainTableSettings);

                    ///////////////////////////////////// Events ////////////////////////////////////////////          

                    function events() {
                        $('.show-gene'+self.pref).unbind('click');
                        $('.show-gene'+self.pref).click(function() {
                            var id = $(this).attr('data-id');
                            var contigId = $(this).attr('data-contigId');
                            var geneIndex = $(this).attr('data-geneIndex');

                            if (tabPane.kbaseTabs('hasTab', id)) {
                                tabPane.kbaseTabs('showTab', id);
                                return;
                            }

                            ////////////////////////////// Build Gene Domains table //////////////////////////////
                            var tabContent = $("<div/>");

                            var tableGeneDomains = $('<table class="table table-striped table-bordered" '+
                                'style="width: 100%; margin-left: 0px; margin-right: 0px;" id="' + self.pref + id + '-table"/>');
                            tabContent.append(tableGeneDomains);
                            var geneDomainTableSettings = {
                                "sPaginationType": "full_numbers",
                                "iDisplayLength": 10,
                                "aaData": [],
                                "aaSorting": [[ 3, "asc" ], [5, "desc"]],
                                "aoColumns": [
                                    {sTitle: "Domain", mData: "domainId"},
                                    {sTitle: "Description", mData: "domainDescription", sWidth:"30%"},
                                    {sTitle: "Location", mData: "image"},
                                    {sTitle: "Start", mData: "domainStart"},
                                    {sTitle: "End", mData: "domainEnd"},
                                    {sTitle: "E-value", mData: "eValue"},
                                ],
                                "oLanguage": {
                                    "sEmptyTable": "No domains found!",
                                    "sSearch": "Search: "
                                },
				'fnDrawCallback': events2
                            };
                            var geneDomainsTableData = [];

                            var gene = self.domainAnnotationData.data[contigId][geneIndex];
                            var geneId = gene[0];
                            var geneStart = gene[1];
                            var geneEnd = gene[2];
                            var domainsInfo = gene[4];
			    var geneLength = (geneEnd - geneStart + 1)/3;

			    // hack to deal with genes with incorrect lengths
                            for(var domainId in domainsInfo){
                                var domainsArray = domainsInfo[domainId];
                                for(var i = 0 ; i < domainsArray.length; i++){
                                    var domainEnd = domainsArray[i][1];
                                    if (domainEnd > geneLength)
					geneLength = domainEnd;
				}
			    }
			    
                            for(var domainId in domainsInfo){
                                var domainsArray = domainsInfo[domainId];
                                for(var i = 0 ; i < domainsArray.length; i++){
                                    var domainStart = domainsArray[i][0];
                                    var domainEnd = domainsArray[i][1];
                                    var eValue = domainsArray[i][2];

                                    var domainImgWidth = (domainEnd - domainStart)*100/geneLength;
                                    var domainImgleftShift = (domainStart)*100/geneLength;

				    var domainRef = '<a class="show-domain' + self.pref  + '"'
					+ ' data-id="' + domainId + '">'
					+ domainId + '</a>';

                                    geneDomainsTableData.push({
                                        'contigId' : contigId,
                                        'geneId' : geneId,
                                        'geneStart' : geneStart,
                                        'geneEnd' : geneEnd,
                                        'domainId' : domainRef,
                                        'domainDescription' : self.domainAccessionToShortDescription[domainId],
                                        'domainStart': domainStart, 
                                        'domainEnd' : domainEnd, 
                                        'eValue' : eValue,
                                        'image' : 
                                                '<div style="width: 100%; height:100%; vertical-align: middle; margin-top: 1em; margin-bottom: 1em;">'
                                                + '<div style="position:relative; border: 1px solid gray; width:100%; height:2px;">' 
                                                + '<div style="position:relative; left: ' + domainImgleftShift +'%;' 
                                                + ' width:' + domainImgWidth + '%;'
                                                + ' top: -5px; height:10px; background-color:red;"/></div>'
                                                + '</div>'
                                    });
                                }
                            }                            
                            geneDomainTableSettings.aaData = geneDomainsTableData;
                            tabPane.kbaseTabs('addTab', {tab: id, content: tabContent, canDelete : true, show: true});
                            tableGeneDomains.dataTable(geneDomainTableSettings);
                        });
		    };

                    function events2() {
                        $('.show-domain'+self.pref).unbind('click');
                        $('.show-domain'+self.pref).click(function() {
                            var domainId = $(this).attr('data-id');
			    tableDomains.fnFilter(domainId);
                            tabPane.kbaseTabs('showTab', 'Domains');
			});
                    };

                });                
            });
        },
       
        prepareVizData: function(){
            var self = this;

            var dad = self.domainAnnotationData;

            var domains = {};
            var domainsCount = 0;
            var genesCount = 0;

            for(var contigId in dad.data){

                var genesArray = dad.data[contigId];
                for(var i = 0 ; i < genesArray.length; i++){
                    var geneId = genesArray[i][0];
//                    var geneStart = genesArray[i][1];
//                    var geneEnd = genesArray[i][2];
                    var domainsInfo = genesArray[i][4];
                    if($.isEmptyObject(domainsInfo)) continue;

                    // If we have somthing in domainsInfo, then the gene was anntoated
                    genesCount++;
                    for(var domainId in domainsInfo){
                        var domainData = domains[domainId];
                        if(typeof domainData === 'undefined'){
                            domainData = {
                                id: domainId,
                                description: self.domainAccessionToShortDescription[domainId],
                                genes: []
                            };
                            domains[domainId] = domainData;
                            domainsCount++;
                        }

                        domainData.genes.push(
                            {
                                geneId: geneId,
                                contigId: contigId, 
                                geneIndex: i
                            }
                        );
                    }
                }
                self.domains = domains;
                self.annotatedDomainsCount = domainsCount; 
                self.annotatedGenesCount = genesCount;
            }
        },

        makeRow: function(name, value) {
            var $row = $("<tr/>")
                       .append($("<th />").css('width','20%').append(name))
                       .append($("<td />").append(value));
            return $row;
        },

        getData: function() {
            return {
                type: 'DomainAnnotation',
                id: this.options.domainAnnotationID,
                workspace: this.options.workspaceID,
                title: 'Domain Annotation'
            };
        },

        loading: function(isLoading) {
            if (isLoading)
                this.showMessage("<img src='" + this.options.loadingImage + "'/>");
            else
                this.hideMessage();                
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

        uuid: function() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, 
                function(c) {
                    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
                    return v.toString(16);
                });
        },

        buildObjectIdentity: function(workspaceID, objectID, objectVer, wsRef) {
            var obj = {};
            if (wsRef) {
                obj['ref'] = wsRef;
            } else {
                if (/^\d+$/.exec(workspaceID))
                    obj['wsid'] = workspaceID;
                else
                    obj['workspace'] = workspaceID;

                // same for the id
                if (/^\d+$/.exec(objectID))
                    obj['objid'] = objectID;
                else
                    obj['name'] = objectID;
                
                if (objectVer)
                    obj['ver'] = objectVer;
            }
            return obj;
        },        

        clientError: function(error){
            this.loading(false);
            this.showMessage(error.error.error);
        }        

    });
})( jQuery );