define({
	init : browser(function(config, callback){
		var _ = require('underscore');
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
							var groups = {};
							_.each(deleted, function(id){
								_.each(api.groups, function(group, groupid){
									if(group.models[id]){
										groups[groupid] = groups[groupid]||[];
										groups[groupid].push(id);
									}
									delete api.models[id];
									delete group.models[id];
								})
							});
							_.each(groups, function(removed, id){
								var g = api.groups[id];
								if(g.ondel) g.ondel(removed);
								if(g.watch) g.watch(_.values(g.models));
							});
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
					group : function(options){
						var id = Math.round(Math.random()*Math.pow(2, 32)).toString(16);
						var group = {
							models : {},
							off : function(){
								delete api.groups[id];
							}
						}
						_.extend(group, options);
						_.each(api.models, function(model, id){
							if(group.test(model)) group.models[id] = model;
						})
						api.groups[id] = group;
						return group;
					},
					groups : {},
					models : {},
					fn : {},
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
						/* process models after they are retrieved from server and trigger changed */
						postprocess : function(callback){
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
										var added = {};
										var changed = {};
										var groups = {};
										/* set added an changed to be objects with key: group id, value: array of models */
										_.each(diff, function(model){
											_.each(api.groups, function(group, id){
												if(group.test(model)){
													groups[id] = groups[id]||{
														added : [],
														changed : []
													};
													if(api.models[model['_id']]) groups[id].changed.push(model);
													else groups[id].added.push(model);
												}
											});
										});
										/* for each added and changed group, trigger the events accorgingly */
										_.each(groups, function(group, id){
											var g = api.groups[id];
											if(group.added.length && g.onadd) g.onadd(group.added);
											if(group.changed.length && g.onchange) g.onchange(group.changed);
											if(group.added.length || group.changed.length){
												var newModels = _.mapObject(_.groupBy(_.uniq(group.added.concat(group.changed)), '_id'), function(v){
													return v[0];
												})
												_.extend(g.models, newModels);
												_.extend(api.models, newModels);
												if(g.watch) g.watch(_.values(g.models));
											}
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