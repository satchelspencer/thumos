/* build only takes in a compat format file */
define(function(){
	return {
		load : function(name, req, onload, config, isBuild){
			var suffix = typeof window != 'undefined'||config.isBuild?'Client':'';
			req([name+suffix], onload);
		}
	}
});