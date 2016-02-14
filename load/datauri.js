define(function(raw, path, config, callback){
	var uri = nodeRequire('datauri')(path);
	callback(null, 'define('+JSON.stringify(uri)+')');
})