/* builds a set */
define(['compat!node_modules/thumos/lib/set', 'container'], function(setBuilder, container){
	return {
		load : function(name, req, onload, config, isBuild){
			req([name], function(mod){ //require the set definition
				if(mod && !container.sets[mod.name]) container.sets[mod.name] = setBuilder(mod);
				onload(!mod?null:container.sets[mod.name]); //if we're in a build don't call the definition since mod will be undefined
			})
		}
	}
});