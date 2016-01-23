define({
	init : browser(function(config, callback){
		var _ = require('underscore');
		var $ = require('jquery');
		var ajax = require('ajax');
		var async = require('async');
		var crc32 = require('crc32');
		var propsControl = require('props')(config);
		
		/* take in an (array or singleton) of (ids or models w/ids) */
		function parse(idmdls){
			if(!_.isArray(idmdls)) idmdls = [idmdls]; //force to array
			var ids = _.isObject(idmdls[0])?_.pluck(idmdls, '_id'):idmdls; //if array of models pluck out the ids
			var invalids = _.reject(ids, function(id){
				return id.match(/^[0-9a-f]{24}$/); //must fit mongo format
			});
			if(!ids.length) return {error : 'noids'}
			if(invalids.length) return {error : {invalid : invalids}};
			else return {
				ids : ids,
				models : idmdls
			};
		}
		/* checksum a model */
		function checksum(model){
			return crc32.str(JSON.stringify(model));
		}

		config.properties = _.mapObject(config.properties, function(value, property){
			if(!value.valid) return {valid : value};
			else return value;
		})

		/* get, del, add and queryies all just go to server */
		config.path = config.path||'/'+config.name;
		var middleware = require('middleware')(config);
		var api = {
			get : function(inp, callback){
				callback = callback || function(){};
				var inp = parse(inp);
				if(inp.error) callback(inp.error);
				else{
					var remote = [];
					var models = _.map(inp.ids, function(id){
						if(!api.models[id]) remote.push(id);
						return api.models[id]||id; //leave id in place if not found
					});
					if(remote.length) api.load(remote, function(e, remote){
						if(e) callback(e);
						else{
							_.each(remote, function(model){
								models[models.indexOf(model._id)] = model;
							});
							if(callback) callback(null, models);
						}
					});
					else if(callback) callback(null, models);
				}
			},
			getOne : function(id, callback){
				api.get(id, function(e, models){
					callback(e, models&&models[0]);
				});
			},
			load : function(inp, callback){
				var inp = parse(inp);
				if(inp.error) callback(inp.error);
				else ajax.req('get', api.config.path+'/i/'+inp.ids.join(','), api.util.postprocess(callback));
			},
			update : function(models, callback){
				callback = callback || function(){};
				propsControl(models, true, function(e, models){
					if(e) callback(e);
					else middleware('send', models, function(e, update){
						if(e) callback(e);
						else middleware('valid', update, function(e, update){
							if(e) callback(e);
							else ajax.req('put', api.config.path, update, api.util.postprocess(callback));
						})
					});
				});
			},
			del : function(inp, callback){ //del
				callback = callback || function(){};
				var inp = parse(inp);
				if(inp.error) callback(inp.error);
				else ajax.req('delete', api.config.path+'/i/'+inp.ids.join(','), function(e, deleted){
					_.each(deleted, function(modelId){
						_.each(api.groups, function(group){
							if(group.util.models[modelId]){
								group.util.order = _.without(group.util.order, modelId);
								delete group.util.models[modelId];
								group.util.trigger('del', modelId);
								group.util.trigger('models', _.values(group.util.models));
							}
						});
					});
					if(callback) callback(e, deleted);
				});
			},
			add : function(models, callback){
				callback = callback || function(){};
				propsControl(models, false, function(e, models){
					if(e) callback(e);
					else middleware('send', models, function(e, toAdd){
						if(e) callback(e);
						else middleware('valid', toAdd, function(e, toAdd){
							if(e) callback(e);
							else ajax.req('post', api.config.path, toAdd, api.util.postprocess(callback));
						})
					});
				});
			},
			find : function(props, callback){ //decode
				ajax.req('post', api.config.path+'/find', props, api.util.postprocess(callback));
			}, 
			findOne : function(props, callback){
				api.find(props, function(e, models){
					callback(e, models[0]);
				});
			},
			search : function(props, callback){
				ajax.req('post', api.config.path+'/search', props, api.util.postprocess(callback));
			},
			query : function(query, params, callback){
				ajax.req('post', api.config.path+'/q/'+query, params, function(e, models){
					if(e) callback(e);
					else api.decode(models, api.util.postprocess(callback));
				});
			},
			group : function(input){
				var events = {};
				var props = {};
				var order = function(){return 0;};
				var reverse = false;
				var group = {
					on : function(event, callback){
						_.each(event.split(' '), function(event){
							if(event == 'add'){
								/* no memory for adding callbacks, since we're manually implementing "memory" */
								events[event] = events[event]||$.Callbacks();
								_.each(group.util.models, function(model){
									callback(model);
								})
							}else events[event] = events[event]||$.Callbacks('memory');
							events[event].add(callback);
						});
						return group;
					},
					off : function(event){
						_.each(event.split(' '), function(event){
							if(events[event]) events[event].empty();
						});
					},
					prop : function(propName, callback){
						group.on('prop!'+propName, callback);
						return group;
					},
					bind : function(input){
						if(input == 'all') input = function(){return true;};
						var test = input||function(){return false;};
						/* if we are given a set of models, test will be if included */
						if(!_.isFunction(test)){
							var ids = parse(test).ids;
							test = function(model){
								return _.contains(ids, model._id);
							}
							if(ids) api.get(ids, function(e, models){
								_.each(models, group.util.catch);
							});
						}
						group.util.test = test;
						/* now compare against all already known models */
						_.each(api.models, group.util.catch);
						return group;
					},
					models : function(callback){
						group.on('add del update', function(){
							callback(_.values(group.util.models));
						});
					},
					order :  function(predicate, r){
						var test = predicate;
						if(_.isString(predicate)) test = function(model){
							return model[predicate];
						}
						reverse = r;
						order = test;
						_.each(group.util.models, function(model){
							group.util.catch(model);
						})
					},
					util : {
						models : {},
						order : [],
						catch : function(model){
							if(!group.util.test) return false;
							var valid = group.util.test(model);
							var ingroup = group.util.models[model._id];
							if(valid){
								group.util.order = _.chain(group.util.order.concat(model._id))
									.uniq()
									.sortBy(function(id){
										return order(id==model._id?model:api.models[id]);
									}).value();
								if(reverse) group.util.order.reverse();
								group.util.models[model._id] = model;
								if(ingroup) group.util.trigger('update', model, group.util.order.indexOf(model._id));
								else{ //not currently in group, but should be
									group.util.trigger('add', model, group.util.order.indexOf(model._id));
								}
								var oldModel = api.models[model._id];
								_.each(model, function(newVal, prop){
									if(!ingroup || !oldModel || (JSON.stringify(oldModel[prop]) != JSON.stringify(newVal))){
										group.util.trigger('prop!'+prop, newVal, model._id);
									}
								});
							}else if(ingroup){
								group.util.order = _.without(group.util.order, model._id);
								delete group.util.models[model._id];
								group.util.trigger('del', model._id); //trigger w/id
							}
						},
						trigger : function(event){
							var passthrough = _.tail(arguments);
							_.each(event.split(' '), function(event){
								events[event] = events[event]||$.Callbacks(event == 'add'?undefined:'memory'); //no memory for add
								events[event].fire.apply(this, passthrough);
							})
						}
					}
				};
				var underscoreMethods = ['each', 'map', 'reduce', 'reduceRight', 'find', 'filter', 'where', 'findWhere', 'reject', 'every', 'some', 'contains', 'invoke', 'pluck', 'max', 'min', 'sortBy', 'groupBy', 'indexBy', 'countBy', 'shuffle', 'sample', 'toArray', 'size', 'partition'];
				_.each(underscoreMethods, function(methodName){
					group[methodName] = function(){
						var args = arguments;
						var done;
						function complete(callback){
							done = callback;
						}
						group.models(function(models){
							var topass = Array.prototype.slice.call(args, 0);
							topass.unshift(models);
							var val = _[methodName].apply(this, topass);
							if(done) done(val);
						});
						return complete;
					}
				});
				api.groups.push(group);
				group.bind(input);
				return group;
			},
			models : {},
			groups : [],
			fn : {},
			config : config,
			util : {
				checksums : {}, //object of checksums for model ids
				getChanged : function(inp){ //given models return the changed ones
					var inp = parse(inp);
					if(inp.error) return [];
					return _.filter(inp.models, function(model){
						var existing = api.util.checksums[model._id]; //previous
						var current = checksum(model); //new
						if(!existing || existing != current){
							api.util.checksums[model._id] = current; //update if model doesnt exist or is different
							return true;
						}else return false;
					});
				},
				/* process models after they are retrieved from server and trigger changed */
				postprocess : function(callback){
					callback = callback||function(){};
					return function(e, models){
						if(e) callback(e);
						else{
							var diff = api.util.getChanged(models); //incudes new
							_.each(diff, function(model){
								_.each(api.groups, function(group){
									group.util.catch(model);
								});
								api.models[model._id] = model;
							});
							callback(e, models);
						}						
					}
				}
			}
		}
		/* setup custom functions */
		_.each(config.fn||{}, function(fn, name){
			api.fn[name] = function(inp, options, callback){
				options = _.isArray(options)?options:[options]; //force to array
				inp = parse(inp); //parse models
				if(inp.error) callback(inp.error);
				else if(inp.models.length == 1) fn.call(api, inp.models[0], options[0], callback);
				if(inp.models.length != options.length) callback('mismatched lengths');
				else async.map(_.zip(inp.models, options), function(tuple, done){ //aggregate the callback response for each model
					fn.call(api, tuple[0], tuple[1], done); //function gets passed everything and api as `this`
				}, callback);
			}
		});
		callback(null, api);
	})
})