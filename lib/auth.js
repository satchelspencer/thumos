define({factory : true}, function(){
	var ajax = require('./ajax.js');
	
	var api = {
		get : function(cred, callback){
			ajax.req('post', '/auth', cred, function(e, res){
				callback(e, res.uid);
			});
		},	
		revoke : function(callback){
			ajax.req('delete', '/auth', callback);
		},
		uid : function(){
			var m = document.cookie.match('uid=j%3A%22([a-f0-9]{24})');
			return m&&m[1]||null;
		}
	};
	return api;
})