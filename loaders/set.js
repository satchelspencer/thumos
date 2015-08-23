/* builds a set */
define(['compat!node_modules/thumos/lib/set', 'allsets'], function(setBuilder, allsets){
	return {
		load : function(name, req, onload, config, isBuild){
			req([name], function(mod){ //require the set definition
				if(mod && !allsets[mod.name]) allsets[mod.name] = setBuilder(mod);
				onload(!mod?null:allsets[mod.name]); //if we're in a build don't call the definition since mod will be undefined
			})
		}
	}
});