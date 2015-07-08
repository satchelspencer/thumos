define(['underscore', './ajax', './validator', 'async'], function(_, ajax, validator, async){
	function validId(id){
		return !!id.match(/^[0-9a-f]{24}$/);
	}
	return function(config){
		var path = config.path||'/'+config.name;
		var api = {
			valid : validator(config),
			get : function(ids, callback){
				if(!_.isArray(ids)) ids = [ids];
				if(!_.every(ids, validId)) callback('invalid id');
				else ajax.req('get', path+'/'+ids.join(','), callback);
			},
			del : function(ids, callback){
				if(!_.isArray(ids)) ids = [ids];
				if(!_.every(ids, validId)) callback('invalid id');
				else ajax.req('delete', path+'/'+ids.join(','), callback);
			},
			add : function(models, callback){
				api.valid(models, function(e, toAdd){
					if(e) callback(e);
					else ajax.req('post', path, toAdd, callback);
				});
			},
			find : function(props, callback){
				ajax.req('post', path+'/find', props, callback)
			},
			findOne : function(props, callback){
				api.find(props, function(e, models){
					callback(e, models[0]);
				});
			},
			query : function(query, params, callback){
				ajax.req('post', path+'/q/'+query, params, callback);
			},
			on : function(event, callback){
			
			},
			off : function(event){
			
			},
			trigger : function(event){
			
			},
			fn : {},
			config : config
		}
		return api;
	}
});