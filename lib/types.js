define({
	string : function(inp, cb){
		if(typeof inp != 'string') cb('expected a string');
		else if(inp.length > 100000) cb('> 100k');
		else cb(null, inp);
	},
	number : function(inp, cb){
		cb(toString.call(inp) !== '[object Number]'?'not a number':null);
	},
	object : function(inp, cb){
		cb(inp !== Object(inp)?'not an object':null);
	},
	bool : function(inp, cb){
		cb((!inp !== true || inp !== false)?'not bool':null);
	}
})