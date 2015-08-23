var crypto = require('crypto');
var bcrypt = require('bcrypt');
var bodyParser = require('body-parser');
var express = require('express');
var memcached = require('memcached');

/* default authentication mechanism for thumos */
module.exports = function(options){
	//var hmackey = crypto.randomBytes(64).toString('hex'); //gen server key on startup
	var hmackey = "lol"; //temporary
	var sessionTime = options.sessionLength||3600; //1hr expire time
	var cache = new memcached(options.memcached||'localhost:11211'); //default memcache on localhost
	
	var api = {
		init : function(setRequire, gconfig, callback){
			userset = setRequire(options.set);
			var router = express.Router();
			router.use(bodyParser.json(), function(e,r,re,n){
				if(e) re.json({error:'json'}); //catch some bullshit json
				else n();
			});
			router.route('/auth')
				.post(function(req, res, next){ //request authentication
					var query = {};
					query[options.id] = req.body[options.id];
					userset.findOne(query, function(e, model){
						if(!model) res.json({error : 'fail'});
						else{
							bcrypt.compare(req.body.pass, model.pass, function(err, valid){
								if(!valid) res.json({error : 'fail'});
								else{
									var uid = model._id;
									var exptime = new Date(Date.now()+(sessionTime*1000)); //1hr from now
									var hashstr = uid+exptime.getTime()+req.headers['x-session-id'];
									/* gen session specific key for hmac */
									var key = crypto.createHmac('sha256', hmackey).update(hashstr).digest('hex');
									var hmac = crypto.createHmac('sha256', key).update(hashstr).digest('hex');
									/* add session to memcached */
									cache.set(uid, JSON.stringify(model), sessionTime, function(memseterr){
										if(memseterr) res.json({error : 'memcached'});
										/* format cookie */
										var cstring = JSON.stringify({
											'uid' : uid,
											'exptime' : exptime.getTime(),
											'hmac' : hmac
										});
										res.cookie('auth', cstring, {expires : exptime, httpOnly: true, signed : true, secure : true});
										res.cookie('loggedin', true, {expires : exptime});
										res.json({message : 'success'});
									});
								}
							});
						}
					});
				})
				.delete(api.revoke);
			callback(null, router);
		},
		verify : function(req, res, next){
			function check(r, callback){
				if(r.signedCookies.auth === undefined) callback('no cookie');
				else{
					var data = JSON.parse(r.signedCookies.auth);
					if(data.exptime < (new Date).getTime()) callback('expired'); //browser sent expired cookie
					var hashstr = data.uid+data.exptime+r.headers['x-session-id'];
					/* rehash and compare */
					var key = crypto.createHmac('sha256', hmackey).update(hashstr).digest('hex');
					var hmac = crypto.createHmac('sha256', key).update(hashstr).digest('hex');
					if(data.hmac == hmac){
						/* valid cookie, check memcached */
						cache.get(data.uid, function(memerr, model){
							if(memerr) callback(memerr);
							else if(model) callback(null, JSON.parse(model));
							else callback('expired/not in memcached');
						});
						
					}else callback('hmac invalid'); //forged/invalid cookie
				}
			}
			check(req, function(e, uid){
				if(uid) req.user = uid;
				next();
			});
		},
		revoke : function(req, res){
			if(req.signedCookies.auth){
				/* we have a session cookie: clear from cache, remove cookie */
				var data = JSON.parse(req.signedCookies.auth);
				cache.set(data.uid, "false", 0, function(memseterr){
					if(memseterr) res.json({error : 'memcached'});
					else{
						res.clearCookie('auth');
						res.clearCookie('loggedin');
					 	res.json({message : 'logged out'});
					}
				});
			}else res.json({error : 'fail'});
		}
	}
	return api;
}
