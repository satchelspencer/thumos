define(function(){
	return {
		load : function(name, req, onload, config, isBuild){
			req([name], function(mod){
				var prop = typeof window != 'undefined'?'client':'server';
				onload(mod?mod[prop]:null);
			})
		}
	}
});