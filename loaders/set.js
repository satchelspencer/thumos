define(function(){
	/* builder function that creates a client side model interface */
	function set(config){
		return {
			get : function(){
			
			},
			sel : function(){
			
			},
			on : function(){
			
			},
			off : function(){
			
			},
			config : config
		}
	}
	return {
		load : function(name, req, onload, config, isBuild){
			req([name], function(mod){ //require the set definition
				onload(isBuild?null:set(mod)); //if we're in a build don't call the definition since mod will be undefined
			})
		}
	}
});