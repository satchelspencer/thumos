var async = require('async');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var cheerio = require('cheerio');
var express = require('express');
var fs = require('fs-extra');
var lookup = require('module-lookup-amd');
var mongo = require('./lib/db');
var path = require('path');
var prequire = require('parent-require');
var requirejs = require('requirejs');

var api = {
	db : {},
	require : {},
	init : function(config, callback){
		api.config = config;
		var logger = {
			oglog : console.log,
			log : function(){
				if(config.verbose) console.log.apply(this, arguments);
			},
			disable : function(){
				console.log = function(){};
			},
			enable : function(){
				console.log = logger.oglog;
			}
		}
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
			container : thumosPath+'require/container',
			setRequire : thumosPath+'require/index',
			set : thumosPath+'loaders/set',
			view : thumosPath+'loaders/view',
			dir : thumosPath+'loaders/dir',
			type : thumosPath+'loaders/type',
			style : thumosPath+'loaders/style',
			compat : thumosPath+'loaders/compat',
			ajax : thumosPath+'lib/ajax',
			text : components+'requirejs-text/text',
			less : components+'require-less/less',
				'less-builder' : components+'require-less/less-builder',
				normalize : components+'require-less/normalize',
			css : components+'require-css/css',
				'css-builder' : components+'require-css/css-builder',
				normalize : components+'require-css/normalize',
			crc32 : thumosPath+'node_modules/crc-32/crc32',
			jquery : components+'jQuery/dist/jquery.min',
			async : components+'async/lib/async',
			underscore : components+'underscore/underscore'
		}
		/* init config.sets properly so that it goes through the `set!` plugin */
		config.sets = config.sets?config.sets.map(function(setname){
			return 'set!'+setname;
		}):[];
		/* overload all paths with user set config paths */
		var serverPaths = {};
		for(var key in config.paths) paths[key] = config.paths[key];
		for(var name in config.types) paths[name] = config.types[name].path||config.types[name];
		for(var key in paths) serverPaths[key] = paths[key];
		/* config requirejs (only in node does not apply to ) */
		requirejs.config({
			waitSeconds : 0, //no timeout
			paths : serverPaths,
			nodeRequire: require			
		});
		/* setup a separate context from the build, as that will fuck everything */
		var nodeRJSConfig = {
			waitSeconds : 0, 
			nodeRequire: require,
        	context:'requirejsModuleLoading',
			paths : serverPaths,
		    nodeRequire: require,
		};
		
		/* hmm */
		nodeRJSConfig.paths.jquery = thumosPath+'lib/null';
		nodeRJSConfig.paths['plugins/cookie'] = thumosPath+'lib/null';
		
		api.require = requirejs.config(nodeRJSConfig);
		var _ = requirejs('underscore');
		/* build client side for each  */
		var buildText = "";
		logger.log('building pages:');
		async.eachSeries(config.pages, function(page, cb){
			logger.log(' - ', page.url, '('+page.title+')');
			var out = config.buildpath+page.url+'index.js';
			async.series([
				function(c){ //make the directory for the page
					fs.emptyDir(config.buildpath+page.url, c);
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
						//console.log('odb');\
						require.config(JSON.parse('"+JSON.stringify({})+"'));\
					</script>");
					fs.writeFile(config.buildpath+page.url+'index.html', $.html(), c);
				},
				function(c){
					//logger.disable();
					paths.init = page.view;
					requirejs.optimize({
						basePath : './',
						wrapShim : true,
						paths : paths,
						shim : config.shim||{},
						preserveLicenseComments: !config.uglify,
						optimize : config.uglify?'uglify':'none',
						stubModules : ['text', 'style', 'less', 'css-builder', 'css', 'normalize', 'less-builder'],
						name : clientInit,
						out : out,
						include : config.sets, //include the definitions for each set name
						insertRequire : [clientInit].concat(config.sets), //require the above definitions (once) so they get picked up by the plugin and put into the global object
						allowSourceOverwrites: true
					}, function(buildResponse){
						buildText += buildResponse; //append build output
						logger.enable();
						/* parse build output for required views */
						var views = _.uniq(buildText.split('\n').filter(function(line){
							return line.match(/^view!/);
						}));
						nodeRJSConfig.paths.init = page.view; //add in the init viewpath					
						if(page.nocopy) c(); //page.nocopy can disable this
						else async.eachSeries(views, function(view, viewDone){
							var viewDir = lookup(nodeRJSConfig, view, './'); //get real path of view directory
							var configPath = path.join(viewDir, 'config.json');
							/* check for a view conf file */
							if(fs.existsSync(configPath)) fs.readFile(configPath, function(e, configJSON){
								if(e) viewDone(e);
								else{
									var viewConfig = JSON.parse(configJSON);
									/* copy specified paths into the build directory */
									if(viewConfig.include) async.eachSeries(viewConfig.include, function(file, copyDone){
										logger.log('     - ', file);
										var dest = path.join(path.dirname(out), file);
										if(fs.existsSync(dest)) copyDone(file+' already exists'); //make sure there is no overlap
										else fs.copy(path.join(viewDir, file), dest, copyDone); //copy over
									}, viewDone); 
									else viewDone();
								}
							});
							else viewDone();
						}, c)						
					}, function(buildErr){
						logger.enable();
						callback(buildErr);
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
					typeapis : {},
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
				/* get the container set */
				api.require(['container'], function(container){
					container.nodeRequire = prequire;
					container.thumos = api; //so setrequire knows what the fuck is up
					
					logger.log('setup types:');
					/* find all the types with server side initialization */
					config.activeTypes = {};
					for(var type in config.types){
						if(config.types[type].server) config.activeTypes[type] = prequire(config.types[type].server)(config.types[type].config);
					}
					/* call init on these types */
					async.each(_.keys(config.activeTypes), function(type, typeComplete){
						logger.log(' - ', type);
						config.activeTypes[type].init(config, typeComplete);
					}, routes);
				});
			}
		}
		function routes(){
			/* get the setrequirererr */
			api.require(['setRequire', 'container'].concat(config.sets), function(setRequire, container){ //add config.sets				
				logger.log('setup authentication:');
				/* initialize authentication */
				config.auth.init(setRequire, config, function(e, router){
					if(e) callback(e);
					else{
						config.app.use(router);
						/* ROUTING SETS */
						logger.log('routing sets:');
						async.eachSeries(_.keys(container.sets), function(setName, cb){
							var set = setRequire(setName); //get the set
							
							logger.log(' - ', setName);
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
							router.route('/i/:ids')
								.get(function(req, res){ //get models by id
									set.get(req.params.ids.split(','), handle(res));
								})
								.delete(function(req, res){ //delete models by id
									set.del(req.params.ids.split(','), handle(res));
								});
							router.route('/q/:queryname').post(json, function(req, res){
								set.query(req.params.queryname, req.body, handle(res));
							});
							/* find and search simply passit to their server side counterparts */
							router.route('/find').post(json, function(req, res){
								set.find(req.body, handle(res));
							});
							router.route('/search').post(json, function(req, res){
								set.search(req.body, handle(res));
							});
							setup.express.router.use(set.config.path||'/'+set.config.name, router);
							cb();
						}, callback);
						
					}
				});
			});
		}
	},
	config : {}, //set to init config
	auth : require('./lib/auth')
}
module.exports = api;