define(['underscore', 'ajax', './validator', 'async', 'crc32'], function(_, ajax, validator, async, crc32){
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
	return function(config){
		var typedProps = {}; //contains all properties in model that require encode/decode
		_.each(config.model.properties, function(value, prop){
			if(value.type) typedProps[prop] = value;
		});
		/* get, del, add and queryies all just go to server */
		config.path = config.path||'/'+config.name;
		var api = {
			valid : validator(config),
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
				else ajax.req('delete', api.config.path+'/i/'+inp.ids.join(','), function(e, removedIds){
					if(!e) api.trigger('del', removedIds);
					callback(e, removedIds);
				});
			},
			add : function(models, callback){
				api.valid(models, function(e, toAdd){
					console.log(toAdd);
					if(e) callback(e);
					else ajax.req('post', api.config.path, toAdd, api.util.postprocess(function(e, newModels){ //decode that
						if(!e) api.trigger('add', newModels); //change is already triggered by default
						callback(e, newModels);
					}));
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
			query : function(query, params, callback){
				ajax.req('post', api.config.path+'/q/'+query, params, function(e, models){
					if(e) callback(e);
					else api.decode(models, api.util.postprocess(callback));
				});
			},
			/* event handling logic */
			events : {},
			on : function(events, inp, callback){
				var inp = parse(inp);
				if(inp.error) return false;
				else{
					events.split(' ').forEach(function(event){
						inp.ids.forEach(function(id){
							api.util.ebase(id, event).push(callback);
						});
					});
					return true;
				}
			},
			off : function(events, inp){
				var inp = parse(inp);
				if(inp.error) return false;
				else{
					events.split(' ').forEach(function(event){
						inp.ids.forEach(function(id){
							if(api.events[id][event]) delete api.events[id][event];
						});
					});
					return true;
				}
			},
			trigger : function(events, inp){
				var inp = parse(inp);
				if(inp.error) return false;
				else{
					events.split(' ').forEach(function(event){
						inp.ids.forEach(function(id){
							api.util.ebase(id, event).forEach(function(callback){
								callback(_.findWhere(inp.models, {_id : id}));
							});
						});
					});
					return true;
				}
			},
			config : config,
			util : {
				ebase : function(id, event){
					api.events[id] = api.events[id]||{};
					api.events[id][event] = api.events[id][event]||[];
					return api.events[id][event];
				},
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
				fn : {},
				/* process models after they are retrieved from server and trigger changed */
				postprocess : function(callback){
					return function(e, models){
						if(e) callback(e);
						else async.map(models, function(model, modelDecoded){
							var tprops = _.pick(model, _.keys(typedProps));
							async.eachSeries(_.keys(tprops), function(prop, propDecoded){
								console.log('decoding', prop);
								typedProps[prop].type.decode(tprops[prop], function(e, decoded){
									model[prop] = decoded;
									callback(e);
								});
							}, function(e){	
								modelDecoded(e, model);
							});
						}, function(e, decoded){
							console.log('opp', e, decoded);
							if(!e) api.trigger('change', api.util.getChanged(decoded));
							callback(e, decoded);
						});							
					}
				}
			}
		}
		return api;
	}
});