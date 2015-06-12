/* requirejs build-only plugin overloads require-less and then autoprefixes css */
define(['less-builder'], function(less){
	var postcss = require.nodeRequire('postcss');
	var autoprefixer = require.nodeRequire('autoprefixer-core');
	var deasync = require.nodeRequire('deasync'); //yes we actually need it
	var mless = {};
	for(var prop in less){
		if(prop != 'onLayerEnd') mless[prop] = less[prop];
		else mless[prop] = function(write, data){ /* overload less.onLayerEnd */
			/* call original function with modified write function */
			less[prop].call(this, function(content){
				var ocss = content.match(/\('(.*)'\);\n$/)[1]; //parse out css from require-less's output
				var done = false;
				postcss([autoprefixer]).process(content.match(/\('(.*)'\);\n$/)[1]).then(function(result){
					content = content.replace(ocss, result.css);
					done = true;
				});
				/* here we have to halt syncrouous operation due to the design
				 of r.js, write cannot be called asyncronously  see:
				 https://github.com/jrburke/r.js/blob/df7531c54e04c04f8c19c236870a0e9c3791a70a/build/jslib/build.js#L1964 */
				deasync.loopWhile(function(){return !done;});
				write(content);
			}, data);
		};
	}
	return mless;
})