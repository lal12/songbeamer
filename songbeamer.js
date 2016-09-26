"use strict";

const util = require('util')

var sng2json;
{
	sng2json = function(data){
		data = data.trim();
		data = data.split('\r\n');
		var textBegin = data.indexOf('---');
		{
			var altTextBegin = data.indexOf('--');
			if(altTextBegin > 0 && textBegin > altTextBegin)
				textBegin = altTextBegin;
			if(textBegin == -1){
				throw {msg: "Could not find text part in sng data!", data: data};
			}
		}
		var props = parseProperties(data.slice(0, textBegin));
		if(props == false)
			throw {msg: "Could not parse properties of sng data!", data: data};
		if(!props['LangCount'])
			props['LangCount'] = 1;
		
		if(!props['VerseOrder']){
			props['VerseOrder'] = [];
		}
		
		var songtext = data.slice(textBegin);
		// Removes empty lines and lines with verse seperators from end of songtext
		while(	songtext[songtext.length-1].trim().length == 0 
				|| ['---', '--'].indexOf(songtext[songtext.length-1].trim()) > -1){
			songtext.pop();
		}
		var texts = parseSongtext(songtext, props);
		return {props: props, texts: texts};
	}

	function parseSongtext(data, props){
		var tags = ["Unbekannt", "Unbennant", "Unknown", "Intro", "Intro", "Vers", "Verse", "Strophe", "Pre-Bridge",
			"Bridge", "Misc", "Pre-Refrain", "Refrain", "Pre-Chorus", "Chorus", "Pre-Coda", "Zwischenspiel", "Interlude",
			"Coda", "Ending", "Teil", "Part"
		];
		// Parse Lines into Parts
		var verseOrderDef = props['VerseOrder'].length > 0;

		let verse = '';
		let slide = 0;
		let verses = {};
		while(data.length){
			if(data[0] == '---'){
				if(data[1] == '--'){ // Prevent empty slides / verses
					data[1] = data[0];
					continue;
				}else if(data[1] == '---'){
					data.shift();
					continue;
				}
				
				function parseTag(tag){
					if(tag.startsWith('$$')){
						let matches = /\$\$[A-Za-z]=([\u00C0-\u017Fa-zA-z 0-9]+ ?(\([A-Za-z]\))?)/.exec(tag);
						if(matches.length < 2)
							throw {msg: "Invalid userdefined tag!", data: { tag: tag }};
						return matches[1];
					}else if(tags.indexOf(tag) > -1){
						return tag;
					}
					return false;
				}
				if(verseOrderDef && props['VerseOrder'].indexOf(parseTag(data[1])) >= 0 ){ // New verse with predefined header
					verse = data[1];
					slide = 0;
					verses[verse] = [[]];
					data.shift();
				}else{ // New Verse but no headers are defined
					let tag = parseTag(data[1]);
					if(tag !== false){ // If valid tag is specified
						props['VerseOrder'].push(tag);
						verse = tag;
						data.shift();
					}else{ // Else first line is used as title
						verse = data[1];
						props['VerseOrder'].push(data[1]);
					}
					verses[verse] = [[]];
					slide = 0;
				}
			}else if(data[0] == '--'){
				slide++;
				verses[verse][slide] = [];
			}else{
				verses[verse][slide].push(data[0]);
			}
			data.shift();
		}
		
		// Put each line in a array, if there are multiple languages, put multiple lines in those arrays
		for(var a in verses){ // Iterate through verses
			for(var b in verses[a]){ // Iterate through all slides in verse
				let newSlide = [];
				for(var c in verses[a][b]){ // Iterate through all lines in slide
					if(c % props['LangCount'] == 0)
						newSlide.push([]);
					newSlide[(c / props['LangCount']) << 0][c % props['LangCount']] = verses[a][b][c];
				}
				verses[a][b] = newSlide;
			}
		}

		return verses;
	}

	function parseProperties(data){
		var props = {};
		for(var ln of data){
			if(ln.trim().length == 0)
				continue;
			if(!ln.startsWith('#')){
				throw {msg: "Malformed property (does not begin with #)!", data:{ln: ln, data: data}};
			}
			var parts = /#(\([A-Za-z0-9]\)|[A-Za-z0-9]+)=(.*)/.exec(ln);
			if(!parts || parts.length != 3){
				//throw {msg: "Malformed property!", data:{ln: ln, parts: parts, data: data}};
				continue;
			}
			var propname = parts[1];
			var val = parts[2];
			
			if(propname == 'Title'){
				val = [val];
			}else if(propname.startsWith('TitleLang')){
				var index = parseInt(propname.substr('TitleLang'.length));
				propname = "Title";
				var tmpval = val;
				if(!props["Title"])
					props["Title"] = [];
				val = props["Title"];
				val[index] = tmpval;
			}else if(propname == 'Font'){
				val = [val];
			}else if(propname.startsWith('FontLang')){
				var index = parseInt(propname.substr('FontLang'.length));
				propname = "Font";
				var tmpval = val;
				val = props["Font"] || [];
				val[index] = tmpval;
			}else if(propname == 'VerseOrder'){
				val = val.split(',');
			}else if(propname == 'Comments'){
				var b = new Buffer(val, 'base64')
				val = b.toString();
			}else if(propname == 'Chords'){
				var b = new Buffer(val, 'base64')
				val = b.toString().split("\r");
			}else if(propname == 'Keywords'){
				val = val.split(" ");
			}else if(propname == 'Categories'){
				val = val.split(",");
			}else if(propname == 'BackgroundImage' && val.startsWith('color://')){
				propname = 'BackgroundColor';
				var regex = /color:\/\/\$([0-9a-fA-F]{8})/;
				var matches = regex.exec(val);
				if(matches.length != 2){
					console.warn("Malformed Property");
					continue;
				}
				val = parseInt(matches[1], 16);
				val = {rgb: val & 0xFFFFFF}
			}else if(propname == '(c)'){
				propname = 'Copyright';
				val = val.split('|');
			}
			if(propname in ['Version', 'FontSize', 'Tempo', 'LangCount', 'ChurchSongID', 'CCLI']){
				val = parseInt(val);
			}
			if(Array.isArray(val))
				for(var i in val) 
					val[i] = val[i].trim();
			else if(val.trim)
				val.trim();
			
			props[propname] = val;
		}
		if(props['Lang']){
			props['Lang'] = [props['Lang']];
			if(props['LangCount'] && props['LangCount'] > 1){
				if(props['Lang'][0] == 'de')
					props['Lang'][1] == 'en';
				else
					props['Lang'][1] == 'de';
				props['Lang'][0] = 'en';
			}
		}
		return props;
	}
}

module.exports = sng2json;