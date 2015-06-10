var async = require('async');
var cheerio = require('cheerio');
var fs = require('fs');
var mkdirp = require('mkdirp');
var requirejs = require('requirejs');
var rmdir = require('rimraf');
var postcss = require('postcss');
var autoprefixer = require('autoprefixer-core');

module.exports = {
	config : function(config, callback){
		var thumosPath = config.thumosPath||'node_modules/thumos/';
		var components = thumosPath+'bower_components/';
		var html = fs.readFileSync(config.html||thumosPath+'client/def.html'); //html to populate
		var reqjs = fs.readFileSync(components+'requirejs/require.js');
		var client = thumosPath+'client/client';
		/* by default use thumos' included plugins */
		var paths = {
			model : thumosPath+'client/model',
			view : thumosPath+'client/view',
			text : components+'requirejs-text/text',
			css : components+'require-css/css',
				'css-builder' : components+'require-css/css-builder',
    			normalize : components+'require-css/normalize',
			less : components+'require-less/less',
				'less-builder' : components+'require-less/less-builder',
			jquery : components+'jQuery/dist/jquery.min'
			
		}
		/* overload all paths with user set config paths */
		for(var key in config.paths) paths[key] = config.paths[key];
		for(var key in config.ext){
			paths[key] = config.ext[key][0]; //take first of possibles
		}
		/* config requirejs (only in node does not apply to ) */
		requirejs.config({
			waitSeconds : 0, //no timeout
			paths : paths
		});
		/* destroy old build */
		rmdir.sync(config.buildpath);
		/* build client side for each  */
		async.each(config.pages, function(page, cb){
			var out = config.buildpath+page.url+'index.js';
			async.series([
				function(c){ //make the directory for the page
					mkdirp(config.buildpath+page.url, c);
				}, 
				function(c){ //create the root symlink to thumos components
					fs.symlink('./', config.buildpath+'/_', c);
				},
				function(c){ //make and write our html
					var $ = cheerio.load(html, {
						normalizeWhitespace : config.uglify
					});
					$('title').text(page.title);
					$('head').append("<script data-main=\"./index.js\">"+reqjs+"\
						require.config(JSON.parse('"+JSON.stringify({paths : config.ext})+"'));\
					</script>");
					fs.writeFile(config.buildpath+page.url+'index.html', $.html(), c);
				},
				function(c){
					requirejs.optimize({
						basePath : './',
						paths : paths,
						packages : [
							{
								name : 'init',
								location : page.view,
								main : 'index' 
							}
						],
						shim : config.shim||{},
						preserveLicenseComments: !config.uglify,
						optimize : config.uglify?'uglify':'none',
						stubModules : ['text', 'css', 'less', 'normalize', 'less-builder'],
						name : client,
						out : out,
						insertRequire : [client]
					}, function(e){
						console.log(e);
						c();
					});
				},
				function(c){
					fs.readFile(out, 'utf8', function(e, build){
						postcss([autoprefixer]).process(build.match(/cssText=e.*e\)\)\}\(\"(.*)\"\),require/)[1]).then(function(result){
							fs.writeFile(out, build.replace(/cssText=e.*e\)\)\}\(\"(.*)\"\),require/, result.css), 'utf8', c);
						});
					})
				}
			], cb);
		});
		/* setup routes TODO*/
		requirejs(config.models, function(){
			//console.log(arguments)
		});
	}
}