define({factory : true}, function(){
	var ajax = require('./ajax.js');
	
	var callbacks = $.Callbacks('memory');
	var api = {
		get : function(cred, callback){
			ajax.req('post', '/auth', cred, function(e, res){
				if(!e) callbacks.fire(res.uid);
				if(callback) callback(e, res&&res.uid);
			});
		},	
		revoke : function(callback){
			ajax.req('delete', '/auth', function(e){
				callbacks.fire(null);
				if(callback) callback(e);
			});
		},
		bind : function(callback){
			if(callback) callbacks.add(callback);
			var m = document.cookie.match('uid=j%3A%22([a-f0-9]{24})');
			var uid = m&&m[1]||null;
			if(!callback) callbacks.fire(uid);
			return uid;
		},
		unbind : function(callback){
			callbacks.remove(callback);
		}

	};
	return api;
})