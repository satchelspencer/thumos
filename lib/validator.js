/* takes model, data and parent set, returns a model api */
define(['async'], function(async){
	return function(set){
		var model = set.model||{};
		return function(data, callback){
			/* check that data only contains props defined in model, and contains all */
			var unexpected = [];
			var missing = [];
			for(var prop in data) if(!model[prop]) unexpected.push(prop);
			for(var prop in model) if(!data[prop]) missing.push(prop);
			if(unexpected.length || missing.length) callback({
				missing : missing,
				unexpected : unexpected
			});
			else async.reduce(Object.keys(model), {}, function(output, propName, cbProp){ //output starts as an empty object
				/* allow validator(s) to be stored inder prop.valid or default to being the value of the prop */
				var validators = model[propName].valid||model[propName]; 
				if(validators.constructor !== Array) validators = [validators]; //force the validator to be part of an array for mad iteration
				async.reduce(validators, data[propName], function(value, validator, cbValidator){
					validator(value, function(e, newValue){
						cbValidator(e, newValue||value) //if not replaced, continue with old value
					});
				}, function(e, value){
					output[propName] = value;
					cbProp(e, output);
				});
			}, callback);
		}	
	}
});