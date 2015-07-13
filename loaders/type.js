/* empty plugin */
define(function(){
	return {
		load : function(name, req, onload){
			req([name], function(mod){
				onload(mod); 
			})
		}
	}
});