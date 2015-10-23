var async = require('async');
var bilt = require('bilt');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var cheerio = require('cheerio');
var express = require('express');
var fs = require('fs-extra');
var mongo = require('./lib/db');
var path = require('path');
var _ = require('underscore');
var d = require('datauri');

function local(fpath){
	return path.join(__dirname, fpath);
}

var api = {
	init : function(config, callback){
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
			'include' : local('load/include.js'),
			'ajax' : local('lib/ajax.js'),
			'validator' : local('lib/validator.js'),
			'jquery' : {
				source : 'https://code.jquery.com/jquery-1.11.3.min.js',
				export : '$'
			},
			'jqext' : {
                source : local('lib/jqext.js'),
                export : '$.fn.view',
                deps : ['jquery']
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
				source : 'crc-32',
				export : 'CRC32',
				minify : true
			}
		};
		paths = _.extend(paths, config.paths||{});
		bilt = bilt({
			paths : paths,
			noMinify : config.noMinify
		});
		async.reduce(config.pages, [], function(allLoaded, pageConfig, pageComplete){
			var buildPath = path.join(config.path, pageConfig.url);
			bilt.build(['view!'+pageConfig.view, 'jquery', 'jqext'], function(view, $){
				$('body').append(view().render());
				$('body').on('dragenter dragover', function(event) {
                    event.stopPropagation();
                    event.preventDefault();
                    return false;
                }).on('drop', function(event){
                    require('/thumos/lib/ajax.js')().file('/bin', event.originalEvent.dataTransfer.files[0], false, function(){console.log(arguments)})
                    event.stopPropagation();
                    event.preventDefault();
                    return false;
                });
			},function(e, js, loaded, configs){
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
						var assets = _.map(_.filter(loaded, function(load){
							return ~load.indexOf(local('load/include.js')+'!');
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
								
				/* global setup */
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
								
				bilt.require(plugins[local('load/set.js')], function(){
					async.eachSeries(arguments, function(createSet, setReady){
				        /* get api of set */
				        createSet(config, function(e, set){
				            var router = express.Router();
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
							config.router.use(set.config.path||'/'+set.config.name, router);
				            setReady();
				        });
					}, callback);					
				});
			}
		});
	}
}

module.exports = api;