var async = require('async');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var cheerio = require('cheerio');
var express = require('express');
var fs = require('fs');
var mongo = require('./lib/db');
var mkdirp = require('mkdirp');
var prequire = require('parent-require');
var requirejs = require('requirejs');
var rmdir = require('rimraf');

var api = {
	db : {},
	require : {},
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
			type : thumosPath+'loaders/type',
			css : thumosPath+'loaders/css',
			compat : thumosPath+'loaders/compat',
			text : components+'requirejs-text/text',
			less : components+'require-less/less',
				'less-builder' : components+'require-less/less-builder',
				normalize : components+'require-less/normalize',
			crc32 : thumosPath+'node_modules/crc-32/crc32',
			jquery : components+'jQuery/dist/jquery.min',
			async : components+'async/lib/async',
			underscore : components+'underscore/underscore'
		}
		/* overload all paths with user set config paths */
		var serverPaths = {};
		for(var key in config.paths) paths[key] = config.paths[key];
		for(var key in paths) serverPaths[key] = paths[key];
		/* config requirejs (only in node does not apply to ) */
		requirejs.config({
			waitSeconds : 0, //no timeout
			paths : serverPaths,
			nodeRequire: require
		});
		/* setup a separate context from the build, as that will fuck everything */
		api.require = requirejs.config({
			waitSeconds : 0, 
			nodeRequire: require,
        	context:'requirejsModuleLoading',
			paths : serverPaths,
		    nodeRequire: require
		});
		var _ = requirejs('underscore');
		/* destroy old build */
		rmdir.sync(config.buildpath);
		/* build client side for each  */
		var buildText = "";
		async.eachSeries(config.pages, function(page, cb){
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
						require.config(JSON.parse('"+JSON.stringify({})+"'));\
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
						insertRequire : [clientInit],
						allowSourceOverwrites: true
					}, function(buildResponse){
						buildText += buildResponse;
						c();
					});
				}
			], cb);
		}, init);
		/* express / misc init */
		var setup = {};
		function init(e){
			if(e) callback(e);
			else{
				/* thumos global router setup */
				var trouter = express.Router();
				config.app.use(cookieParser("secret"));
				config.app.use(config.route||'/', trouter);
				
				setup = {
					/* prse buildtext to get required sets/types */
					sets : _.uniq(buildText.split('\n').filter(function(line){
						return line.match(/^set!/);
					})),
					types : _.uniq(buildText.split('\n').filter(function(line){
						return line.match(/^type!/);
					})),
					express : {
						router : trouter,
						json : function(req, res, next){
							bodyParser.json()(req, res, function(e){
								if(e) res.json({error:'json'}); //catch some bullshit json
								else next();
							});
						},
						handle : function(res){
							return function(e, response){
								if(e) res.json({error : e});
								else res.json(response);
							}
						}
					}
				};
				
				/* initialize authentication */
				config.auth.init(api.set, function(e, router){
					if(e) callback(e);
					else{
						config.app.use(router);
						types();
					}
				});
			}
		}
		/* types setup */
		function types(e){
			if(e) callback(e);
			else{
				/* types setup */
				if(setup.types) async.eachSeries(setup.types, function(typePath, cb){
					api.require([typePath], function(type){
						type.init(function(path){
							return prequire(type.path+'/node_modules/'+path);
						}, config, cb);
					});
				}, routes);
				else routes();
			}
		}
		
		function routes(){
			/* set routes */
			if(setup.sets) api.set(setup.sets, function(){
				async.eachSeries(arguments, function(set, cb){
					var router = express.Router();
					var json = setup.express.json;
					var handle = setup.express.handle;
					router.use(config.auth.verify);
					router.route('/')
						.get(function(req, res){ //list according to default query
							set.find({}, handle(res));
						})
						.post(json, function(req, res){
							//add new model(s) to set, return models
							set.add(req.body, handle(res));
						})
						.put(json, function(req, res){
							//update existing models, return models
							set.update(req.body, handle(res));
						});
					router.route('/:ids')
						.get(function(req, res){ //get models by id
							set.get(req.params.ids.split(','), handle(res));
						})
						.delete(function(req, res){ //delete models by id
							set.del(req.params.ids.split(','), handle(res));
						});
					/* setup find querying routes, property data sent via post. fuck the ReSt */
					router.route('/q/:queryname').post(json, function(req, res){
						set.query(req.params.queryname, req.body, handle(res));
					});
					/* find type query */
					router.route('/find').post(json, function(req, res){
						set.find(req.body, handle(res));
					});
					setup.express.router.use(set.config.path||'/'+set.config.name, router);
					cb();
				}, callback);
			});
			else callback();
		}
	},
	/* require and setup some sets */
	set : function(setPaths, callback){
		setPaths = setPaths.map(function(setname){
			return setname.match(/^set!/)?setname:'set!'+setname;
		});
		api.require(setPaths, function(){
			for(var i in arguments){
				var set = arguments[i];
				/* pass in db api */
				set.db = {
					collection : api.db.collection(set.config.collection||set.config.name),
					id : api.db.id,
					str : api.db.str
				}
			}
			callback.apply(this, arguments);
		});
	},
	auth : require('./lib/auth')
}
module.exports = api;