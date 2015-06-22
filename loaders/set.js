/* builds a set */
define(['node_modules/thumos/lib/setBuilder'], function(setBuilder){
	/* we can't use the compat plugin because it doesnt actually fire during build process, and this is needed then. since its a plugin */
	var prop = typeof window != 'undefined'?'client':'server'; 
	setBuilder = setBuilder[prop];
	return {
		load : function(name, req, onload, config, isBuild){
			req([name], function(mod){ //require the set definition
				onload(isBuild?null:setBuilder(mod)); //if we're in a build don't call the definition since mod will be undefined
			})
		}
	}
});