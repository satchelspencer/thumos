define({
	transform : function(text, path, config, callback){
		callback(null, 'define('+JSON.stringify(text)+')');
	}
})