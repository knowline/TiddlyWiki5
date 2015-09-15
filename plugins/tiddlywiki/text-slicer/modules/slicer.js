/*\
title: $:/plugins/tiddlywiki/text-slicer/modules/slicer.js
type: application/javascript
module-type: global

Main text-slicing logic

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var SLICER_OUTPUT_TITLE = "$:/TextSlicer";

function Slicer(wiki,sourceTitle) {
	this.wiki = wiki;
	this.sourceTitle = sourceTitle;
	this.currentId = 0;
	this.iframe = null; // Reference to iframe used for HTML parsing
	this.stopWordList = "the and a of on i".split(" ");
	this.tiddlers = {};
	this.parentStack = [];
	this.sliceTitle = null;
	this.slicers = $tw.modules.applyMethods("slicer");
}

Slicer.prototype.destroy = function() {
	// Remove the iframe from the DOM
	if(this.iframe && this.iframe.parentNode) {
		this.iframe.parentNode.removeChild(this.iframe);
	}
};

Slicer.prototype.addTiddler = function(fields) {
	if(fields.title) {
		this.tiddlers[fields.title] = $tw.utils.extend({},this.tiddlers[fields.title],fields);
		return fields.title;
	} else {
		return null;
	}
};

Slicer.prototype.addToList = function(parent,child) {
	var parentTiddler = this.tiddlers[parent] || {},
		parentList = parentTiddler.list || [];
	parentList.push(child);
	this.addTiddler($tw.utils.extend({title: parent},parentTiddler,{list: parentList}));
};

Slicer.prototype.popParentStackUntil = function(type) {
	// Pop the stack to remove any entries at the same or lower level
	var newLevel = this.convertTypeToLevel(type),
		topIndex = this.parentStack.length - 1;
	do {
		var topLevel = this.convertTypeToLevel(this.parentStack[this.parentStack.length - 1].type);
		if(topLevel !== null && topLevel < newLevel ) {
			break;
		}
		this.parentStack.length--;
	} while(true);
	return this.parentStack[this.parentStack.length - 1].title;
};


Slicer.prototype.convertTypeToLevel = function(type) {
	if(type.charAt(0) === "h") {
		return parseInt(type.charAt(1),10);			
	} else {
		return null;
	}
};

Slicer.prototype.isBlank = function(s) {
	return (/^[\s\xA0]*$/mg).test(s);
};

Slicer.prototype.getSourceHtmlDocument = function(tiddler) {
	this.iframe = document.createElement("iframe");
	document.body.appendChild(this.iframe);
	this.iframe.contentWindow.document.open();
	this.iframe.contentWindow.document.write(tiddler.fields.text);
	this.iframe.contentWindow.document.close();
	return this.iframe.contentWindow.document;
};

Slicer.prototype.getSourceWikiDocument = function(tiddler) {
	var widgetNode = this.wiki.makeTranscludeWidget(this.sourceTitle,{document: $tw.fakeDocument, parseAsInline: false}),
		container = $tw.fakeDocument.createElement("div");
	widgetNode.render(container,null);
	return container;
};

Slicer.prototype.getSourceDocument = function() {
	var tiddler = $tw.wiki.getTiddler(this.sourceTitle);
	if(tiddler.fields.type === "text/html") {
		return this.getSourceHtmlDocument(tiddler);
	} else {
		return this.getSourceWikiDocument(tiddler);
	}
};

Slicer.prototype.makeUniqueTitle = function(prefix,rawText) {
	// Remove characters other than lowercase alphanumeric and spaces
	var self = this,
		cleanText;
	if(rawText) {
		cleanText = rawText.toLowerCase().replace(/[^\s\xA0]/mg,function($0,$1,$2) {
			if(($0 >= "a" && $0 <= "z") || ($0 >= "0" && $0 <= "9")) {
				return $0;
			} else {
				return " ";
			}
		});
		// Split on word boundaries
		var words = cleanText.split(/[\s\xA0]+/mg);
		// Remove common words
		words = words.filter(function(word) {
			return word && (self.stopWordList.indexOf(word) === -1);
		});
		// Accumulate the number of words that will fit
		var c = 0,
			s = "";
		while(c < words.length && (s.length + words[c].length + 1) < 50) {
			s += "-" + words[c++];
		}
		prefix = prefix + s;
	}
	// Check for duplicates
	var baseTitle = prefix;
	c = 0;
	var title = baseTitle;
	while(this.tiddlers[title] || this.wiki.tiddlerExists(title) || this.wiki.isShadowTiddler(title) || this.wiki.findDraft(title)) {
		title = baseTitle + "-" + (++c);
	}
	return title;
};

Slicer.prototype.processNodeList = function(domNodeList) {
	$tw.utils.each(domNodeList,this.processNode.bind(this));
}

Slicer.prototype.processNode = function(domNode) {
	var text = $tw.utils.htmlEncode(domNode.textContent),
		nodeType = domNode.nodeType;
	if(nodeType === 1) { // DOM element nodes
		var tagName = domNode.tagName.toLowerCase(),
			hasProcessed = false;
		for(var slicerTitle in this.slicers) {
			var slicer = this.slicers[slicerTitle];
			if(slicer.bind(this)(domNode,tagName)) {
				hasProcessed = true;
				break;
			}
		}
		if(!hasProcessed) {
			if(domNode.hasChildNodes()) {
				this.processNodeList(domNode.childNodes);
			}
		}
	}
};

// Slice a tiddler into individual tiddlers
Slicer.prototype.sliceTiddler = function(title) {
	this.sliceTitle = title;
	var domNode = this.getSourceDocument();
	this.parentStack.push({type: "h0", title: this.addTiddler({
		title: "Sliced up " + title,
		text: "Document sliced at " + (new Date()),
		list: [],
		"toc-type": "document"
	})});
	this.processNodeList(domNode.childNodes);
};

// Output directly to the output tiddlers
Slicer.prototype.outputTiddlers = function() {
	var self = this;
	$tw.utils.each(this.tiddlers,function(tiddlerFields) {
		var title = tiddlerFields.title;
		if(title) {
			$tw.wiki.addTiddler(new $tw.Tiddler(self.wiki.getCreationFields(),tiddlerFields,self.wiki.getModificationFields()));
		}
	});
};

exports.Slicer = Slicer;

})();