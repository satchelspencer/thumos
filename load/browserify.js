/* bullshit magic */
define({
	transform : function(raw, p, config, callback){
		var path = nodeRequire('path');
		var derequire = nodeRequire('derequire');
		var browserify = nodeRequire('browserify')({
			fullPaths : true //preserve path names for later reference
		});
		var through = nodeRequire('through');

		/* append primary file with reference to require */
		browserify.transform(function(file){
			if(file != p) return through(); //not primary file, just passit
			var data = '';
		    return through(function(buf){
		   		data += buf
		   	}, function(){
		   		/* add 'global' */
		    	data = "_require = require;"+data;
		        this.queue(data);
		        this.queue(null);
		    });		    
		})
		browserify.add(p);
		browserify.bundle(function(e, s){
			/* source catches require from browserify closure and returns require(path) */
			var source = "define({factory : true}, function(){\
				var _require;\
				"+derequire(s.toString())+"\
				return _require('"+p+"')\
			})";
			callback(e, source);
		});
	}
})