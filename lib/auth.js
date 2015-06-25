var crypto = require('crypto');
var bcrypt = require('bcrypt');
var bodyParser = require('body-parser');
var memcached = require('memcached');

/* default authentication mechanism for thumos */
module.exports = function(options){
	console.log('options', options);
	//var hmackey = crypto.randomBytes(64).toString('hex'); //gen server key on startup
	var hmackey = "lol"; //temporary
	var sessionTime = options.sessionLength||3600; //1hr expire time
	var cache = new memcached(options.memcached||'localhost:11211'); //default memcache on localhost
	return {
		init : function(set, router, callback){
			set([options.set], function(userset){ //require userset
				router.use(bodyParser.json(), function(e,r,re,n){
					if(e) re.json({error:'json'}); //catch some bullshit json
					else n();
				});
				router.route('/auth')
					.post(function(req, res, next){ //request authentication
						res.json(req.body);
					})
					.delete(function(req, res, next){ //revoke authentication
						
					});
				callback();
			});
		},
		verify : function(req, res, next){
		
		}
	}
}
