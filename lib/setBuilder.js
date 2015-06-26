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
		var api = {
			get : function(ids, callback){
				
			},
			del : function(ids, callback){
			
			},
			add : function(models, callback){
			
			},
			find : function(props, callback){
				console.log(api.db);
				var query = {};
				/* make sure the only thing we gettin is props */
				for(var prop in props) query[prop] = {$eq : props[prop]};
				api.db.collection.find(query, callback);
			},
			query : function(a, b, c){
				
			},
			fn : {},
			as : function(id){
				var query = {_id : api.db.id(id)};
				return {
					get : function(props, callback){
						api.db.collection.findOne(query, callback);
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
})