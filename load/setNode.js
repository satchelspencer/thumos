define({
	init: function(config, callback) {
		var _ = require('underscore');
		var async = require('async');
		var thumosConfig = require('config'); //get injected
		var propsControl = require('props')(config);
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
		/*  make _id in a query work:
		see: https://github.com/Automattic/monk/blob/2821708862d8dba0303a78095ebbb90f1fef5b2b/lib/collection.js#L548 */
		function id(something){
			if(_.keys(something).length && !something._bsontype){
				if(_.isArray(something)) return _.map(something, id);
				else return _.mapObject(something, id);
			}else return thumosConfig.db.id(something);
		}

		function transformPart(val, key){
			if(key == '_id') return id(val);
			else if(_.keys(val).length && !val._bsontype) return idify(val);
			else return val;
		}

		function idify(query){
			if(_.isArray(query)) return _.map(query, transformPart);
			else if(_.keys(query).length) return _.mapObject(query, transformPart);
			else return query;
		}
		/* access control is overridden if called by server w/ no id */
		var access = {
			read : function(id,c){
				if(id === undefined) c(null, {}); //when undefined, it is the server calling so let it do whatever the fuck it wants
				else config.access.read(id, function(e, q){
					c(e, idify(q)||{}); //default to empty query
				});
			},
			write : function(id,c){
				if(id === undefined) c(null, {});
				else config.access.write(id, function(e, q){
					c(e, idify(q)||{});
				});
			}
		};

		function ledger(context, inp, which){
			if(!context) return false;
			context.ledger[config.name] = context.ledger[config.name]||{};
			context.ledger[config.name][which] = context.ledger[config.name][which]||{};
			context.ledger[config.name][which][inp._id||inp] = inp._id?inp:1;
		}

		var propsQuery = _.mapObject(config.properties, function(val){
			return 1;
		});

		config.properties = _.mapObject(config.properties, function(value, property){
			if(!value.valid) return {valid : value};
			else return value;
		})

		var collection = thumosConfig.db.collection(config.collection || config.name);
		var middleware = require('middleware')(config);
		var api = {
			get: function(ids, callback, context) {
				access.read(context, function(e, accessQuery){
					if(e) callback({permission:e});
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
						}, propsQuery, function(e, models) {
							if (e) callback(e);
							else {
								/* check to see that we found all the models */
								var missing = _.difference(mds, _.pluck(models, '_id').map(thumosConfig.db.str));
								if (missing.length) callback({
									noexist: missing
								});
								else{
									_.each(models, function(model){
										ledger(context, model, 'update');
									});
									callback(null, models);
								}
							}
						});
					}
				})
			},
			getOne: function(id, callback, context) {
				api.get([id], function(e, models) {
					callback(e, e||models[0]);
				}, context);
			},
			update: function(data, callback, context) {
				access.write(context, function(e, accessQuery){
					if(e) callback({permission:e});
					else propsControl(data, true, function(e, models){ 
						if (e) callback(e);
						else middleware('valid', models, function(e, models) { //make sure its valid
							if (e) callback(e);
							else async.mapSeries(models, function(model, cb) { //for each model, update
								model._id = thumosConfig.db.id(model._id);
								collection.findOne({
									$and : [
										{_id: model._id},
										accessQuery
									]
								}, propsQuery, function(e, oldModel) { //get its current value
									var overwritten = _.pick(oldModel, _.keys(model));
									if(e || !oldModel) cb(e || {noexist: model._id});
									else middleware('store', model, function(e, newModel){
										if(e) cb(e);
										else collection.update({
											_id: model._id
										}, {
											$set: model
										}, function(e, result) {
											/* check to see if document was succesfully inserted */
											if(!result.n) cb({updateerr: model._id});
											else middleware('stored', model, function(e){
												if(e) cb(e);
												else middleware('remove', overwritten, function(e){
													var final = _.extend(oldModel, newModel);
													ledger(context, final, 'update');
													cb(e, final);
												}, context);
											}) 
										});
									}, context); 
								});
							}, callback);
						}, context);
					});
				})
			},
			remove: function(ids, callback, context) {
				if (!_.isArray(ids)) ids = [ids]; //force to array
				access.write(context, function(e, accessQuery){
					var removed = []
					if(e) callback({permission:e});
					else async.eachSeries(ids, function(id, cb) {
						collection.findOne({
							$and : [
								{_id: thumosConfig.db.id(id)},
								accessQuery
							]
						}, propsQuery, function(e, model){
							if(e || !model) cb(e||id+' does not exist');
							else middleware('unlink', model, function(e){
								if(e) cb(e);
								else collection.remove({
									_id: thumosConfig.db.id(id)
								}, function(e, res) {
									if(e || !res.n) cb(e || 'failed to remove '+id); //add to the failed if res.n == 0 and was not removed
									else{
										ledger(context, id, 'remove');
										removed.push(id);
										middleware('remove', model, cb, context);
									}
								});
							}, context); 
						});
					}, function(e) {
						callback(e, removed);
					});
				})
			},
			insert: function(models, callback, context) {
				access.write(context, function(e, accessQuery){
					if(e) callback({permission:e});
					else propsControl(models, false, function(e, models){ 
						if(e) callback(e);
						else middleware('valid store init', models, function(e, models) {
							if(e) callback(e);
							else collection.insert(models, function(e, models){
								if(e) callback(e);
								else middleware('stored', models, function(e){
									if(!e) _.each(models, function(model){
										ledger(context, model, 'update');
									});
									callback(e, models);
								})
							});
						}, context);
					});
				});
			},
			find: function(query, callback, context) {
				var util = nodeRequire("util");
				access.read(context, function(e, accessQuery){
					if(e) callback({permission:e});
					else{
						collection.find({
							$and : [
								idify(query),
								accessQuery
							]
						}, propsQuery, function(e, raw) {
							if(!e) _.each(raw, function(model){
								ledger(context, model, 'update');
							});
							callback(e, raw);
						});
					}
				});
			},
			findOne: function(props, callback, context) {
				api.find(props, function(e, models) {
					callback(e, models?models[0]:null);
				}, context);
			},
			config: config
		};
		callback(null, api);
	}
})
