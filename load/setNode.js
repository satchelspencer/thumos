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
		/* config.access may be just a function */
		if(_.isFunction(config.access)) config.access = {
			read : config.access,
			write : config.access
		};
		/* if no access conroll specified, default to read only */
		config.access = config.access||{};
		config.access.read = config.access.read||function(i,c){c()};
		config.access.write = config.access.write||function(i,c){c()}; //always throw error
		/* access control is overridden if called by server w/ no id */
		var access = {
			read : function(id,c){
				if(id === undefined) c(null, {});
				else config.access.read(id, function(e, q){
					c(e, q||{}); //default to empty query
				});
			},
			write : function(id,c){
				if(id === undefined) c(null, {});
				else config.access.write(id, function(e, q){
					c(e, q||{});
				});
			}
		};

		/* createset() */
		/* for all types that have uninitialized server handlers, doit */
		var typedProps = {};
		var privateProps = {};
		async.eachSeries(_.keys(config.properties), function(propName, propDone) {
			var prop = config.properties[propName];
			/* if prop is private, flag it */
			if(prop.private) privateProps[propName] = 0;
			/* if we have a custom type prop */
			if(prop.type){
				prop.type.props = prop.type.props||{};
				/* call prop init, only once */
				if(!prop.type.complete && prop.type.init){
					prop.type.complete = true; //mark as initialized
					prop.type.init(thumosConfig, prop.type.props, typeDone);
				}else typeDone();
				/* type has been initialized */
				function typeDone(e){
					prop.type.complete = true;
					var ident = config.name+'-'+propName;
					if(prop.type.api && !e){
						/* get api given context of current property */
						prop.type.api(ident, prop, function(e, api){
							typedProps[propName] = api; //save it in typedProps by `NAME`
							prop.type.props[ident] = prop;
							propDone(e);
						});
					}else propDone(e);
				}
			}
			else propDone();
		}, function(e){
			if (e) callback(e);
			else{
				var collection = thumosConfig.db.collection(config.collection || config.name);

				var api = {
					valid: validator(config, typedProps), //setup the validator given our config
					get: function(ids, callback, uid) {
						access.read(uid, function(e, accessQuery){
							if(e) callback('permission denied: '+e);
							else{
								/* get all ids */
								var invalid = _.reject(ids, thumosConfig.db.id);
								var mds = _.uniq(ids); //mongoids
								if (invalid.length) callback({
									invalid: invalid
								});
								else collection.find({
									$and : [
										{_id: {
											$in: mds.map(thumosConfig.db.id)
										}},
										accessQuery
									]
								}, privateProps, function(e, models) {
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
							}
						})
					},
					getOne: function(id, callback, uid) {
						api.get([id], function(e, models) {
							callback(e, e||models[0]);
						});
					},
					update: function(data, callback, uid) {
						access.write(uid, function(e, accessQuery){
							if(e) callback('permission denied: '+e);
							else api.valid(data, function(e, models) { //make sure its valid
								if (e) callback(e);
								else async.mapSeries(models, function(model, cb) { //for each model
									var index = models.indexOf(model);
									if (!model._id) cb({
										index: index,
										missing: '_id'
									}); //gotta have an id to update
									else {
										model._id = thumosConfig.db.id(model._id); //mongoize it
										var toPurge = _.pick(model, _.keys(typedProps)); //only purge if its typed
										/* mongodb field selction object, only to include props that must be destroyed */
										var selObj = _.mapObject(toPurge, function(val) {
											return 1;
										});
										collection.findOne({
											$and : [
												{_id: model._id},
												accessQuery
											]
										}, selObj, function(e, oldModel) { //get its current value
											if (e) cb(e);
											else if (!oldModel) cb({
												noexist: model._id,
												index: index
											});
											else {
												/* purge any typed Properties */
												toPurge = _.pick(oldModel, _.keys(typedProps));
												async.each(_.keys(toPurge), function(prop, purged) {
													var purge = typedProps[prop].purge;
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
							}, uid, true); //update
						})
					},
					del: function(ids, callback, uid) {
						if (ids.constructor !== Array) ids = [ids]; //force to array
						access.write(uid, function(e, accessQuery){
							if(e) callback('permission denied: '+e);
							else async.reject(ids, function(id, cb) {
								collection.findOne({
									$and : [
										{_id: thumosConfig.db.id(id)},
										accessQuery
									]
								}, function(e, model) {
									if (e || !model) cb();
									else {
										var toPurge = _.pick(model, _.keys(typedProps));
										/* for every property in the model to die */
										async.each(_.keys(toPurge), function(prop, purged) {
											var purge = typedProps[prop].purge;
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
						})
					},
					add: function(models, callback, uid) {
						access.write(uid, function(e, accessQuery){
							if(e) callback('permission denied: '+e);
							else api.valid(models, function(e, toInsert) {
								if (e) callback(e);
								else collection.insert(toInsert, callback);
							}, uid);
						});
					},
					find: function(props, callback, uid) {
						access.read(uid, function(e, accessQuery){
							if(e) callback('permission denied: '+e);
							else{
								var query = {};
								/* make sure the only thing we gettin is actual props */
								for (var prop in props){
									if(prop == '_id') props[prop] = thumosConfig.db.id(props[prop]);
									query[prop] = {
										$eq: props[prop]
									};
								}
								collection.find({
									$and : [
										query,
										accessQuery
									]
								}, privateProps, function(e, raw) {
									callback(e, raw);
								});
							}
						});
					},
					findOne: function(props, callback, uid) {
						api.find(props, function(e, models) {
							callback(e, models?models[0]:null);
						}, uid);
					},
					search: function(props, callback, uid) {
						access.read(uid, function(e, accessQuery){
							if(e) callback('permission denied: '+e);
							else{
								var query = _.mapObject(props, function(propVal, propName) {
									return new RegExp(propVal.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"), "i");
								});
								collection.find({
									$and : [
										query,
										accessQuery
									]
								}, privateProps, function(e, raw) {
									callback(e, raw);
								});
							}
						});
					},
					query: function(query, params, callback, uid) {
						if (!config.queries[query]) callback('query: ' + query + ' does not exist');
						else access.read(uid, function(e, accessQuery){
							if(e) callback('permission denied: '+e);
							else collection.find({
								$and : [
									config.queries[query](params),
									accessQuery
								]	
							}, privateProps, function(e, raw) {
								callback(e, raw);
							});
						});
					},
					config: config
				};
				callback(null, api);
			}
		});
	}
})