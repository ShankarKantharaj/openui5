/*!
 * ${copyright}
 */

/*global location */
sap.ui.define([
		"sap/ui/model/json/JSONModel",
		"sap/ui/documentation/sdk/controller/BaseController",
		"sap/ui/documentation/sdk/controller/util/ControlsInfo",
		"sap/ui/documentation/sdk/controller/util/EntityInfo",
		"sap/ui/documentation/sdk/controller/util/APIInfo",
		"sap/ui/documentation/sdk/util/ToggleFullScreenHandler",
		"sap/ui/documentation/sdk/controller/util/JSDocUtil"
	], function (JSONModel, BaseController, ControlsInfo,
				 EntityInfo, APIInfo, ToggleFullScreenHandler, JSDocUtil) {
		"use strict";

		return BaseController.extend("sap.ui.documentation.sdk.controller.Entity", {

			/* =========================================================== */
			/* lifecycle methods										   */
			/* =========================================================== */

			onInit: function () {

				this.router = this.getRouter();
				this.router.getRoute("entity").attachPatternMatched(this.onRouteMatched, this);

				this._oObjectPage = this.byId("ObjectPageLayout");

				this.getView().setModel(new JSONModel());
			},

			/* =========================================================== */
			/* begin: internal methods									 */
			/* =========================================================== */

			onTypeLinkPress: function (oEvt) {
				// navigate to entity
				var sType = oEvt.getSource().data("type");
				this.getRouter().navTo("entity", {id: sType}, false);
			},

			onAPIRefPress: function (oEvt) {
				var sEntityName = oEvt.getSource().data("name");
				this.getRouter().navTo("apiId", {id: sEntityName}, false);
			},

			onTabSelect: function (oEvt) {
				// update URL without updating history
				var sTab = oEvt.getParameter("key");
				this.router.navTo("entity", {
					id: this._sId,
					part: sTab
				}, true);
			},

			onNavBack: function (oEvt) {
				this.router.myNavBack("home", {});
			},

			onNavToSample: function (oEvt) {
				var sPath = oEvt.getSource().getBindingContext().getPath();
				var oSample = this.getView().getModel().getProperty(sPath);
				this.router.navTo("sample", {
					id: oSample.id
				});
			},

			/**
			 * This function wraps a text in a span tag so that it can be represented in an HTML control.
			 * @param {string} sText text to be wrapped and formatted
			 * @returns {string} formatted and wrapped text
			 * @private
			 */
			_wrapInSpanTag: function (sText) {

				var sFormattedTextBlock = JSDocUtil.formatTextBlock(sText, {
					linkFormatter: function (sTarget, sText) {
						var sRoute = "entity",
							aTargetParts,
							aMatched,
							iP;

						sText = sText || sTarget; // keep the full target in the fallback text

						// If the link has a protocol, do not modify, but open in a new window
						if (sTarget.match("://")) {
							return '<a target="_blank" href="' + sTarget + '">' + sText + '</a>';
						}

						sTarget = sTarget.trim().replace(/\.prototype\./g, "#");
						iP = sTarget.indexOf("#");
						if ( iP === 0 ) {
							// a relative reference - we can't support that
							return "<code>" + sTarget.slice(1) + "</code>";
						} else if ( iP > 0 ) {
							sTarget = sTarget.slice(0, iP);
						}

						// Handle links to documentation
						aMatched = sTarget.match(/^topic:(\w{32})$/);
						if (aMatched) {
							sTarget = aMatched[1];
							sRoute = "topic";
						}

						// link refers to a method or event data-sap-ui-target="<class name>/methods/<method name>" OR
						// data-sap-ui-target="<class name>/events/<event name>
						// in this case we need to redirect to API Documentation section
						aTargetParts = sTarget.split('/');
						if (aTargetParts.length > 1 &&
							["methods", "events"].indexOf(aTargetParts[1].toLowerCase()) !== -1) {
							sRoute = "api";
						}

						return '<a class="jsdoclink" href="#/' + sRoute + '/' + sTarget + '">' + sText + '</a>';

					}
				});

				return '<span class="sapUiJSD">' + sFormattedTextBlock + '</span>';
			},

			_TAB_KEYS: ["samples", "about"],

			_loadSample: function (oControlsData) {

				var sNewId = this._sNewId;

				var aFilteredEntities = oControlsData.entities.filter(function (entity) {
					return entity.id === sNewId;
				});
				var oEntity = aFilteredEntities.length ? aFilteredEntities[0] : undefined;

				function updateTabs() {
					// handle unknown tab
					if (this._TAB_KEYS.indexOf(this._sNewTab) === -1) {
						this._sNewTab = "samples";
					}

					// handle invisible tab
					if (!oData.show[this._sNewTab]) {
						this._sNewTab = "samples";
					}

					this._switchPageTab();

					jQuery.sap.delayedCall(0, this, function () {
						this._oObjectPage.setBusy(false);
					});
				}

				// set data model
				var oData;
				if (this._sId !== sNewId) {

					// retrieve entity docu from server
					EntityInfo.getEntityDocuAsync(sNewId, oEntity && oEntity.library).then(function (oDoc) {

						// route to not found page IF there is NO index entry AND NO docu from server
						if (!oEntity && !oDoc) {
							this.router.myNavToWithoutHash("sap.ui.documentation.sdk.view.NotFound", "XML", false);
							return;
						}

						APIInfo.getIndexJsonPromise().then(function (result) {
							var aFilteredResult;

							// get view data
							oData = this._getViewData(sNewId, oDoc, oEntity, oControlsData);
							aFilteredResult = result.filter(function (element) {
								return element.name === oData.name;
							});
							oData.bHasAPIReference = aFilteredResult && aFilteredResult.length > 0;

							// set view model
							this.getView().getModel().setData(oData, false /* no merge with previous data */);

							// done, we can now switch the id
							this._sId = sNewId;

							updateTabs.call(this);

						}.bind(this));
					}.bind(this));

				} else {
					// get existing data model
					oData = this.getView().getModel().getData();
					updateTabs.call(this);
				}

			},


			onRouteMatched: function (oEvt) {
				this._oObjectPage.setBusy(true);

				this._sNewId = oEvt.getParameter("arguments").id;
				this._sNewTab = oEvt.getParameter("arguments").sectionTab;

				ControlsInfo.loadData().then(function (oData) {
					this._loadSample(oData);
				}.bind(this));

				this.searchResultsButtonVisibilitySwitch(this.byId("entityBackToSearch"));
			},

			onToggleFullScreen: function (oEvt) {
				ToggleFullScreenHandler.updateMode(oEvt, this.getView(), this);
			},

			// ========= internal ===========================================================================
			_getViewData: function (sId, oDoc, oEntity, oControlsData) {

				// convert docu
				var oData = this._convertEntityInfo(sId, oDoc, oControlsData),
					bShouldShowSamplesSection = false,
					iSamplesCount = 0;

				if (oEntity) {

					// show the description as intro text if the entity is not deprecated
					if (!oData.shortDescription && oEntity.description) {
						oData.shortDescription = oEntity.description;
					}

					// make intro text active if a documentation link is set
					if (oEntity.docuLink) {
						oData.show.introLink = true;
						oData.docuLink = oEntity.docuLink.replace("docs/guide", "topic").replace(/\.html$/, "");
					} else {
						oData.show.introLink = false;
					}

					if (!oData.baseName) {
						oData.baseName = oEntity.name;
					}

					bShouldShowSamplesSection = oEntity.samples.length > 0;
					iSamplesCount = oEntity.samples.length;
				}

				// apply entity related stuff
				oData.show.samples = bShouldShowSamplesSection;
				oData.count.samples = iSamplesCount;
				oData.entity = oEntity;

				// done
				return oData;
			},

			_convertEntityInfo: function (sId, oDoc, oControlsData) {

				// create skeleton data structure
				var oData = {
					name: sId,
					deprecated: (oDoc) ? this._formatDeprecated(oDoc.deprecation) : null,
					deprecatedMark: (oDoc) ? this._createDeprecatedMark(oDoc.deprecation) : null,
					baseType: (oDoc) ? this._formatType(oDoc.baseType) : null,
					baseTypeText: (oDoc) ? this._formatTypeText(oDoc.baseType) : "-",
					baseTypeNav: (oDoc) ? this._formatTypeNav(oDoc.baseType) : null,
					shortDescription: (oDoc) ? this._formatDeprecatedDescription(oDoc.deprecation) : null,
					description: (oDoc) ? this._wrapInSpanTag(oDoc.doc) : null,
					docuLink: null,
					values: oDoc ? oDoc.values : [],
					show: {
						baseType: (oDoc) ? !!oDoc.baseType : false,
						about: !!oDoc,
						values: false,
						introActive: false
					},
					count: {
						samples: 0
					},
					appComponent: this._getControlComponent(sId, oControlsData)
				};

				// no documentation !
				if (!oDoc) {
					return oData;
				}

				// determine if the parts shall be shown
				oData.show.values = Array.isArray(oData.values) && oData.values.length > 0;

				return oData;
			},

			/**
			 * Sets the boolean-as-string flag
			 */
			_formatDeprecated: function (sDeprecation) {
				return (sDeprecation && sDeprecation.length > 0) ? "true" : "false";
			},

			/**
			 * Adds the string "Deprecated" in front of the deprecation description.
			 */
			_formatDeprecatedDescription: function (sDeprecation) {
				return (sDeprecation && sDeprecation.length > 0 ) ? (this._createDeprecatedMark(sDeprecation) + ": " + sDeprecation) : null;
			},

			/**
			 * Converts the type to navigable type
			 */
			_formatType: function (sType) {
				if (!sType) {
					return null;
				} else {
					// remove arrays
					return sType.replace("[]", "");
				}
			},

			/**
			 * Converts the type to a friendly readable text
			 */
			_formatTypeText: function (sType) {
				if (!sType) {
					return null;
				} else {
					// remove core prefix
					sType = sType.replace("sap.ui.core.", "");
					// only take text after last dot
					var index = sType.lastIndexOf(".");
					return (index !== -1) ? sType.substr(index + 1) : sType;
				}
			},

			/**
			 * Converts the deprecated boolean to a human readable text
			 */
			_createDeprecatedMark: function (sDeprecated) {
				return (sDeprecated) ? "Deprecated" : "";
			},

			_switchPageTab: function () {

				var oSection = this.byId(this._sNewTab);
				if (!oSection) {
					return;
				}
				if (this._oObjectPage) {
					this._oObjectPage.attachEvent("onAfterRenderingDOMReady", function () {
						this._oObjectPage.setSelectedSection(oSection.getId());
					}, this);
				}
			},

			backToSearch: function () {
				this.onNavBack();
			},

			/**
			 * Determines if the type can be navigated to
			 */
			_baseTypes: [
				"sap.ui.core.any",
				"sap.ui.core.object",
				"sap.ui.core.function",
				"sap.ui.core.number", // TODO discuss with Thomas, type does not exist
				"sap.ui.core.float",
				"sap.ui.core.int",
				"sap.ui.core.boolean",
				"sap.ui.core.string",
				"sap.ui.core.URI", // TODO discuss with Thomas, type is not a base type (it has documentation)
				"sap.ui.core.ID", // TODO discuss with Thomas, type is not a base type (it has documentation)
				"sap.ui.core.void",
				"sap.ui.core.CSSSize", // TODO discuss with Thomas, type is not a base type (it has documentation)
				"any",
				"object",
				"function",
				"float",
				"int",
				"boolean",
				"string"
			],
			_formatTypeNav: function (sType) {
				return this._baseTypes.indexOf(sType) === -1;
			}
		});
	}
);