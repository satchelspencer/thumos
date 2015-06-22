/* set api builder from config for server and client */
define({
	client : function(config){
		return {
			get : function(id, callback){
			
			},
			del : function(id, callback){
			
			},
			add : function(id, callback){
			
			},
			query : function(id, callback){
			
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
	},
	server : function(config){
		return {
			get : function(id, callback){
			
			},
			del : function(id, callback){
			
			},
			add : function(id, callback){
			
			},
			query : function(id, callback){
			
			},
			fn : {},
			config : config
		}
	}
})