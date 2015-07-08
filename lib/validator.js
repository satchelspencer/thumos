/* takes model, data and parent set, returns a model api */
define(['async'], function(async){
	return function(set){
		var model = set.model||{};
		return function(models, cb, dbProps){ //dbProps bool if to allow database-only properties in valid
			if(models.constructor !== Array) models = [models];
			async.mapSeries(models, function(data, callback){
				/* check that data only contains props defined in model, and contains all */
				var dbOnly = dbProps?['_id']:[]; //properties to ignore in model
				var props = model.properties;
				var dataProps = _.keys(data);
				var modelProps = _.keys(props).concat(dbOnly);
				var unexpected = _.difference(dataProps, modelProps);
				var missing = _.difference(modelProps, dataProps);
				if(unexpected.length || missing.length) callback({
					index : models.indexOf(data),
					missing : missing,
					unexpected : unexpected
				});
				else async.reduce(Object.keys(props), {}, function(output, propName, cbProp){ //output starts as an empty object
					/* allow validator(s) to be stored inder prop.valid or default to being the value of the prop */
					var validators = props[propName].valid||props[propName]; 
					if(validators.constructor !== Array) validators = [validators]; //force the validator to be part of an array for mad iteration
					async.reduce(validators, data[propName], function(value, validator, cbValidator){
						validator(value, function(e, newValue){
							cbValidator(e, newValue||value) //if not replaced, continue with old value
						});
					}, function(e, value){
						/* if we have an error passit along with its prop : message */
						if(e){
							var message = e;
							e = {};
							e[propName] = message;
						}
						output[propName] = value;
						cbProp(e, output);
					});
				}, function(e, m){
					dbOnly.forEach(function(dprop){
						if(data[dprop]) m[dprop] = data[dprop];
					});
					callback(e, m);
				});
			}, cb);
		}
	}
});