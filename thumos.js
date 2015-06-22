var async = require('async');
var cheerio = require('cheerio');
var express = require('express');
var fs = require('fs');
var mongo = require('./lib/db');
var mkdirp = require('mkdirp');
var requirejs = require('requirejs');
var rmdir = require('rimraf');

module.exports = function(config, callback){
	var thumosPath = config.thumosPath||'node_modules/thumos/';
	var components = thumosPath+'bower_components/';
	var html = fs.readFileSync(config.html||thumosPath+'lib/def.html'); //html to populate
	var reqjs = fs.readFileSync(components+'requirejs/require.js');
	var client = thumosPath+'lib/client';
	/* by default use thumos' included plugins */
	var paths = {
		set : thumosPath+'loaders/set',
		view : thumosPath+'loaders/view',
		css : thumosPath+'loaders/css',
		compat : thumosPath+'loaders/compat',
		text : components+'requirejs-text/text',
		less : components+'require-less/less',
			'less-builder' : components+'require-less/less-builder',
			normalize : components+'require-less/normalize',
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
					stubModules : ['text', 'css', 'normalize', 'less-builder'],
					name : client,
					out : out,
					insertRequire : [client]
				}, function(e){
					console.log(e);
					c();
				});
			}
		], cb);
	});
	/* make sure all sets are required with the plugin */
	config.sets = config.sets.map(function(setname){
		return setname.match(/^set!/)?setname:'set!'+setname;
	});
	requirejs(config.sets, function(){
		/* iterate over each set and setup server side */
		async.each(arguments, function(set, cb){
			console.log(set);
			var router = express.Router();
			router.route('/')
				.get(function(req, res){
					//list according to default query
				})
				.post(function(req, res){
					//add new model(s) to set, return models
				})
				.put(function(req, res){
					//update existing models, return models
				});
			router.route('/:ids')
				.get(function(req, res){
					//get models by id
				})
				.delete(function(req, res){
					//delete models by id
				});
			router.route('/q/:queryname').post(function(req, res){
				//accept query parameters in body return models
			});
			//config.app.use(set.path||'/'+set.name, router);
			cb();
		}, function(){
		
		});
	});
}