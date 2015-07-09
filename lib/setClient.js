define(['underscore', './ajax', './validator', 'async'], function(_, ajax, validator, async){
	function validId(id, cb){
		return !!id.match(/^[0-9a-f]{24}$/);
	}
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
	return function(config){
		var path = config.path||'/'+config.name; //path for use by api
		/* get, del, add and queryies all just go to server */
		var api = {
			valid : validator(config),
			get : function(inp, callback){
				var inp = parse(inp);
				if(inp.error) callback(inp.error);
				else ajax.req('get', path+'/'+inp.ids.join(','), function(e, models){
					if(!e) api.trigger('change', models);
					callback(e, models);
				});
			},
			del : function(inp, callback){
				var inp = parse(inp);
				if(inp.error) callback(inp.error);
				else ajax.req('delete', path+'/'+inp.ids.join(','), function(e, removedIds){
					if(!e) api.trigger('del', removedIds);
					callback(e, removedIds);
				});
			},
			add : function(models, callback){
				api.valid(models, function(e, toAdd){
					if(e) callback(e);
					else ajax.req('post', path, toAdd, function(e, newModels){
						if(!e) api.trigger('add change', newModels);
						callback(e, newModels);
					});
				});
			},
			find : function(props, callback){
				ajax.req('post', path+'/find', props, function(e, models){
					if(!e) api.trigger('change', models);
					callback(e, models);
				});
			},
			findOne : function(props, callback){
				api.find(props, function(e, models){
					callback(e, models[0]);
				});
			},
			query : function(query, params, callback){
				ajax.req('post', path+'/q/'+query, params, function(e, models){
					if(!e) api.trigger('change', models);
					callback(e, models);
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
							api.ebase(id, event).push(callback);
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
							api.ebase(id, event).forEach(function(callback){
								callback(_.findWhere(inp.models, {_id : id}));
							});
						});
					});
					return true;
				}
			},
			ebase : function(id, event){
				api.events[id] = api.events[id]||{};
				api.events[id][event] = api.events[id][event]||[];
				return api.events[id][event];
			},
			fn : {},
			config : config
		}
		return api;
	}
});