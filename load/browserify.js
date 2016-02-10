/* bullshit magic */
define({
	transform : function(raw, p, callback){
		var path = nodeRequire('path');
		var derequire = nodeRequire('derequire');
		var browserify = nodeRequire('browserify')();
		var through = nodeRequire('through');

		browserify.transform(function(file){
			var data = '';
		    return through(function(buf){
		   		data += buf
		   	}, function(){
		    	data = "_require = require;"+data;
		        this.queue(data);
		        this.queue(null);
		    });		    
		})
		browserify.add(p);
		browserify.bundle(function(e, s){
			var source = "define({factory : true}, function(){\
				var _require;\
				"+derequire(s.toString())+"\
				return _require('1')\
			})";
			callback(e, source);
		});
	}
})