/*
 *  eXide - web-based XQuery IDE
 *  
 *  Copyright (C) 2011 Wolfgang Meier
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
eXide.namespace("eXide.edit.Projects");

eXide.edit.Projects = (function() {
    
    Constr = function() {
        this.projects = {};
    };
    
    Constr.prototype.getProject = function (collection, callback) {
        var $this = this;
        $.getJSON("modules/deployment.xql", { info: collection }, function (data) {
            if (!data) {
                eXide.util.error("Application not found: The document currently opened in the editor " +
                    "should belong to an application package.");
            } else {
                var project = $this.projects[data.abbrev];
                if (project) {
                    eXide.util.oop.extend(project, data);
                } else {
                    project = data;
                    $this.projects[data.abbrev] = project;
                }
                callback(project);
            }
        });
    };

    Constr.prototype.getProjectFor = function (collection) {
        var re = new RegExp("^" + collection);
        for (k in this.projects) {
            var project = this.projects[k];
            $.log("collection: %s -> root: %s", collection.substring(0, project.root.length), project.root);
            if (collection.substring(0, project.root.length) === project.root) {
                return project;
            }
        }
        return null;
    };
    
    Constr.prototype.saveState = function () {
        var i = 0;
        for (k in this.projects) {
            var project = this.projects[k];
            for (n in project) {
                localStorage["eXide.projects." + i + "." + n] = project[n];
            }
            i++;
        }
        localStorage["eXide.projects"] = i;
	};
			
	Constr.prototype.restoreState = function() {
		var count = localStorage["eXide.projects"];
        if (!count)
            count = 0;
        this.projects = {};
        for (var i = 0; i < count; i++) {
            var abbrev = localStorage["eXide.projects." + i + ".abbrev"];
            this.projects[abbrev] = {
                abbrev: abbrev,
                root: localStorage["eXide.projects." + i + ".root"],
                dir: localStorage["eXide.projects." + i + ".dir"],
                autoSync: localStorage["eXide.projects." + i + ".autoSync"]
            };
        }
	};
    
    return Constr;
}());

eXide.namespace("eXide.edit.PackageEditor");

/**
 * Edit deployment descriptors.
 */
