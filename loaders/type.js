/* empty plugin */
define(function(){
	return {
		load : function(name, req, onload){
			req(['node_modules/'+name+'/index'], function(mod){
				if(mod) mod.path = name;
				onload(mod); 
			})
		}
	}
});