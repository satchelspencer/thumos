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
			find : function(props, callback){
			
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
		function find(query, callback){
			api.collection.find(query, callback);
		}
		var api = {
			get : function(ids, callback){
				
			},
			del : function(ids, callback){
			
			},
			add : function(models, callback){
			
			},
			find : function(props, callback){
				
			},
			query : function(a, b, c){
				if(c) find(config.queries[a](b), c);
				else if(b) find(config.queries[a](), b);
				else find(config.init||{}, a);
			},
			fn : {},
			config : config
		}
		return api;
	}
})