eXide.edit.PackageEditor = (function () {
    
	Constr = function () {
		var $this = this;
        this.projects = new eXide.edit.Projects();
        this.currentProject = null;
		this.container = $("#dialog-deploy");
		this.container.dialog({
			title: "Deployment Editor",
			modal: false,
			autoOpen: false,
			width: 520,
			height: 600
		});
		
		this.syncDialog = $("#synchronize-dialog");
		this.syncDialog.dialog({
			title: "Synchronize to Directory",
			modal: false,
			autoOpen: false,
			width: 500,
			height: 400,
			buttons: {
            "Synchronize": function () {
					var dir = $this.syncDialog.find("input[name=\"dir\"]").val();
					if (!dir || dir.length == 0) {
						$("#synchronize-report").text("No output directory specified!");
						return;
					}
                    $this.currentProject.dir = dir;
                    
                    var params = $this.syncDialog.find("form").serialize();
					$("#synchronize-report").text("Synchronization in progress ...");
					$("#synchronize-report").load("modules/synchronize.xql", params);
				},
				"Close": function () { $(this).dialog("close"); }
			}
		});
        $this.syncDialog.find("input[name=\"auto\"]").click(function (ev) {
            if (!$this.currentProject) {
                return;
            }
            $this.currentProject.autoSync = $(this).is(':checked');
        });
	};
	
	Constr.prototype = {
			
			/**
			 * Open the deployment editor wizard
			 */
			open: function(collection) {
    			var $this = this;
				var params = null;
				if (collection)
					params = { "collection": collection };
				$.ajax({
					url: "modules/deployment.xql",
					type: "POST",
					data: params,
					success: function (data) {
						$this.container.html(data);
                        $this.container.find("input[name='collection']").change(function () {
                            var target = $this.container.find("input[name='target']");
                            if (target.val() === "")
                                target.val($(this).val());
                        });
						$this.container.form({
							done: function () {
								var params = $this.container.find("form").serialize();
								$.ajax({
									url: "modules/deployment.xql",
									type: "POST",
									data: params,
									success: function () {
										$this.container.dialog("close");
									},
									error: function (xhr, status) {
										eXide.util.error(xhr.responseText);
									}
								});
							},
							cancel: function () {
								$this.container.dialog("close");
							}
						});
						$this.container.find(".author-repeat").repeat("#author-add-trigger", { 
							deleteTrigger: "#author-remove-trigger"
						});
						$this.container.dialog("open");
					},
					error: function (xhr, status) {
						eXide.util.error(xhr.responseText);
					}
				});
			},
			
			/**
			 * Deploy the current application package.
			 */
			deploy: function(collection) {
				var $this = this;
				$.ajax({
					url: "modules/deployment.xql",
					type: "POST",
					dataType: "json",
					data: { "collection": collection, "deploy": "true" },
					success: function (data) {
						var url = location.protocol + "//" + location.hostname + ":" + location.port + "/exist/apps/" + data + "/";
						eXide.util.Dialog.message("Application Deployed", "<p>The application has been deployed. On a standard " +
								"installation the following link should open it:</p>" +
								"<center><a href=\"" + url + "\" target=\"_new\">" + url + "</a></center>");
					},
					error: function (xhr, status) {
						if (xhr.status == 404) {
							eXide.util.error("Deployment failed. The document currently opened in the editor " +
									"should belong to an application package.");
						} else {
							eXide.util.Dialog.warning("Deployment Error", "<p>An error has been reported by the database:</p>" +
								"<p>" + xhr.responseText + "</p>");
						}
					}
				});
			},

            download: function (collection) {
                window.location.href = "modules/deployment.xql?download=true&collection=" + encodeURIComponent(collection);
            },
            
			/**
			 * Synchronize current application package to file system directory.
			 */
			synchronize: function (collection) {
				var $this = this;
                $this.projects.getProject(collection, function (project) {
					if (!project.isAdmin) {
						eXide.util.error("You need to be logged in as an admin user with dba role " +
								"to use this feature.");
						return;
					}
                    $this.currentProject = project;
                    $this.syncDialog.find(".project-name").text(project.abbrev);
					$this.syncDialog.find("input[name=\"start\"]").val(project.deployed);
                    if (project.dir) {
                        $this.syncDialog.find("input[name=\"dir\"]").val(project.dir);
                    }
                    $this.syncDialog.find("input[name=\"collection\"]").val(project.root);
                    $this.syncDialog.find("input[name=\"auto\"]").val(project.autoSync ? "on" : "off");
					$this.syncDialog.dialog("open");
                });
			},
			
             autoSync: function (collection) {
                 var project = this.projects.getProjectFor(collection);
                 if (project && project.autoSync) {
                     var params = {
                         collection: project.root,
                         start: project.deployed,
                         dir: project.dir
                     };
                     $.ajax({
                        url: "modules/synchronize.xql",
                        type: "GET",
                        data: params,
                        success: function(data) {
                            eXide.util.message("Synchronized directory");
                        }
                     });
                 }
             },
             
			runApp: function (collection) {
				var $this = this;
                $this.projects.getProject(collection, function (project) {
    				var link = "/exist/apps/" + project.root.replace(/^\/db\//, "") + "/";
    				eXide.util.Dialog.message("Run Application " + project.abbrev, "<p>Click on the following link to open your application:</p>" +
    					"<center><a href=\"" + link + "\" target=\"_new\">" + link + "</a></center>");
                });
			},
            
            saveState: function () {
                this.projects.saveState();
            },
            
            restoreState: function () {
                this.projects.restoreState();
            }
	};
	
	return Constr;
}());