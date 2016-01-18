define({factory : true}, function(){
	var ajax = require('./ajax.js');

	var api = {
		get : function(cred, callback){
			ajax.req('post', '/auth', cred, function(e, res){
				if(e) callback(e);
				else{
					api.uid = res.uid;
					callback(e, res.uid);
				} 
			});
		},	
		revoke : function(callback){
			ajax.req('delete', '/auth', function(e){
				if(!e) delete api.uid;
				callback(e);
			});
		}	
	};
	return api;
})