define({
	transform : function(csstext, path, config, callback){
		nodeRequire('less').render(csstext, function (e, css) {
			if(e) callback(e);
			else nodeRequire('postcss')([nodeRequire('autoprefixer-core')]).process(css).then(function(res){
				var css = nodeRequire('sqwish').minify(res.css);
				callback(null, 'define('+JSON.stringify(css)+')');
			});
		});
	},
	init : function(csstext){
		/* append tag with css */
		var tag = document.createElement('style');
		tag.type = 'text/css';
		tag.innerHTML = csstext;
		document.getElementsByTagName('head')[0].appendChild(tag);
	}
});