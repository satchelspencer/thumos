var async = require('async');
var bodyParser = require('body-parser');
var cheerio = require('cheerio');
var express = require('express');
var fs = require('fs');
var mongo = require('./lib/db');
var mkdirp = require('mkdirp');
var requirejs = require('requirejs');
var rmdir = require('rimraf');

var api = {
	db : {},
	init : function(config, callback){
		/* setup db */
		api.db = mongo(config.mongo);
		/* misc */
		var thumosPath = config.thumosPath||'node_modules/thumos/';
		var components = thumosPath+'bower_components/';
		var html = fs.readFileSync(config.html||thumosPath+'client/def.html'); //html to populate
		var reqjs = fs.readFileSync(components+'requirejs/require.js');
		var clientInit = thumosPath+'client/init';
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
						name : clientInit,
						out : out,
						insertRequire : [clientInit]
					}, function(e){
						console.log(e);
						c();
					});
				}
			], cb);
		});
		/* thumos global router setup */
		var trouter = express.Router();
		config.app.use(config.route||'/', trouter);
		
		/* setup authentication init */
		config.auth.init(api.set, config.app, function(){});
		
		/* set routes */
		api.set(config.sets, function(){
			async.each(arguments, function(set, cb){
				var router = express.Router();
				router.use(bodyParser.json());
				router.route('/')
					.get(function(req, res){ //list according to default query
						set.query(function(e, models){
							res.json(models);
						});
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
				trouter.use(set.config.path||'/'+set.config.name, router);
				cb();
			}, function(){
			
			});
		});
	},
	/* require and setup some sets */
	set : function(setPaths, callback){
		setPaths = setPaths.map(function(setname){
			return setname.match(/^set!/)?setname:'set!'+setname;
		});
		requirejs(setPaths, function(){
			for(var i in arguments){
				var set = arguments[i];
				set.collection = api.db.collection(set.config.collection||set.config.name);
			}
			callback.apply(this, arguments);
		});
	},
	auth : require('./lib/auth')
}
module.exports = api;