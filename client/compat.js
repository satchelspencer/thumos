define(function(){
	return function(mod){
		return typeof window != 'undefined'?mod.client:mod.server;
	}
});