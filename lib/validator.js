/* takes model, data and parent set, returns a model api */
define(['async'], function(async){
	return function(set, types){
		var model = set.model||{};
		return function(models, cb, update){ //update bool if to allow database-only properties, as well as not include all props
			if(models.constructor !== Array) models = [models];
			async.mapSeries(models, function(data, callback){
				/* check that data only contains props defined in model, and contains all */
				var dbOnly = update?['_id']:[]; //properties to ignore in model
				var path = set.path||'/'+set.name;
				var props = model.properties;
				var dataProps = _.keys(data);
				var modelProps = _.keys(props).concat(dbOnly);
				var unexpected = _.difference(dataProps, modelProps);
				var missing = _.difference(modelProps, dataProps);
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
				/* now iterate over all the data props that are modelProps and ignore the bin props */
				}else async.reduce(_.difference(dataProps, dbOnly), {}, function(output, propName, cbProp){ //output starts as an empty object
					if(props[propName].type){
						/* we're on client side. whatevea encode it */
						if(!types) props[propName].type.encode(data[propName], function(e, en){
							if(e) cbProp(e);
							else next(en);
						});
						else types[props[propName].type.name].finalize(data[propName], function(e, finalval){
							if(e) cbProp(e);
							else next(finalval);
						});
					}else next(data[propName]);
					function next(startValue){
						/* allow validator(s) to be stored under prop.valid or default to being the value of the prop */
						var validators = props[propName].valid||props[propName]; 
						if(validators.constructor !== Array) validators = [validators]; //force the validator to be part of an array for mad iteration
						async.reduce(validators, startValue, function(value, validator, cbValidator){
							if(_.isFunction(validator)) validator(value, function(e, newValue){
								cbValidator(e, newValue||value) //if not replaced, continue with old value
							});
							else cbValidator(null, value);
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
					}
				}, function(e, m){
					/* add back in the db only */
					dbOnly.forEach(function(dprop){
						if(data[dprop]) m[dprop] = data[dprop];
					});
					callback(e, m);
				});
			}, cb);
		}
	}
});