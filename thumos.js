var fs = require('fs');
var requirejs = require('requirejs');
var async = require('async');
var mkdirp = require('mkdirp');
var rmdir = require('rimraf');

module.exports = {
	config : function(config, callback){
		var thumosPath = config.thumosPath||'node_modules/thumos/';
		var components = thumosPath+'bower_components/';
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
		/* destroy current build */
		rmdir.sync(config.buildpath);
		/* build client side for each  */
		async.each(Object.keys(config.pages), function(view, cb){
			var url = config.pages[view];
			async.series([
				function(c){
					mkdirp(config.buildpath+url, c);
				}, 
				function(c){
					fs.symlink(__dirname+'/bower_components', config.buildpath+'/_', c);
				},
				function(c){
					fs.writeFile(
						config.buildpath+url+'index.html', 
						"<!doctype html><html><head><title></title><script data-main=\"./index.js\" src=\"/_/requirejs/require.js\"></script></head><body></body></html>", 
					c);
				},
				function(c){
					requirejs.optimize({
						basePath : './',
						paths : paths,
						optimize : 'none',
						stubModules : ['text', 'css', 'less', 'normalize', 'less-builder'],
						name : view,
						out : config.buildpath+url+'index.js'
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