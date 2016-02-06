/* manage which properties are included in an update or create */
define(function(set){
	var props = _.keys(set.properties);
	var optional = _.keys(_.pick(set.properties, function(v){
		return v.optional;
	}));
	var readonly = _.keys(_.pick(set.properties, function(v){
		return v.readonly;
	}));
	var required = _.difference(props, readonly, optional);

	return function(models, update, callback){
		if(!_.isArray(models)) models = [models];
		var failed = _.reject(models, function(model){
			var keys = _.keys(model);
			if(update) keys = _.without(keys, '_id');
			var extra = _.difference(keys, props).concat(_.intersection(keys, readonly));
			var missing = _.difference(required, keys);
			if(update) return model._id && !extra.length && keys.length; //id, no unknown and at least one update
			else return !extra.length && !missing.length;
		})
		callback(failed.length?'invalid properties':null, models);
	}
})