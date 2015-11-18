/*
needs:
 - set config
 - active server types
 - db:
	 - collection
	 - id
	 - str
 - validator
*/
define({
	init: function(config, callback) {
		var _ = require('underscore');
		var validator = require('validator');
		var async = require('async');
		var thumosConfig = require('config'); //get injected
		config.queries = config.queries || {};
		/* createset() */
		/* for all types that have uninitialized server handlers, doit */
		async.eachSeries(_.values(config.properties), function(prop, propDone) {
			if (prop.type && _.isFunction(prop.type.server)) prop.type.server(thumosConfig, function(e, propApi) {
				prop.type.server = propApi;
				propDone(e);
			});
			else propDone();
		}, function(e) {
			if (e) callback(e);
			else {
				var activeProps = _.pick(config.properties, function(prop) {
					return prop.type && prop.type.server;
				});
				var collection = thumosConfig.db.collection(config.collection || config.name);

				var api = {
					valid: validator(config), //setup the validator given our config
					get: function(ids, callback) {
						/* get all ids */
						var invalid = _.reject(ids, thumosConfig.db.id);
						var mds = _.uniq(ids); //mongoids
						if (invalid.length) callback({
							invalid: invalid
						});
						else collection.find({
							_id: {
								$in: mds.map(thumosConfig.db.id)
							}
						}, function(e, models) {
							if (e) callback(e);
							else {
								/* check to see that we found all the models */
								var missing = _.difference(mds, _.pluck(models, '_id').map(thumosConfig.db.str));
								if (missing.length) callback({
									noexist: missing
								});
								else callback(null, models);
							}
						});
					},
					getOne: function(id, callback) {
						api.get([id], function(e, models) {
							callback(e, models[0]);
						});
					},
					update: function(data, callback) {
						api.valid(data, function(e, models) { //make sure its valid
							if (e) callback(e);
							else async.mapSeries(models, function(model, cb) { //for each model
								var index = models.indexOf(model);
								if (!model._id) cb({
									index: index,
									missing: '_id'
								}); //gotta have an id to update
								else {
									model._id = thumosConfig.db.id(model._id); //mongoize it
									var toPurge = _.pick(model, _.keys(activeProps));
									var selObj = _.mapObject(toPurge, function(val) {
										return 1;
									});
									collection.findOne({
										_id: model._id
									}, selObj, function(e, oldModel) { //get its current value
										if (e) cb(e);
										else if (!oldModel) cb({
											noexist: model._id,
											index: index
										});
										else {
											/* purge any typed Properties */
											toPurge = _.pick(oldModel, _.keys(activeProps));
											async.each(_.keys(toPurge), function(prop, purged) {
												var purge = activeProps[prop].type.server.purge;
												purge(toPurge[prop], purged); //kill it
											}, function(e) {
												/* now update the model */
												if (e) cb(e);
												else collection.update({
													_id: model._id
												}, {
													$set: model
												}, function(e, result) {
													/* check to see if document was succesfully inserted */
													if (!result.n) cb({
														noexist: model._id,
														index: index
													});
													else cb(null, _.extend(oldModel, model));
												});
											});
										}
									});
								}
							}, callback);
						}, true); //update
					},
					del: function(ids, callback) {
						if (ids.constructor !== Array) ids = [ids]; //force to array
						async.reject(ids, function(id, cb) {
							collection.findOne({
								_id: thumosConfig.db.id(id)
							}, function(e, model) {
								if (e || !model) cb();
								else {
									var toPurge = _.pick(model, _.keys(activeProps));
									/* for every property in the model to die */
									async.each(_.keys(toPurge), function(prop, purged) {
										var purge = activeProps[prop].type.server.purge;
										purge(toPurge[prop], purged); //kill it
									}, function(e) {
										if (e) cb();
										else collection.remove({
											_id: thumosConfig.db.id(id)
										}, function(e, res) {
											cb(res.n); //add to the failed if res.n == 0 and was not removed
										});
									});
								}
							});
						}, function(failed) {
							callback(
								failed.length ? {
									failed: failed
								} : null, //error if failed to remove any
								_.difference(ids, failed) //call back with successfully removed ones
							);
						});
					},
					add: function(models, callback) {
						api.valid(models, function(e, toInsert) {
							if (e) callback(e);
							else collection.insert(toInsert, callback);
						});
					},
					find: function(props, callback) {
						var query = {};
						/* make sure the only thing we gettin is actual props */
						for (var prop in props){
							if(prop == '_id') props[prop] = thumosConfig.db.id(props[prop]);
							query[prop] = {
								$eq: props[prop]
							};
						}
						collection.find(query, function(e, raw) {
							callback(e, raw);
						});
					},
					findOne: function(props, callback) {
						api.find(props, function(e, models) {
							callback(e, models[0]);
						});
					},
					search: function(props, callback) {
						var query = _.mapObject(props, function(propVal, propName) {
							return new RegExp(propVal, "i");
						});
						collection.find(query, function(e, raw) {
							callback(e, raw);
						});
					},
					query: function(query, params, callback) {
						if (!config.queries[query]) callback('query: ' + query + ' does not exist');
						else collection.find(config.queries[query](params), function(e, raw) {
							callback(e, raw);
						});
					},
					config: config,
					fn: {},
				};
				callback(null, api);
			}
		});
	}
})