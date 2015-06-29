/* set api builder from config for server and client */
define(['./result'], function(result){
	return {
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
			var api = {
				get : function(ids, callback){
					
				},
				del : function(ids, callback){
				
				},
				add : function(models, callback){
				
				},
				find : function(props, callback){
					var query = {};
					/* make sure the only thing we gettin is props */
					for(var prop in props) query[prop] = {$eq : props[prop]};
					api.db.collection.find(query, {_id : 1}, function(e, raw){
						callback(e, result(api, raw));
					});
				},
				query : function(a, b, c){
					
				},
				fn : {},
				as : function(ids){
					ids = ids.length?ids:[ids]; //force to array
					var query = {_id : {$in : ids.map(api.db.id)}};
					return {
						get : function(props, callback){
							/* expects space delimited list of props */
							var p = {};
							props.split(' ').forEach(function(prop){
								p[prop] = 1;
							});
							console.log(query, p);
							api.db.collection.find(query, p, function(e, raw));
						},
						set : function(props, callback){
							api.db.collection.update(query, {$set : props}, callback);
						},
						del : function(callback){
							api.db.collection.remove(query, callback);
						}
					}
				},
				config : config
			}
			return api;
		}
	}
})