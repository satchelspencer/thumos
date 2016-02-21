var async = require('async');
var bilt = require('bilt')(); //make a new instance
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var cheerio = require('cheerio');
var express = require('express');
var fs = require('fs-extra');
var mongo = require('./lib/db');
var authInit = require('./lib/authinit');
var path = require('path');
var _ = require('underscore');
var d = require('datauri');
var getPath = require('get-installed-path');

function local(fpath){
	return path.join(__dirname, fpath);
}

function modulePath(p){
	return require.resolve(p);
}

module.exports = function(config, callback){
	var paths = {
		'datauri' : local('load/datauri.js'),
		'css' : local('load/css.js'),
		'text' : local('load/text.js'),
		'render' : local('lib/render.js'),
		'html' : local('load/html.js'),
		'view' : local('load/view.js'),
		'set' : {
			source : local('load/set.js'),
			nodePath : local('load/setNode.js')
		},
		'file' : local('load/file.js'),
		'browserify' : local('load/browserify.js'),
		'amd' : local('load/amd.js'),
		'ajax' : local('lib/ajax.js'),
		'auth' : local('lib/auth.js'),
		'middleware' : local('lib/middleware.js'),
		'props' : local('lib/props.js'),
		'sets' : local('lib/sets.js'),
		'config' : local('lib/config.js'),
		'jquery' : {
			source : modulePath('jquery'),
			export : '$',
			minify : true
		}, 
		'underscore' : {
			source : modulePath('underscore'),
			export : '_',
			minify : true
		},
		'async' : {
			source : modulePath('async'),
			export : 'async',
			minify : true
		},
		'crc32' : {
			source : 'crc-32', //node path
			export : 'CRC32',
			minify : true
		}
	};
	paths = _.extend(paths, config.paths||{});

	config.tempdir = config.tempdir || path.join(__dirname, '/tmp');
	fs.ensureDirSync(config.tempdir);

	async.reduce(config.pages, [], function(allLoaded, pageConfig, pageComplete){
		var buildPath = path.join(config.path, pageConfig.url);
		bilt.build({
			paths : paths,
			deps : ['view!'+pageConfig.view, 'jquery'],
			verbose : true,
			cache : path.join(config.tempdir, 'cache.json')
		}, function(view, $){
			$(window).ready(function(){
				$('body').append(view());
			})
		},function(e, loaded, js){
			if(e) pageComplete('Build Failed:'+e);
			else async.series([
				function(cb){
					fs.mkdirs(buildPath, cb);
				},
				function(cb){
					fs.readdir(buildPath, function(e, files){
						files = _.map(files, function(file){
							return path.join(buildPath, file);
						});	
						async.filter(files, function(file, done){
							if(!fs.statSync(file).isDirectory()) done(true);
							else fs.stat(path.join(file, 'index.html'), done);
						}, function(todel){
							async.each(todel, fs.remove, cb);
						});
					});
				},
				function(cb){
					var $ = cheerio.load('<!doctype html><html><head><title></title></head><body></body></html>');
					$('title').text(pageConfig.title);
					$('head').append("<script type=\"text/javascript\">\n"+js+"\n</script>");
					fs.writeFile(path.join(buildPath, 'index.html'), $.html(), cb);
				},
				function(cb){
					/* pick up the assets plugin files */
					var assets = _.map(_.filter(loaded, function(load){
						return ~load.indexOf(local('load/file.js')+'!');
					}), function(assetPath){
						return _.last(assetPath.split('!'));
					});
					async.each(assets, function(assetPath, assetCopied){
						var dest = path.join(buildPath, path.basename(assetPath));
						fs.copy(assetPath, dest, assetCopied);
					}, cb);
				}
			], function(e){
				pageComplete(e, _.uniq(allLoaded.concat(loaded)));
			});	
		});
	}, function(e, loaded){
		if(e) callback(e);
		else{
			var plugins = _.reduce(loaded, function(pobj, lpath){
				var s = _.initial(lpath.split('!'));
				while(s.length > 0){
					var plugin = s.shift();
					pobj[plugin] = (pobj[plugin]||[]).concat(lpath);
				}
				return pobj;
			}, {});
							
			/* global mongo/express setup */
			config.db = mongo(config.mongo);
			config.router = express.Router();
			config.app.use(cookieParser("secret"));
			config.app.use(config.route||'/', config.router);
			
			var json = function(req, res, next){
				bodyParser.json()(req, res, function(e){
					if(e) res.json({error:'json'}); //catch some bullshit json
					else next();
				});
			}
			var handle = function(req, res, setname){
				return function(e, response){
					if(e) res.json({error : e, ledger : req.context.ledger});
					else{
						var rids = _.map(response, function(m){
							return m._id || m;
						})
						res.json({res : rids, ledger : req.context.ledger});
					}
				}
			}
			/* insert thumos config as a requireble module */
			var toRequire = ['config'];
			bilt.require({
				paths : paths,
				deps : toRequire
			}, function(e, loaded){
				/* get required sets for routing */
				_.extend(_.values(loaded)[0], config); //add
				var deps = _.map(plugins[local('load/set.js')], function(path){
					var split = path.split('!');
					return _.map(split, function(part){
						if(part == local('load/set.js')) part = 'set';
						return part;
					}).join('!');
				});
				if(config.auth) deps.unshift(config.auth);
				bilt.require({
					paths : paths,
					deps : deps,
					verbose : true
				}, function(e, loaded){
					if(e) callback(e);
					else{
						/* setp routes for each set! loaded */
						var sets = _.values(loaded);
						/* initialize authentication */
						if(config.auth){
							authInit(config, sets[0], json);
							sets = _.rest(sets);
						}
						async.eachSeries(sets, function(set, setReady){
							var router = express.Router();
							router.route('/')
								.get(function(req, res){ //list according to default query
									set.find({}, handle(req, res, set.config.name), req.context);
								})
								.post(json, function(req, res){
									//add new model(s) to set, return models
									set.insert(req.body, handle(req, res, set.config.name), req.context);
								})
								.put(json, function(req, res){
									//update existing models, return models
									set.update(req.body, handle(req, res, set.config.name), req.context);
								});
							router.route('/i/:ids')
								.get(function(req, res){ //get models by id
									set.get(req.params.ids.split(','), handle(req, res, set.config.name), req.context);
								})
								.delete(function(req, res){ //delete models by id
									set.remove(req.params.ids.split(','), handle(req, res, set.config.name), req.context);
								});
							/* find and search simply passit to their server side counterparts */
							router.route('/find').post(json, function(req, res){
								set.find(req.body, handle(req, res, set.config.name), req.context);
							});
							router.route('/search').post(json, function(req, res){
								set.search(req.body, handle(req, res, set.config.name), req.context);
							});

							/* custom routes setup */
							if(set.config.routes) _.each(set.config.routes, function(options, name){
								route = path.join('/', options.route||name);
								/* key defaults to just be middleware funtion with get method */
								var middleware = options.middleware||options;
								var method = options.method||'get';
								/* pass all middleware given to the appropriate route */
								router.route(route)[method](middleware);
							});

							/* add to main thumos router */
							config.router.use(set.config.path||'/'+set.config.name, router);
							setReady();
						}, callback);
					}
				});
			})
		}
	});
};