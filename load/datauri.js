define(function(raw, path, callback){
	var uri = nodeRequire('datauri')(path);
	callback(null, 'define('+JSON.stringify(uri)+')');
})