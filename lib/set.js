define(['underscore', './validator', 'async'], function(_, validator, async){
	return function(config){
		return function(sconfig){
			/* typed as in has finalize/purge actions that must be taken by server */
			var types = sconfig.activeTypes;
			var typedProps = _.pick(config.model.properties, function(val, key){
				return val.type && types[val.type.name]; //has a type and its an active type
			});
			config.path = config.path||'/'+config.name;
			var api = {
				valid : validator(config, types), //setup the validator given our config
				get : function(ids, callback){
					/* get all ids */
					var invalid = _.reject(ids, api.db.id);
					var mds = _.uniq(ids);
					if(invalid.length) callback({invalid : invalid});
					else api.db.collection.find({_id : {
						$in : mds.map(api.db.id)
					}}, function(e, models){
						if(e) callback(e);
						else{
							/* check to see that we found all the models */
							var missing = _.difference(mds, _.pluck(models, '_id').map(api.db.str));
							if(missing.length) callback({noexist : missing});
							else callback(null, models);
						}
					});
				},
				getOne : function(id, callback){
					api.get([id], function(e, models){
						callback(e, models[0]);
					});
				},
				update : function(data, callback){
					api.valid(data, function(e, models){ //make sure its valid
						if(e) callback(e);
						else async.mapSeries(models, function(model, cb){ //for each model
							var index = models.indexOf(model);
							if(!model._id) cb({index : index, missing : '_id'}); //gotta have an id to update
							else{
								model._id = api.db.id(model._id); //mongoize it
								var toPurge = _.pick(model, typedProps);
								var selObj = _.mapObject(toPurge, function(val){
									return 1;
								});
								api.db.collection.findOne({_id : model._id}, selObj, function(e, oldModel){ //get its current value
									if(e) cb(e);
									else if(!oldModel) cb({noexist : model._id, index : index});
									else{
										/* purge any typed Properties */
										toPurge = _.pick(oldModel, _.keys(typedProps));
										async.each(_.keys(toPurge), function(prop, purged){
											var type = config.model.properties[prop].type.name;
											types[type].purge(toPurge[prop], purged); //kill it
										}, function(e){
											/* now update the model */
											if(e) cb(e);
											else api.db.collection.update({_id : model._id}, {$set : model}, function(e, result){
												/* check to see if document was succesfully inserted */
												if(!result.n) cb({noexist : model._id, index : index});
												else cb(null, _.extend(oldModel, model));
											});
										});
									}
								});
							}
						}, callback);
					}, true); //update
				},
				del : function(ids, callback){
					if(ids.constructor !== Array) ids = [ids]; //force to array
					async.reject(ids, function(id, cb){
						api.db.collection.findOne({_id : api.db.id(id)}, function(e, model){
							if(e) cb(e);
							else if(!model) cb('not found');
							else{
								var toPurge = _.pick(model, _.keys(typedProps));
								/* for every property in the model to die */
								async.each(_.keys(toPurge), function(prop, purged){
									var type = config.model.properties[prop].type.name;
									types[type].purge(toPurge[prop], purged); //kill it
								}, function(e){
									if(e) cb(e);
									else api.db.collection.remove({_id : api.db.id(id)}, function(e, res){
										cb(res.n); //add to the failed if res.n == 0 and was not removed
									});
								});
							}
						});
					}, function(failed){
						callback(
							failed.length?{failed : failed}:null, //error if failed to remove any
							_.difference(ids, failed) //call back with successfully removed ones
						); 
					});
				},
				add : function(models, callback){
					api.valid(models, function(e, toInsert){
						if(e) callback(e);
						else api.db.collection.insert(toInsert, callback);
					});
				},
				find : function(props, callback){
					var query = {};
					/* make sure the only thing we gettin is actual props */
					for(var prop in props) query[prop] = {$eq : props[prop]};
					api.db.collection.find(query, function(e, raw){
						callback(e, raw);
					});
				},
				findOne : function(props, callback){
					api.find(props, function(e, models){
						callback(e, models[0]);
					});
				},
				query : function(query, params, callback){
					if(!config.queries[query]) callback('query: '+query+' does not exist');
					else api.db.collection.find(config.queries[query](params), function(e, raw){
						callback(e, raw);
					});
				},
				fn : {},
				config : config
			}
			return api;
		}
	}
})