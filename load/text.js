define({
	transform : function(text, path, callback){
		callback(null, 'define('+JSON.stringify(text)+')');
	}
})