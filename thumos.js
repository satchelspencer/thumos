var async = require('async');
var cheerio = require('cheerio');
var fs = require('fs');
var mkdirp = require('mkdirp');
var requirejs = require('requirejs');
var rmdir = require('rimraf');

module.exports = {
	config : function(config, callback){
		var thumosPath = config.thumosPath||'node_modules/thumos/';
		var components = thumosPath+'bower_components/';
		var html = fs.readFileSync(thumosPath+(config.html||'def.html')); //html to populate
		/* by default use thumos' included plugins */
		var paths = {
			model : thumosPath+'model',
			view : thumosPath+'view',
			text : components+'requirejs-text/text',
			css : components+'require-css/css',
				'css-builder' : components+'require-css/css-builder',
    			normalize : components+'require-css/normalize',
			less : components+'require-less/less',
				'less-builder' : components+'require-less/less-builder'
		}
		/* overload all paths with user set config paths */
		for(var key in config.paths) paths[key] = config.paths[key];
		/* config requirejs */
		requirejs.config({
			waitSeconds : 0, //no timeout
			paths : paths
		});
		/* destroy old build */
		rmdir.sync(config.buildpath);
		/* build client side for each  */
		async.each(config.pages, function(page, cb){
			async.series([
				function(c){ //make the directory for the page
					mkdirp(config.buildpath+page.url, c);
				}, 
				function(c){ //create the root symlink to thumos components
					fs.symlink(__dirname+'/bower_components', config.buildpath+'/_', c);
				},
				function(c){ //make and write our html
					var $ = cheerio.load(html, {
						normalizeWhitespace : true
					});
					$('title').text(page.title);
					$('head').append("<script data-main=\"./index.js\" src=\"/_/requirejs/require.js\"></script>");
					fs.writeFile(config.buildpath+page.url+'index.html', $.html(), c);
				},
				function(c){
					requirejs.optimize({
						basePath : './',
						paths : paths,
						optimize : 'uglify',
						stubModules : ['text', 'css', 'less', 'normalize', 'less-builder'],
						name : page.view,
						out : config.buildpath+page.url+'index.js'
					}, c);
				}
			], cb);
		}, function(e){
			console.log(e);
		});
		/* setup routes TODO*/
		requirejs(config.models, function(){
			//console.log(arguments)
		});
	}
}