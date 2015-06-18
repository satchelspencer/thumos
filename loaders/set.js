/* CLIENT SIDE fn */
define(function(){
	function set(config){
		return {
			get : function(id, callback){
			
			},
			del : function(id, callback){
			
			},
			on : function(event, callback){
			
			},
			off : function(event){
			
			},
			trigger : function(event){
			
			},
			fn : {},
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