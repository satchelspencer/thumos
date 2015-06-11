define(['less-builder'], function(less){
	var postcss = require.nodeRequire('postcss');
	var autoprefixer = require.nodeRequire('autoprefixer-core');
	var deasync = require.nodeRequire('deasync');
	var mless = {};
	for(var prop in less){
		if(prop != 'onLayerEnd') mless[prop] = less[prop];
		else mless[prop] = function(write, data){
			less[prop].call(this, function(content){
				var ocss = content.match(/\('(.*)'\);\n$/)[1];
				var done = false;
				postcss([autoprefixer]).process(content.match(/\('(.*)'\);\n$/)[1]).then(function(result){
					content = content.replace(ocss, result.css);
					done = true;
				});
				deasync.loopWhile(function(){return !done;});
				write(content);
			}, data);
		};
	}
	return mless;
})