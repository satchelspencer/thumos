define({
	init : browser(function(config, callback){
		var _ = require('underscore');
		var $ = require('jquery');
		var ajax = require('ajax')();
		var validator = require('validator');
		var async = require('async');
		var crc32 = require('crc32');
		
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

		var typedProps = {}; //contains all properties in model that require encode/decode
		async.eachSeries(_.keys(config.properties), function(propName, propDone) {
			var prop = config.properties[propName];
			/* if we have a custom type prop */
			if(prop.type){
				prop.type.props = prop.type.props||{};
				/* call prop init, only once */
				if(!prop.type.complete && prop.type.init){
					prop.type.complete = true; //mark as initialized
					prop.type.init(config, prop.type.props, typeDone);
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
		}, function(e) {
			if (e) callback(e);
			else {
				/* get, del, add and queryies all just go to server */
				config.path = config.path||'/'+config.name;
				var api = {
					valid : validator(config, typedProps),
					get : function(inp, callback){
						var inp = parse(inp);
						if(inp.error) callback(inp.error);
						else ajax.req('get', api.config.path+'/i/'+inp.ids.join(','), api.util.postprocess(callback));
					},
					getOne : function(id, callback){
						api.get(id, function(e, models){
							callback(e, models[0]);
						});
					},
					update : function(models, callback){
						api.valid(models, function(e, update){
							if(e) callback(e);
							else ajax.req('put', api.config.path, update, api.util.postprocess(callback));
						}, true); //update validation
					},
					del : function(inp, callback){ //del
						var inp = parse(inp);
						if(inp.error) callback(inp.error);
						else ajax.req('delete', api.config.path+'/i/'+inp.ids.join(','), function(e, deleted){
							_.each(deleted, function(modelId){
								_.each(api.groups, function(group){
									if(group.util.models[modelId]){
										delete group.util.models[modelId];
										group.util.trigger('del', modelId);
										group.util.trigger('models', _.values(group.util.models));
									}
								});
							});
							callback(e, deleted);
						});
					},
					add : function(models, callback){
						api.valid(models, function(e, toAdd){
							if(e) callback(e);
							else ajax.req('post', api.config.path, toAdd, api.util.postprocess(callback));
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
						var group = {
							on : function(event, callback){
								_.each(event.split(' '), function(event){
									events[event] = events[event]||$.Callbacks('memory unique');
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
								var test = input||function(){return false;};
								/* if we are given a set of models, test will be if included */
								if(!_.isFunction(test)){
									var ids = parse(test).ids;
									test = function(model){
										return _.contains(ids, model._id);
									}
								}	
								group.util.test = test;
								/* now compare against all already known models */
								_.each(api.models, function(model){
									group.util.catch(model);
								})
								return group;
							},
							models : function(callback){
								group.on('add.local del.local update.local', function(){
									callback(_.values(group.util.models));
								});
							},
							util : {
								models : {},
								catch : function(model){
									if(!group.util.test) return false;
									var valid = group.util.test(model);
									var ingroup = group.util.models[model._id];
									if(valid){
										if(ingroup) group.util.trigger('update', model);
										else{ //not currently in group, but should be
											group.util.models[model._id] = model;
											group.util.trigger('add', model);
										}
										var oldModel = api.models[model._id];
										_.each(model, function(newVal, prop){
											if(!ingroup || !oldModel || (JSON.stringify(oldModel[prop]) != JSON.stringify(newVal))){
												group.util.trigger('prop!'+prop, newVal, model._id);
											}
										});
									}else if(ingroup){
										delete group.util.models[model._id];
										group.util.trigger('del', model._id); //trigger w/id
									}
								},
								trigger : function(event){
									var passthrough = _.tail(arguments);
									_.each(event.split(' '), function(event){
										_.each(events, function(callback, eventName){
											if(eventName == event || !eventName.indexOf(event+'.')) callback.fireWith(this, passthrough);
										})
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
						group.bind(input);
						api.groups.push(group);
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
								else async.map(models, function(model, modelDecoded){
									var tprops = _.pick(model, _.keys(typedProps));
									async.eachSeries(_.keys(tprops), function(prop, propDecoded){
										var decode = typedProps[prop].decode||function(inp, cb){cb(null, inp)};
										decode(tprops[prop], function(e, decoded){
											model[prop] = decoded;
											propDecoded(e);
										});
									}, function(e){	
										modelDecoded(e, model);
									});
								}, function(e, decoded){
									if(e) callback(e);
									else{
										var diff = api.util.getChanged(decoded); //incudes new
										_.each(diff, function(model){
											_.each(api.groups, function(group){
												group.util.catch(model);
											});
											api.models[model._id] = model;
										});
										callback(e, decoded);
									}
								});							
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
			}
		});
	})
})