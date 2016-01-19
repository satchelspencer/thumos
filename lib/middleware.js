/* middleware caller */
define(function(set){
	var async = require('async');
	var _ = require('underscore');

	function series(middlewares, input, callback, uid){
		if(!_.isArray(middlewares)) middlewares = [middlewares];
		async.reduce(middlewares, input, function(value, middleware, middlewareDone){
			middleware(value, function(e, middlewareOutput){
				middlewareDone(e, middlewareOutput||value);
			}, uid)
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
				}, uid)
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