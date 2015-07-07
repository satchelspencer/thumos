/* set api builder from config for server and client */
define(['./validator', './result', 'async'], function(validator, result, async){
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
				valid : validator(config), //setup the validator given our config
				get : function(ids, callback){
					/* get all ids */
					api.db.collection.find({_id : {
						$in : ids.map(api.db.id)
					}}, function(e, raw){
						callback(result(api, raw));
					});
				},
				update : function(data, callback){
					api.valid(data, function(e, models){
						if(e) callback(e);
						else async.mapSeries(models, function(model, cb){
							var index = models.indexOf(model);
							if(!model._id) cb({index : index, missing : '_id'}); //gotta have an id to update
							else{
								model._id = api.db.id(model._id);
								api.db.collection.update({_id : model._id}, {$set : model}, function(e, result){
									if(!result.n) cb({noexist : model._id});
									else cb(null, model);
								});
							}
						}, callback);
					});
				},
				del : function(ids, callback){
					api.db.collection.remove({_id : {
						$in : ids.map(api.db.id)
					}}, callback);
				},
				add : function(models, callback){
					api.valid(models, function(e, toInsert){
						if(e) callback(e);
						else api.db.collection.insert(toInsert, callback);
					});
				},
				find : function(props, callback){
					var query = {};
					/* make sure the only thing we gettin is props */
					for(var prop in props) query[prop] = {$eq : props[prop]};
					api.db.collection.find(query, function(e, raw){
						callback(e, result(api, raw));
					});
				},
				findOne : function(props, callback){
					console.log(props);
					api.find(props, function(e, models){
						callback(e, models[0]);
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