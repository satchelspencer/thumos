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

function local(fpath){
	return path.join(__dirname, fpath);
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
		'ajax' : local('lib/ajax.js'),
		'auth' : local('lib/auth.js'),
		'middleware' : local('lib/middleware.js'),
		'props' : local('lib/props.js'),
		'config' : local('lib/config.js'),
		'jquery' : {
			source : local('bower_components/jQuery/dist/jquery.min.js'),
			export : '$',
			minify : true
		}, 
		'underscore' : {
			source : local('bower_components/underscore/underscore-min.js'),
			export : '_',
			minify : true
		},
		'async' : {
			source : local('bower_components/async/dist/async.min.js'),
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

	async.reduce(config.pages, [], function(allLoaded, pageConfig, pageComplete){
		var buildPath = path.join(config.path, pageConfig.url);
		bilt.build({
			paths : paths,
			deps : ['view!'+pageConfig.view, 'jquery'],
			verbose : true,
			cache : path.join(__dirname, '/tmp/cache.json')
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
			var handle = function(res){
				return function(e, response){
					if(e) res.json({error : e});
					else res.json(response);
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
				bilt.require({
					paths : paths,
					deps : [config.auth].concat(_.map(plugins[local('load/set.js')], function(path){
						var split = path.split('!');
						return _.map(split, function(part){
							if(part == local('load/set.js')) part = 'set';
							return part;
						}).join('!');
					})),
					verbose : true
				}, function(e, loaded){
					if(e) callback(e);
					else{
						/* initialize authentication */
						authInit(config, _.values(loaded)[0], json);
						/* setp routes for each set! loaded */
						async.eachSeries(_.rest(_.values(loaded)), function(set, setReady){
							var router = express.Router();
							router.route('/')
								.get(function(req, res){ //list according to default query
									set.find({}, handle(res), req.id||0);
								})
								.post(json, function(req, res){
									//add new model(s) to set, return models
									set.add(req.body, handle(res), req.id||0);
								})
								.put(json, function(req, res){
									//update existing models, return models
									set.update(req.body, handle(res), req.id||0);
								});
							router.route('/i/:ids')
								.get(function(req, res){ //get models by id
									set.get(req.params.ids.split(','), handle(res), req.id||0);
								})
								.delete(function(req, res){ //delete models by id
									set.del(req.params.ids.split(','), handle(res), req.id||0);
								});
							router.route('/q/:queryname').post(json, function(req, res){
								set.query(req.params.queryname, req.body, handle(res), req.id||0);
							});
							/* find and search simply passit to their server side counterparts */
							router.route('/find').post(json, function(req, res){
								set.find(req.body, handle(res), req.id||0);
							});
							router.route('/search').post(json, function(req, res){
								set.search(req.body, handle(res), req.id||0);
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