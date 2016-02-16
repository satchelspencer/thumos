define({
	transform : function(raw, p, config, callback){
		var fs = nodeRequire('fs');
		var requirejs = nodeRequire('requirejs');
		var path = nodeRequire('path');
		var underscore = require(underscore);
		var derequire = nodeRequire('derequire');
		p = p.replace(/.js$/i, '');
		var tmp = 'tmp/almondtmp.js'; // maybe need a bilt wide tmp path getter 

		var rconfig = {
			baseUrl : '.',
		    name : path.relative('.', nodeResolve('almond')),
		    include : [p],
		    insertRequire : [p],
		    out : tmp,
		    wrap : false,
		    nodeRequire : nodeRequire
		};
		if(config.amdconfig) rconfig = _.extend(rconfig, config.amdconfig)
		var error;

		try{
			requirejs.optimize(rconfig, function(res){
				if(!error) fs.readFile(tmp, 'utf8', function(re, outstr){
					fs.unlink(tmp,function(e){
						if(e||re) callback(e||re);
						else{
							var source = "define({factory : true}, function(){\
								"+outstr+"\
								return require('"+(config.require||p)+"')\
							})";
							callback(null, derequire(source, [
								{
							    	from: 'require',
							    	to: '_dereq_'
								},
							  	{
							    	from: 'define',
							    	to: '_defi_'
							  	}
							]));
						}
					});
				});
			}, function(e){
				error = e;
				callback(e);
			})
		}catch(e){
			callback(e);	
		}
		
	}
})