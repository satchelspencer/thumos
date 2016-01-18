var async = require('async');
var bilt = require('bilt')(); //make a new instance
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
			'file' : local('load/file.js'),
			'ajax' : local('lib/ajax.js'),
			'auth' : local('lib/auth.js'),
			'validator' : local('lib/validator.js'),
			'config' : local('lib/config.js'),
			'jquery' : {
				source : local('bower_components/jQuery/dist/jquery.min.js'),
				export : '$',
				minify : true
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
				deps : ['view!'+pageConfig.view, 'jquery', 'jqext'],
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
				var toRequire = ['config', config.auth];
				bilt.require({
					paths : paths,
					deps : toRequire
				}, function(e, loaded){
					/* AUTHENTICATION, bruv, should be in its own module... */
					var crypto = require('crypto');
					var bcrypt = require('bcrypt');
					var bodyParser = require('body-parser');
					var Memcached = require('memcached');
					var memcached = new Memcached('localhost:11211');
					var hmackey = crypto.randomBytes(64).toString('hex');
					var sessionTime = 3600*24; //24h
					var auth = _.values(loaded)[1];
					/* authentication middleware */
					config.router.use(function(req, res, next){
						if(req.signedCookies.auth){
							var data = JSON.parse(req.signedCookies.auth);
							if(data.exptime < (new Date).getTime()) next(); //browser sent expired cookie
							var hashstr = data.uid+data.exptime+req.headers['x-session-id'];
							/* rehash and compare */
							var key = crypto.createHmac('sha256', hmackey).update(hashstr).digest('hex');
							var hmac = crypto.createHmac('sha256', key).update(hashstr).digest('hex');
							if(data.hmac == hmac){
								/* valid cookie, check memcached */
								memcached.get(data.uid, function(e, d){
									if(d) req.id = data.uid; //we got one!!!
									next(); 
								});
								
							}else next(); //forged cookie, tls reset???
						}else next();
					});
					/* authentication routes */
					config.router.route('/auth')
						.post(json, function(req, res){
							if(req.id) res.json({error : 'already logged in'});
							else auth(req.body, function(e, uid){
								if(e) setTimeout(function(){
									res.json({error : 'authentication failed'});
								}, Math.floor(Math.random()*2000)); //timing attack
								else{
									/* success, setup the cookie */	
									var exptime = new Date(Date.now()+(sessionTime*1000)); //1hr from now
									var hashstr = uid+exptime.getTime()+req.headers['x-session-id'];
									/* gen session specific key for hmac */
									var key = crypto.createHmac('sha256', hmackey).update(hashstr).digest('hex');
									var hmac = crypto.createHmac('sha256', key).update(hashstr).digest('hex');
									/* add session to memcached */
									memcached.set(uid, 'true', sessionTime, function(memseterr){
										if(memseterr) res.json({'error' : memseterr});
										/* format cookie */
										var cstring = JSON.stringify({
											'uid' : uid,
											'exptime' : exptime.getTime(),
											'hmac' : hmac
										});
										res.cookie('auth', cstring, {expires : exptime, httpOnly: true, signed : true, secure : true});
										res.cookie('loggedin', true, {expires : exptime});
										res.json({message : 'success', uid : uid});
									});
								}
							})
						})
						.delete(json, function(req, res){
							if(req.signedCookies.auth){
								/* we have a session cookie: clear from cache, remove cookie */
								var data = JSON.parse(req.signedCookies.auth);
								memcached.set(data.uid, "false", 0, function(memseterr){
									if(memseterr) err.server(req, res, memseterr);
									else{
										res.clearCookie('auth');
										res.clearCookie('loggedin');
									 	res.json({message : 'logged out'})
									}
								});
							}else res.json({error : 'already logged out'});
						});
					/* get required sets for routing */
					_.extend(_.values(loaded)[0], config); //add
					bilt.require({
						paths : paths,
						deps : _.map(plugins[local('load/set.js')], function(path){
							var split = path.split('!');
							return _.map(split, function(part){
								if(part == local('load/set.js')) part = 'set';
								return part;
							}).join('!');
						}),
						verbose : true
					}, function(e, loaded){
						if(e) callback(e);
						else async.eachSeries(_.values(loaded), function(set, setReady){
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
								router.route(route).get(middleware);
							});

							/* add to main thumos router */
							config.router.use(set.config.path||'/'+set.config.name, router);
							setReady();
						}, callback);					
					});
				})
			}
		});
	}
}

module.exports = api;