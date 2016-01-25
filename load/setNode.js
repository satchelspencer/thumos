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
		/*  make _id in a query work */
		function idify(query){
			if(query._id) query._id = thumosConfig.db.id(query._id);
			return query;
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
								}, function(e, oldModel) { //get its current value
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
											else middleware('remove', overwritten, function(e){
												cb(e, _.extend(oldModel, newModel));
											}, context);
										});
									}, context); 
								});
							}, callback);
						}, context);
					});
				})
			},
			del: function(ids, callback, context) {
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
						}, function(e, model){
							if(e || !model) cb(e||id+' does not exist');
							else middleware('remove', model, function(e){
								if(e) cb(e);
								else collection.remove({
									_id: thumosConfig.db.id(id)
								}, function(e, res) {
									if(e || !res.n) cb(e || 'failed to remove '+id); //add to the failed if res.n == 0 and was not removed
									else{
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
			add: function(models, callback, context) {
				access.write(context, function(e, accessQuery){
					if(e) callback({permission:e});
					else propsControl(models, false, function(e, models){ 
						if(e) callback(e);
						else middleware('valid', models, function(e, models) {
							if(e) callback(e);
							else middleware('store', models, function(e, models){
								if(e) callback(e);
								else middleware('init', models, function(e, models){
									if(e) callback(e);
									else collection.insert(models, callback);
								}, context);
							}, context); 
						}, context);
					});
				});
			},
			find: function(props, callback, context) {
				access.read(context, function(e, accessQuery){
					if(e) callback({permission:e});
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
						}, function(e, raw) {
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
			search: function(props, callback, context) {
				access.read(context, function(e, accessQuery){
					if(e) callback({permission:e});
					else{
						var query = _.mapObject(props, function(propVal, propName) {
							return new RegExp(propVal.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"), "i");
						});
						collection.find({
							$and : [
								query,
								accessQuery
							]
						}, function(e, raw) {
							callback(e, raw);
						});
					}
				});
			},
			query: function(query, params, callback, context) {
				if (!config.queries[query]) callback('query: ' + query + ' does not exist');
				else access.read(context, function(e, accessQuery){
					if(e) callback({permission:e});
					else collection.find({
						$and : [
							idify(config.queries[query](params)),
							accessQuery
						]	
					}, function(e, raw) {
						callback(e, raw);
					});
				});
			},
			config: config
		};
		callback(null, api);
	}
})