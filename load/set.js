define({
	init : browser(function(config, callback){
		var _ = require('underscore');
		var $ = require('jquery');
		var ajax = require('ajax');
		var async = require('async');
		var crc32 = require('crc32');
		var propsControl = require('props')(config);
		var mongo = require('browserify!mongo-parse');
		var sets = require('sets');
		var api;
		var setmodels = {};
		var groups = [];
		var subsets = {};
		var checksums = {};

		/* take in an (array or singleton) of (ids or models w/ids) */
		function parse(idmdls){
			if(!_.isArray(idmdls)) idmdls = [idmdls]; //force to array
			var ids = _.isObject(idmdls[0])?_.pluck(idmdls, '_id'):idmdls; //if array of models pluck out the ids
			var invalids = _.reject(ids, function(id){
				return id.match(/^[0-9a-f]{24}$/); //must fit mongo format
			});
			idmdls = _.compact(_.map(idmdls, function(i){
				if(typeof i == 'string') i = setmodels[i];
				return i;
			}))
			if(!ids.length) return {error : 'noids'};
			if(invalids.length) return {error : {invalid : invalids}};
			else return {
				ids : ids,
				models : idmdls
			};
		}
		/* given models return the changed ones */
		function getChanged(inp){
			var inp = parse(inp);
			if(inp.error) return [];
			return _.filter(inp.models, function(model){
				var existing = setmodels[model._id]; //previous
				var current = JSON.stringify(model);
				return !existing || JSON.stringify(existing) != current;
			});
		}

		/* response handler */
		function response(callback, get){
			callback = callback||function(){};
			return function(e, res){
				if(e) callback(e);
				else{
					var diff = getChanged(res.res); // diff in response
					/* iterate over each set listed in ledger */
					_.each(res.ledger, function(ledger, setname){
						var set = sets[setname];
						if(set){
							if(ledger.update) _.each(getChanged(_.values(ledger.update)), set.util.catch);
							if(ledger.remove) _.each(_.keys(ledger.remove), set.util.purge);
						}
					});
					if(get) res.res = _.map(res.res, function(id){
						return setmodels[id];
					});
					callback(e, res.res);
				}						
			}
		}

		/* extend group or subset with underscore methods */
		function addUnderscore(object){
			var underscoreMethods = ['each', 'map', 'reduce', 'reduceRight', 'filter', 'where', 'findWhere', 'reject', 'every', 'some', 'contains', 'invoke', 'pluck', 'max', 'min', 'sortBy', 'groupBy', 'indexBy', 'countBy', 'shuffle', 'sample', 'toArray', 'size', 'partition'];
			_.each(underscoreMethods, function(methodName){
				object[methodName] = function(){
					var args = arguments;
					var done;
					var lastval;
					function complete(callback){ //will be called with the output from the underscore method onchange
						done = callback;
						if(lastval) callback(lastval);
					}
					object.on('change', function(models){
						var topass = Array.prototype.slice.call(args, 0);
						topass.unshift(models);
						var val = _[methodName].apply(this, topass);
						if(done) done(val);
						else lastval = val;
					});
					return complete; 
				}
			});
		} 

		/* turn $regex with $options into just regex object */
		function parseRegexOptions(query){
			query = query||{};
			for(var f in query){
				if(_.isArray(query[f])) query[f] = _.map(query[f], parseRegexOptions);
				else if(query[f].$options && query[f].$regex){
					query[f].$regex = new RegExp(query[f].$regex, query[f].$options);
					delete query[f].$options;
				}
			}
			return query;
		}

		config.properties = _.mapObject(config.properties, function(value, property){
			if(!value.valid) return {valid : value};
			else return value;
		})

		/* get, del, add and queryies all just go to server */
		config.path = config.path||'/'+config.name;
		var middleware = require('middleware')(config);

		/* public api */
		api = {
			get : function(inp, callback){
				callback = callback || function(){};
				var inp = parse(inp);
				if(inp.error) callback(inp.error);
				else{
					var remote = [];
					var models = _.map(inp.ids, function(id){
						if(!setmodels[id]) remote.push(id);
						return setmodels[id]||id; //leave id in place if not found
					});
					if(remote.length) api.load(remote, function(e, remote){
						if(e) callback(e);
						else{
							_.each(remote, function(model){
								models[models.indexOf(model._id)] = model; //replace that id with fetched model
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
				else ajax.req('get', config.path+'/i/'+inp.ids.join(','), response(callback, 1));
			},
			find : function(query, callback){
				ajax.req('post', config.path+'/find', query, response(callback, 1));
			},
			findOne : function(props, callback){
				api.find(props, function(e, models){
					callback(e, models&&models[0]);
				});
			},
			insert : function(models, callback){
				callback = callback || function(){};
				propsControl(models, false, function(e, models){
					if(e) callback(e);
					else middleware('send valid', models, function(e, toAdd){
						if(e) callback(e);
						else ajax.req('post', config.path, toAdd, response(callback, 1));
					});
				});
			}, 
			update : function(models, callback){
				callback = callback || function(){};
				propsControl(models, true, function(e, models){
					if(e) callback(e);
					else middleware('send valid', models, function(e, update){
						if(e) callback(e);
						else ajax.req('put', config.path, update, response(callback, 1));
					});
				});
			},
			remove : function(inp, callback){ //del
				callback = callback || function(){};
				var inp = parse(inp); //parse model ids
				if(inp.error) callback(inp.error);
				else ajax.req('delete', config.path+'/i/'+inp.ids.join(','), response(callback));
			},
			group : function(inp, parentGroup){
				var events = {};
				var order = function(){return 0;};
				var reverse = false;

				var group = {
					get : function(){
						callback = callback || function(){};
						var inp = parse(inp);
						if(inp.error) callback(inp.error);
						else{
							var remote = [];
							var invalids = []; //cached, but not in group
							var models = _.map(inp.ids, function(id){
								if(!group.util.models[id]){
									if(models[id]) invalids.push(id);
									else remote.push(id);
								}
								return setmodels[id]||id; //leave id in place if not found
							});
							if(invalids.length) callback('not in group'+invalids);
							else if(remote.length) group.load(remote, function(e, remote){
								if(e) callback(e);
								else{
									_.each(remote, function(model){
										models[models.indexOf(model._id)] = model; //replace that id with fetched model
									});
									if(callback) callback(null, models);
								}
							});
							else if(callback) callback(null, models);
						}
					},
					getOne : function(id, callback){
						group.get(id, function(e, models){
							callback(e, models&&models[0]);
						});
					},
					load : function(inp, callback){
						var inp = parse(inp);
						if(inp.error) callback(inp.error);
						else if(!group.util.parsed) callback('not in group'+inp.ids)
						else api.find({ //find by id, also matching query
							$and : [
								group.util.fullQuery(),
								{_id : {$in : inp.ids}} 
							]
						}, callback);
					},
					find : function(query, callback){
						if(!group.util.parsed) callback(null, []); //no query, no result
						else api.find({
							$and : [
								group.util.fullQuery(),
								query 
							]
						}, callback);
					},
					findOne : function(props, callback){
						group.find(props, function(e, models){
							callback(e, models&&models[0]);
						});
					},
					insert : function(models, callback){ //include in group/parents, or existing model
						group.util.include(models, function(e, includedModels){
							if(e) callback(e);
							else api.insert(includedModels, callback);
						})
					},
					update : function(inp, callback){ //must be within group, enforce it staying???? hmmmm not now.
						var inp = parse(inp);
						if(inp.error) callback(inp.error);
						else if(!group.util.parsed) callback('no query');
						else{
							var failed = _.filter(inp.models, function(model){
								return !group.util.models[model._id];
							});
							if(failed.length) callback('models not in group');
							else api.update(inp.models, callback);
						}
					},
					include : function(inp, callback){ //include to group
						api.get(inp, function(e, models){
							if(e) callback(e);
							else group.util.include(models, function(e, included){
								if(e) callback(e);
								else api.update(included, callback);
							})
						});
					},
					exclude : function(inp, callback){ //exclude from group (ADD AN 'UNTILL') param, remove untill a specific parent
						api.get(inp, function(e, models){
							if(e) callback(e);
							else group.util.exclude(models, function(e, excluded){
								if(e) callback(e);
								else api.update(excluded, callback);
							})
						});
					},
					group : function(opt){ //subgroup
						return api.group(opt, group); //return with it as parent
					},
					bind : function(inp){
						var options;
						if(!inp || !inp.query) options = {
							query : inp //input of not object is assumed to be query
						};
						else options = inp;
						group.util.query = options.query;
						if(_.isFunction(options.query)) group.util.test = options.query;
						else{
							group.util.parsed = options.query?mongo.parse(parseRegexOptions(options.query)):false;
							group.util.test = function(inp, cb){
								cb(null, group.util.parsed?group.util.parsed.matches(inp):false); 
							}
						}
						group.util.includefn = options.include||false;
						group.util.excludefn = options.exclude||false;
						/* now compare against all already known models, (in parent group) */
						_.each(group.util.parent?group.util.parent.util.models:setmodels, function(m){
							group.util.catch(m);
						}); 
						if(!_.keys(group.util.models).length) group.util.trigger('change', []); //trigger for empty
						if(!group.util.parent && !_.isFunction(options.query)) api.find(options.query); //fillerup
					},
					order : function(predicate, r){
						var test = predicate;
						if(_.isString(predicate)) test = function(model){
							return model[predicate];
						}
						reverse = !!r;
						order = test;
						/* run models through again */
						_.each(group.util.models, function(model){
							group.util.catch(model);
						})
					},
					on : function(event, callback){
						_.each(event.split(' '), function(event){
							if(event == 'include'){
								/* no memory for adding callbacks, since we're manually implementing "memory" */
								events[event] = events[event]||$.Callbacks();
								_.each(group.util.models, function(model){
									callback(model, group.util.order.indexOf(model._id));
								})
							}else if(event == 'change') events[event] = events[event]||$.Callbacks('memory');
							else events[event] = events[event]||$.Callbacks();
							events[event].add(callback);
						});
					},
					off : function(event){
						_.each(event.split(' '), function(event){
							if(events[event]) events[event].empty();
						});
					},
					includes : function(model){
						return group.util.parsed.matches(model); 
					},
					util : {
						set : api,
						models : {},
						order : [],
						subgroups : [],
						catch : function(model){
							var ingroup = group.util.models[model._id];
							group.util.test(model, function(e, valid){
								if(valid){
									group.util.order = _.chain(group.util.order.concat(model._id))
										.uniq()
										.sortBy(function(id){
											return order(id==model._id?model:setmodels[id]);
										}).value();
									if(reverse) group.util.order.reverse();
									group.util.models[model._id] = model;
									if(ingroup) group.util.trigger('update', model, group.util.order.indexOf(model._id));
									else{ //not currently in group, but should be
										group.util.trigger('include', model, group.util.order.indexOf(model._id));
									}
									/* in group, push the catch down */
									_.each(group.util.subgroups, function(subgroup){
										subgroup.util.catch(model);
									})
								}else if(ingroup) group.util.purge(model._id); //will propogate to subgroups
							})
						},
						trigger : function(event){
							var passthrough = _.tail(arguments);
							_.each(event.split(' '), function(event){
								events[event] = events[event]||$.Callbacks(event == 'include'?undefined:'memory'); //no memory for add
								events[event].fire.apply(this, passthrough);
							})
						},
						include : function(models, callback){
							if(!group.util.includefn) callback('missing include function');
							else if(!group.util.parsed) callback('no query');
							else{
								/* if we have a parent group, include it there first */
								if(group.util.parent) group.util.parent.util.include(models, cont);
								else cont(null, models)
								function cont(e, models){  
									if(!_.isArray(models)) models = [models];
									var notIncluded = _.reject(models, group.includes);
									models = _.difference(models, notIncluded); //remove those about to be changed
									if(e) callback(e);
									else async.map(JSON.parse(JSON.stringify(notIncluded)), group.util.includefn, function(e, included){
										if(e) callback(e);
										else{
											var failed = _.reject(included, function(m){
												return group.util.parsed.matches(m);
											});
											if(failed.length) callback('include failed');
											else callback(null, models.concat(included));
										}
									});
								}
							}
						},
						exclude : function(models, callback){
							if(!group.util.excludefn) callback('missing exclude function');
							else if(!group.util.parsed) callback('no query');
							else{
								if(!_.isArray(models)) models = [models];
								var included = _.filter(models, group.includes); //only exclude the ones that are currently included
								models = _.difference(models, included); //remove those about to be changed
								async.map(JSON.parse(JSON.stringify(included)), group.util.excludefn, function(e, excluded){
									if(e) callback(e);
									else{
										var failed = _.filter(excluded, function(m){
											return group.util.parsed.matches(m);
										});
										if(failed.length) callback('exclude failed');
										else callback(null, models.concat(excluded));
									}
								});
							}
						},
						purge : function(modelId){
							group.util.order = _.without(group.util.order, modelId);
							delete group.util.models[modelId];
							group.util.trigger('exclude', modelId);
							group.util.trigger('models', _.values(group.util.models));
							/* for any subgroups, purge should propegate */
							_.each(group.util.subgroups, function(subgroup){
								subgroup.util.purge(modelId);
							})
						},
						fullQuery : function(){ //gets query inclusive with parents
							if(group.util.parent){
								var pq = group.util.parent.util.fullQuery();
								if(!_.isArray(pq)) pq = [pq];
								return {$and : pq.concat(group.util.query)}
							}else return group.util.query;
						}
					}
				};
				group.on('include exclude update', function(){
					var m = _.map(group.util.order, function(id){
						return group.util.models[id];
					});
					group.util.trigger('change', m);
				})
				if(parentGroup){
					group.util.parent = parentGroup;
					parentGroup.util.subgroups.push(group);
				}
				else groups.push(group);
				group.bind(inp);
				addUnderscore(group);
				return group;
			},
			subset : function(inp){
				var events = {};
				var order = function(){return 0;};
				var reverse = false;

				var subset = {
					bind : function(inp){
						inp = inp||[];
						if(!_.isArray(inp)) inp = [inp];
						if(inp.length){
							var inp = parse(inp);
							if(inp.error) return false;
							subset.include(inp.ids); //include all since it getch checked anyways
						}
						subset.exclude(_.difference(_.keys(subset.util.models), inp.ids||inp)) //exclude what we need to
					},
					include : function(inp){
						api.get(inp, function(e, models){
							var newlyIncluded = _.reject(models, function(model){ //not in model
								return subset.util.models[model._id]; 
							});
							_.each(newlyIncluded, function(model){
								subsets[model._id] = subsets[model._id]||[];
								subsets[model._id] = _.uniq(subsets[model._id].concat(subset));
								subset.util.catch(model);
							})
							if(newlyIncluded.length) subset.util.trigger('change', subset.util.getOrderedModels());
						})
					},
					exclude : function(inp){
						var inp = parse(inp);
						if(inp.error) return false;
						var newlyExcluded = _.intersection(_.keys(subset.util.models), inp.ids);
						_.each(newlyExcluded, function(toExclude){
							subsets[toExclude] = _.without(subsets[toExclude], subset);
							delete subset.util.models[toExclude];
							subset.util.trigger('exclude', toExclude);
						})
						if(newlyExcluded.length) subset.util.trigger('change', subset.util.getOrderedModels());
					},
					insert : function(models, callback){ //include in group/parents, or existing model
						api.insert(models, function(e, models){
							if(e) callback(e);
							else{
								subset.include(models);
								callback(null, models);
							}
						});
					},
					order : function(predicate, r){
						var test = predicate;
						if(_.isString(predicate)) test = function(model){
							return model[predicate];
						}
						reverse = !!r;
						order = test;
						/* run models through again */
						_.each(subset.util.models, function(model){
							subset.util.catch(model);
						})
					},
					on : function(event, callback){
						_.each(event.split(' '), function(event){
							if(event == 'include'){
								events[event] = events[event]||$.Callbacks();
								_.each(subset.util.models, function(model){
									callback(model); //no order for the moment
								})
							}else if(event == 'change') events[event] = events[event]||$.Callbacks('memory');
							else events[event] = events[event]||$.Callbacks();
							events[event].add(callback);
						});
					},
					off : function(event){
						_.each(event.split(' '), function(event){
							if(events[event]) events[event].empty();
						});
					},
					prop : function(propName, callback){
						subset.on('prop!'+propName, callback);
					},
					util : {
						set : api,
						order : [],
						models : {},
						getOrderedModels : function(){
							return _.compact(_.map(subset.util.order, function(id){
								return subset.util.models[id]
							}))
						},
						trigger : function(event){
							var passthrough = _.tail(arguments);
							_.each(event.split(' '), function(event){
								events[event] = events[event]||$.Callbacks(event == 'include'?undefined:'memory'); //no memory for add
								events[event].fire.apply(this, passthrough);
							})
						},
						catch : function(model){
							subset.util.order = _.chain(subset.util.order.concat(model._id))
								.uniq()
								.sortBy(function(id){
									return order(id==model._id?model:setmodels[id]);
								}).value();
							if(reverse) subset.util.order.reverse();
							var old = subset.util.models[model._id];
							if(old) subset.util.trigger('update', model, subset.util.order.indexOf(model._id));
							else subset.util.trigger('include', model, subset.util.order.indexOf(model._id));
							subset.util.models[model._id] = model;
							if(old) subset.util.trigger('change', subset.util.getOrderedModels());
							var oldModel = setmodels[model._id];
							_.each(model, function(newVal, prop){
								if(!old || JSON.stringify(oldModel[prop]) != JSON.stringify(newVal)){
									subset.util.trigger('prop!'+prop, newVal, model._id);
								}
							});
						}
					}
				};
				subset.bind(inp);
				addUnderscore(subset)
				return subset;
			},
			config : config,
			util : {
				catch : function(model){
					_.each(groups, function(group){
						group.util.catch(model);
					});
					if(subsets[model._id]) _.each(subsets[model._id], function(subset){
						subset.util.catch(model);
					});
					setmodels[model._id] = model;
				},
				purge : function(modelId){
					_.each(groups, function(group){
						if(group.util.models[modelId]) group.util.purge(modelId);
					});
					if(subsets[modelId]) _.each(subsets[modelId], function(subset){
						subset.exclude(modelId);
					});
					delete setmodels[modelId];
				}
			}
		}
		require('sets')[config.name] = api; //add to global list of sets
		callback(null, api);
	})
})