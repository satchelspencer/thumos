var crypto = require('crypto');
var bcrypt = require('bcrypt');
var bodyParser = require('body-parser');
var memcached = require('memcached');

/* default authentication mechanism for thumos */
module.exports = function(options){
	//var hmackey = crypto.randomBytes(64).toString('hex'); //gen server key on startup
	var hmackey = "lol"; //temporary
	var sessionTime = options.sessionLength||3600; //1hr expire time
	var cache = new memcached(options.memcached||'localhost:11211'); //default memcache on localhost
	
	var api = {
		init : function(set, router, callback){
			set([options.set], function(userset){ //require userset
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
										var exptime = new Date(Date.now()+(sessionTime*1000)); //1hr from now
										var hashstr = uid+exptime.getTime()+req.headers['x-session-id'];
										/* gen session specific key for hmac */
										var key = crypto.createHmac('sha256', hmackey).update(hashstr).digest('hex');
										var hmac = crypto.createHmac('sha256', key).update(hashstr).digest('hex');
										var uid = model._id;
										/* add session to memcached */
										cache.set(uid, 'true', sessionTime, function(memseterr){
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
				callback();
			});
		},
		verify : function(req, res, next){
			function check(r, callback){
				if(r.signedCookies.auth === undefined) callback(null, false);
				else{
					var data = JSON.parse(r.signedCookies.auth);
					if(data.exptime < (new Date).getTime()) callback(null, false); //browser sent expired cookie
					var hashstr = data.uid+data.exptime+r.headers['x-session-id'];
					/* rehash and compare */
					var key = crypto.createHmac('sha256', hmackey).update(hashstr).digest('hex');
					var hmac = crypto.createHmac('sha256', key).update(hashstr).digest('hex');
					if(data.hmac == hmac){
						/* valid cookie, check memcached */
						memcached.get(data.uid, function(memerr, d){
							if(memerr) callback(memcached);
							else if(d) callback(null, data.uid);
							else callback(null, false);
						});
						
					}else callback(null, false); //forged/invalid cookie
				}
			}
			check(req, function(e, uid){
				if(uid){ //valid cookie
					req.user = uid;
					next();
				}else api.revoke(req, res);
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
