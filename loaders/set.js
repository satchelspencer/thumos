/* builds a set */
define(['compat!node_modules/thumos/lib/set'], function(setBuilder){
	return {
		load : function(name, req, onload, config, isBuild){
			req([name], function(mod){ //require the set definition
				onload(!mod?null:setBuilder(mod)); //if we're in a build don't call the definition since mod will be undefined
			})
		}
	}
});