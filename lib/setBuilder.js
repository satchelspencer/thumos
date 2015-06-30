/* set api builder from config for server and client */
define(['./result', 'async'], function(result, async){
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
					/* get all ids */
					api.db.collection.find({_id : {
						$in : ids.map(api.db.id);
					}}, function(e, raw){
						callback(result(api, raw));
					});
				},
				update : function(data, callback){
					async.each(Object.keys(models), function(id, cb){
						api.db.collection.update({_id : api.db.id(id)}, {$set : models[id]}, cb);
					}, cb);
				},
				del : function(ids, callback){
					api.db.collection.remove({_id : {
						$in : ids.map(api.db.id);
					}, callback);
				},
				add : function(models, callback){
					api.db.collection.insert(models, callback);
				},
				find : function(props, callback){
					var query = {};
					/* make sure the only thing we gettin is props */
					for(var prop in props) query[prop] = {$eq : props[prop]};
					api.db.collection.find(query, {_id : 1}, function(e, raw){
						callback(e, result(api, raw));
					});
				},
				query : function(query, params, callback){
					api.db.collection.find(config.queries[query](params), function(e, raw){
						callback(e, result(api, raw));
					});
				},
				fn : {},
				config : config
			}
			return api;
		}
	}
})