define(function(){
	/* builder function that creates a client side model interface */
	function model(config){
		return {
			hey : 'yall',
			def : config
		}
	}
	return {
		load : function(name, req, onload, config, isBuild){
			req([name], function(mod){ //require the model definition
				onload(isBuild?null:model(mod)); //if we're in a build don't call the definition since mod will be undefined
			})
		}
	}
});