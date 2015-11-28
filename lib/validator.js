/* validate a set of `models`, given the set definition `set` */
define(function(set, typedProps){
	var async = require('async');
	return function(models, cb, update){ //update bool if to allow database-only properties, as well as not include all props
		if(models.constructor !== Array) models = [models]; //default to array
		async.mapSeries(models, function(data, callback){
			/* check that data only contains props defined in model, and contains all */
			var dbOnly = update?['_id']:[]; //dbonly properties to ignore in model
			var props = set.properties;
			var dataProps = _.keys(data);
			var modelProps = _.keys(props).concat(dbOnly);
			var optionalProps = _.filter(_.keys(props), function(propName){
				return props[propName].optional;
			});
			var unexpected = _.difference(dataProps, modelProps);
			var missing = _.difference(_.difference(modelProps, optionalProps), dataProps); //ignore optional props in missing
			var dbMissing = _.difference(dbOnly, dataProps);
			var error = {};
			/* catch unxecpected props */
			if(unexpected.length) error.unexpected = unexpected;
			/* catch missing props if !update */
			if(!update && missing.length) error.missing = missing;
			/* update requires all db properties */
			if(update && dbMissing.length) error.missing = dbMissing;
			/* updating requires at least one model prop to be set */
			if(update && !_.intersection(_.keys(props), dataProps).length) error.empty = true;
			/* check for errors */
			if(_.keys(error).length){
				error.index = models.indexOf(data);
				callback(error);
			/* now iterate over all the data props that are modelProps and ignore the db props */
			}else async.reduce(_.difference(dataProps, dbOnly), {}, function(output, propName, cbProp){ //output starts as an empty object
				if(_.has(typedProps, propName)){ //if typedProp
					var encode = typedProps[propName].encode||function(inp, cb){cb(null, inp)};
					encode(data[propName], function(e, encoded){
						if(e || !typedProps[propName].finalize) next(e, encoded); //error or no finalize step
						else typedProps[propName].finalize(encoded, next); //must finalize 
					});
				}else next(null, data[propName]); //untyped
				function next(e, startValue) {
					if(e) cbProp(e);
					else{
						var validators = props[propName].valid || props[propName];
						if(validators.constructor !== Array) validators = [validators];
						async.reduce(validators, startValue, function(value, validator, cbValidator){
							if(_.isFunction(validator)) validator(value, function (e, newValue) {
								cbValidator(e, newValue || value);
							}, output);
							else cbValidator(null, value);
						}, function(e, value){
							if(e){
								var message = e;
								e = {};
								e[propName] = message;
							}
							output[propName] = value;
							valid(e, output);
						});
					}
				}
				function valid(e, output) {
					if(e || !props[propName].onchange) cbProp(e, output);
					else props[propName].onchange(output, function (e, o) {
						cbProp(e, o || output);
					});
				}
			}, function(e, m){
				if(e) callback(e);
				else{
					/* add back in the db only */
					dbOnly.forEach(function(dprop){
						if(data[dprop]) m[dprop] = data[dprop];
					});
					callback(e, m);
				}
			});
		}, cb);
	}
})