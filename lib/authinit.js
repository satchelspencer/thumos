/* authentication routes setup */
module.exports = function(config, auth, json){
	var crypto = require('crypto');
	var bcrypt = require('bcrypt');
	var bodyParser = require('body-parser');
	var Memcached = require('memcached');
	var memcached = new Memcached('localhost:11211');
	var hmackey = 'lol';//crypto.randomBytes(64).toString('hex');
	var sessionTime = 3600*24; //24h
	var _ = require('underscore');
	
	/* authentication middleware, use errywhere */
	config.router.use(function(req, res, next){
		if(req.signedCookies.auth){
			var data = JSON.parse(req.signedCookies.auth);
			if(data.exptime < (new Date).getTime()) next(); //browser sent expired cookie
			var hashstr = data.uid+data.exptime;//+req.headers['x-session-id'];
			/* rehash and compare */
			var key = crypto.createHmac('sha256', hmackey).update(hashstr).digest('hex');
			var hmac = crypto.createHmac('sha256', key).update(hashstr).digest('hex');
			if(data.hmac == hmac){
				/* valid cookie, check memcached */
				memcached.get(data.uid, function(e, d){
					if(d) req.context = _.extend({id : data.uid}, JSON.parse(d));
					next(); 
				});
				
			}else next(); //forged cookie, tls reset???
		}else next();
	}, function(req, res, next){
		req.context = req.context||{id:0};
		req.context.data = req.context.data||{};
		req.context.legder = {}; //empty to start
		next();
	});
	/* authentication routes */
	config.router.route('/auth')
		.post(json, function(req, res){
			if(req.id) res.json({error : 'already logged in'});
			else auth(req.body, function(e, uid, userData){
				userData = userData||{};
				if(e) setTimeout(function(){
					res.json({error : 'authentication failed'});
				}, Math.floor(Math.random()*2000)); //timing attack
				else{
					/* success, setup the cookie */	
					var exptime = new Date(Date.now()+(sessionTime*1000)); //1hr from now
					var hashstr = uid+exptime.getTime();//+req.headers['x-session-id'];
					/* gen session specific key for hmac */
					var key = crypto.createHmac('sha256', hmackey).update(hashstr).digest('hex');
					var hmac = crypto.createHmac('sha256', key).update(hashstr).digest('hex');
					/* add session to memcached */
					memcached.set(uid, JSON.stringify(userData), sessionTime, function(memseterr){
						if(memseterr) res.json({'error' : memseterr});
						/* format cookie */
						var cstring = JSON.stringify({
							'uid' : uid,
							'exptime' : exptime.getTime(),
							'hmac' : hmac
						});
						res.cookie('auth', cstring, {expires : exptime, httpOnly: true, signed : true});
						res.cookie('uid', uid, {expires : exptime});
						res.json({message : 'success', uid : uid});
					});
				}
			})
		})
		.delete(json, function(req, res){
			res.clearCookie('auth');
			res.clearCookie('uid');
			if(req.signedCookies.auth){
				/* we have a session cookie: clear from cache, remove cookie */
				var data = JSON.parse(req.signedCookies.auth);
				memcached.set(data.uid, "false", 0, function(memseterr){
					if(memseterr) err.server(req, res, memseterr);
					else{
					 	res.json({message : 'logged out'})
					}
				});
			}else res.json({error : 'already logged out'});
		});
	/* whoami route */
	config.router.get("/whoami", function(req, res){
		res.json(req.context)
	})
}
