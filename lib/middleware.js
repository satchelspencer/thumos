/* middleware caller */
define(function(set){
	var async = require('async');
	var _ = require('underscore');
	var types = require('./types.js');

	function series(middlewares, input, callback, uid, plural){
		if(!_.isArray(middlewares)) middlewares = [middlewares];
		async.reduce(middlewares, input, function(values, middleware, middlewareDone){
			if(!_.isFunction(middleware)) middleware = types[middleware];
			if(!_.isArray(values)) values = [values];
			async.map(values, function(value, valueDone){
				middleware(value, function(e, middlewareOutput){
					valueDone(e, middlewareOutput||value);
				}, uid)
			}, function(e, values){
				if(!plural) values = values[0];
				middlewareDone(e, values);
			})
		}, callback)
	}

	return function(name, models, callback, uid){
		var revert = !_.isArray(models);
		if(revert) models = [models];
		async.map(models, function(model, modelDone){
			var properties = _.intersection(_.keys(model), _.keys(set.properties)); //only use defined properties
			async.each(properties, function(prop, propDone){
				var propDef = set.properties[prop];
				if(propDef[name]) series(propDef[name], model[prop], function(e, newProp){
					if(newProp) model[prop] = newProp;
					propDone(e);
				}, uid, propDef.plural)
				else propDone();
			}, function(e){
				if(e) modelDone(e);
				else if(set[name]) series(set[name], model, function(e, newModel){
					modelDone(e, newModel||model);
				}, uid);
				else modelDone(null, model);
			})
		}, function(e, models){
			callback(e, revert?models[0]:models);
		});
	}
})