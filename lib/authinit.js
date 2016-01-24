/* authentication routes setup */
module.exports = function(config, auth, json){
	var crypto = require('crypto');
	var bcrypt = require('bcrypt');
	var bodyParser = require('body-parser');
	var Memcached = require('memcached');
	var memcached = new Memcached('localhost:11211');
	var hmackey = 'lol';//crypto.randomBytes(64).toString('hex');
	var sessionTime = 3600*24; //24h
	
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
}